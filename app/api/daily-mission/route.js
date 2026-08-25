import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import { isAllowedMutationOrigin } from '../../../lib/request-origin.js';
import { normalizeContributionPreferences, rankContributionOpportunities } from '../../../lib/contribution-opportunities.js';
import { ContributionOpportunitiesUnavailableError, fetchGitHubContributionCandidates } from '../../../lib/github-contribution-opportunities.js';
import { acquireDailyMissionLease, getContributionOpportunityStateContainer, reserveGlobalRecommendationRefresh } from '../../../lib/contribution-opportunity-store.js';
import { DailyMissionError, applyMissionAction, cachedMissionPool, missionDay, selectDailyMission } from '../../../lib/daily-mission.js';
import { MissionVerificationUnavailableError, verifyGitHubMissionCompletion } from '../../../lib/github-mission-verification.js';

async function getOwner(container, login) {
  const { resources } = await container.items.query({
    query: 'SELECT TOP 1 * FROM c WHERE LOWER(c.login) = @login AND c.claimed = true',
    parameters: [{ name: '@login', value: login.toLowerCase() }],
  }).fetchAll();
  return resources[0] || null;
}

async function loadOwner() {
  const session = await getSession();
  if (!session?.login) return { error: NextResponse.json({ error: 'Sign in to receive a daily mission' }, { status: 401 }) };
  const container = getCosmosContainer();
  const stateContainer = getContributionOpportunityStateContainer();
  if (!container || !stateContainer) return { error: NextResponse.json({ error: 'Daily missions are unavailable' }, { status: 503 }) };
  const developer = await getOwner(container, session.login);
  if (!developer) return { error: NextResponse.json({ error: 'Claim your profile to receive a daily mission', login: session.login }, { status: 403 }) };
  return { container, stateContainer, developer };
}

function fallbackLanguages(developer) {
  const languages = (developer.languages || []).map(language => language?.name).filter(Boolean);
  return languages.length ? languages : [developer.topLanguage].filter(Boolean);
}

function preferences(developer) {
  return normalizeContributionPreferences(developer.contributionOpportunity?.preferences || {}, fallbackLanguages(developer));
}

async function patchMissionState(container, developer, update) {
  let current = developer;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const contributionOpportunity = update(current.contributionOpportunity || {}, current);
    try {
      await container.item(current.id, current.location).patch([
        { op: 'set', path: '/contributionOpportunity', value: contributionOpportunity },
      ], { accessCondition: { type: 'IfMatch', condition: current._etag } });
      return contributionOpportunity;
    } catch (error) {
      if (attempt > 0 || ![412].includes(error.code || error.statusCode)) throw error;
      current = await getOwner(container, current.login);
      if (!current) throw error;
    }
  }
}

function missionResponse(mission, extra = {}) {
  return NextResponse.json({ mission, ...extra }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET() {
  try {
    const owner = await loadOwner();
    if (owner.error) return owner.error;
    const now = new Date();
    const day = missionDay(now);
    const state = owner.developer.contributionOpportunity || {};
    if (state.dailyMission?.day === day && state.dailyMission.status !== 'passed') {
      return missionResponse(state.dailyMission);
    }

    let pool = state.dailyMissionPool?.day === day ? state.dailyMissionPool.opportunities : null;
    const missionPreferences = preferences(owner.developer);
    if (pool === null) pool = cachedMissionPool(state, missionPreferences, now);
    if (pool === null) {
      const acquiredLease = await acquireDailyMissionLease(owner.stateContainer, owner.developer.login, day, now);
      if (!acquiredLease) return missionResponse(null, { unavailable: true, retryAfterSeconds: 2 });
      const retryAfterSeconds = await reserveGlobalRecommendationRefresh(owner.stateContainer, now);
      if (retryAfterSeconds > 0) return missionResponse(null, { unavailable: true, retryAfterSeconds });
      const candidates = await fetchGitHubContributionCandidates(missionPreferences, { token: process.env.GITHUB_TOKEN, now });
      pool = rankContributionOpportunities(candidates, missionPreferences, [], now);
    }

    const updated = await patchMissionState(owner.container, owner.developer, current => {
      if (current.dailyMission?.day === day && current.dailyMission.status !== 'passed') return current;
      const excludedIssueIds = current.dailyMissionHistory?.day === day ? current.dailyMissionHistory.issueIds : [];
      const mission = selectDailyMission(pool, { login: owner.developer.login, now, excludedIssueIds });
      return {
        ...current,
        dailyMission: mission,
        dailyMissionPool: { day, opportunities: pool },
      };
    });
    return missionResponse(updated.dailyMission);
  } catch (error) {
    if (error instanceof ContributionOpportunitiesUnavailableError) return missionResponse(null, { unavailable: true });
    console.error('Daily mission read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load today’s mission' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
    }
    if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Cross-origin mutation denied' }, { status: 403 });
    const owner = await loadOwner();
    if (owner.error) return owner.error;
    const { action, missionId } = await request.json();
    const now = new Date();
    const day = missionDay(now);
    let completionEvidence;
    if (action === 'complete') {
      applyMissionAction(owner.developer.contributionOpportunity?.dailyMission, action, now, missionId);
      const verification = await verifyGitHubMissionCompletion(
        owner.developer.contributionOpportunity.dailyMission,
        owner.developer.login,
        { token: process.env.GITHUB_TOKEN },
      );
      if (!verification.completed) {
        return NextResponse.json(
          { error: verification.reason, verification },
          { status: 422, headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
      completionEvidence = verification.evidence;
    }
    let responseMission;
    const updated = await patchMissionState(owner.container, owner.developer, current => {
      const changedMission = applyMissionAction(current.dailyMission, action, now, missionId);
      const changed = completionEvidence
        ? { ...changedMission, completionEvidence: { ...completionEvidence, verifiedAt: now.toISOString() } }
        : changedMission;
      const issueIds = current.dailyMissionHistory?.day === day ? current.dailyMissionHistory.issueIds : [];
      const history = action === 'pass'
        ? { day, issueIds: [...new Set([...issueIds, changed.issueId])].slice(-8) }
        : current.dailyMissionHistory;
      responseMission = action === 'pass'
        ? selectDailyMission(current.dailyMissionPool?.opportunities || [], {
          login: owner.developer.login,
          now,
          excludedIssueIds: history.issueIds,
        })
        : changed;
      return { ...current, dailyMission: responseMission, dailyMissionHistory: history };
    });
    return missionResponse(updated.dailyMission);
  } catch (error) {
    if (error instanceof MissionVerificationUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (error instanceof DailyMissionError || error instanceof SyntaxError) {
      const status = error instanceof DailyMissionError && error.message !== 'Unsupported mission action' ? 409 : 400;
      return NextResponse.json({ error: error.message || 'Invalid mission action' }, { status });
    }
    console.error('Daily mission update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update today’s mission' }, { status: 500 });
  }
}