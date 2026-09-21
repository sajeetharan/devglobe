import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import { isAllowedMutationOrigin } from '../../../lib/request-origin.js';
import { normalizeContributionPreferences, rankContributionOpportunities } from '../../../lib/contribution-opportunities.js';
import { ContributionOpportunitiesUnavailableError, fetchGitHubContributionCandidates } from '../../../lib/github-contribution-opportunities.js';
import { acquireDailyMissionLease, getContributionOpportunityStateContainer, reserveGlobalRecommendationRefresh } from '../../../lib/contribution-opportunity-store.js';
import {
  DailyMissionError,
  addCompletedMission,
  applyMissionAction,
  cachedMissionPool,
  missionDay,
  prioritizeMissionOpportunity,
  selectDailyMission,
} from '../../../lib/daily-mission.js';
import { findFirstMaintainerReply, MissionVerificationUnavailableError, verifyGitHubMissionCompletion } from '../../../lib/github-mission-verification.js';
import { saveActivities } from '../../../lib/activity-store.js';
import { createPlatformActivity } from '../../../lib/platform-activity.js';
import { previewPreferences } from '../../../lib/mission-preview.js';
import { readMissionPreviewPool } from '../../../lib/mission-preview-pool.js';

const REPLY_WATCH_MS = 30 * 24 * 60 * 60 * 1000;
const REPLY_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const REPLY_CHECK_LIMIT = 3;
const PREVIEW_ISSUE_ID_PATTERN = /^[a-z\d:_-]{1,120}$/i;

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

function completedMissions(state) {
  return Array.isArray(state?.completedMissions) ? state.completedMissions : [];
}

function replyWatchEligible(mission, now) {
  const acceptedAt = Date.parse(mission?.acceptedAt);
  return ['accepted', 'completed'].includes(mission?.status)
    && !mission.maintainerReply
    && Number.isFinite(acceptedAt)
    && now.getTime() - acceptedAt <= REPLY_WATCH_MS;
}

async function refreshMaintainerReplies(container, developer, state, now) {
  const candidates = [
    ...(Array.isArray(state.replyWatchMissions) ? state.replyWatchMissions : []),
    ...completedMissions(state),
    state.dailyMission,
  ];
  const due = [...new Map(candidates.filter(Boolean).map(mission => [mission.id, mission])).values()]
    .filter(mission => replyWatchEligible(mission, now))
    .filter(mission => {
      const checkedAt = Date.parse(mission.maintainerReplyCheckedAt);
      return !Number.isFinite(checkedAt) || now.getTime() - checkedAt >= REPLY_CHECK_INTERVAL_MS;
    })
    .sort((left, right) => {
      const leftCheckedAt = Date.parse(left.maintainerReplyCheckedAt);
      const rightCheckedAt = Date.parse(right.maintainerReplyCheckedAt);
      return (Number.isFinite(leftCheckedAt) ? leftCheckedAt : 0) - (Number.isFinite(rightCheckedAt) ? rightCheckedAt : 0);
    })
    .slice(0, REPLY_CHECK_LIMIT);
  if (due.length === 0) return { state, replies: [] };

  const checked = new Map();
  for (const mission of due) {
    try {
      const reply = await findFirstMaintainerReply(mission, developer.login, { token: process.env.GITHUB_TOKEN });
      checked.set(mission.id, {
        ...mission,
        maintainerReplyCheckedAt: now.toISOString(),
        ...(reply ? {
          maintainerReply: {
            ...reply,
            telemetryKey: createHash('sha256').update(mission.id).digest('base64url'),
          },
        } : {}),
      });
    } catch (error) {
      if (!(error instanceof MissionVerificationUnavailableError)) throw error;
      console.error('Maintainer reply check unavailable:', error.message);
    }
  }
  if (checked.size === 0) return { state, replies: [] };

  const applyChecked = mission => checked.get(mission?.id) || mission;
  const updated = await patchMissionState(container, developer, current => ({
    ...current,
    dailyMission: applyChecked(current.dailyMission),
    completedMissions: completedMissions(current).map(applyChecked),
    replyWatchMissions: (current.replyWatchMissions || [])
      .map(applyChecked)
      .filter(mission => replyWatchEligible(mission, now))
      .slice(0, 5),
  }));
  return {
    state: updated,
    replies: [...checked.values()].filter(mission => mission.maintainerReply).map(mission => ({
      missionId: mission.id,
      ...mission.maintainerReply,
    })),
  };
}

async function recordMissionAcceptanceActivity(developer, mission) {
  if (mission?.status !== 'accepted' || !mission.acceptedAt) return;
  try {
    await saveActivities([createPlatformActivity({
      id: `platform:mission-accepted:${mission.id}`,
      type: 'mission_accepted',
      login: developer.login,
      avatarUrl: developer.avatarUrl,
      now: new Date(mission.acceptedAt),
    })]);
  } catch (error) {
    console.error('Mission acceptance activity write failed:', error.message);
  }
}

export async function GET(request) {
  try {
    const owner = await loadOwner();
    if (owner.error) return owner.error;
    const now = new Date();
    const day = missionDay(now);
    const requestUrl = new URL(request.url);
    const previewLogin = requestUrl.searchParams.get('previewLogin')?.trim().toLowerCase() || '';
    const previewIssueId = requestUrl.searchParams.get('previewIssueId')?.trim() || '';
    const canRestorePreview = previewLogin === owner.developer.login.toLowerCase()
      && PREVIEW_ISSUE_ID_PATTERN.test(previewIssueId);
    const initialState = owner.developer.contributionOpportunity || {};
    const refreshed = await refreshMaintainerReplies(owner.container, owner.developer, initialState, now);
    const state = refreshed.state;
    const activeMission = state.dailyMission?.day === day && state.dailyMission.status !== 'passed'
      ? state.dailyMission
      : null;
    const canReplaceActiveMission = canRestorePreview && activeMission?.status === 'offered';
    if (activeMission && !canReplaceActiveMission) {
      await recordMissionAcceptanceActivity(owner.developer, state.dailyMission);
      return missionResponse(state.dailyMission, {
        completedMissions: completedMissions(state),
        maintainerReplies: refreshed.replies,
        restoredPreview: canRestorePreview && state.dailyMission.issueId === previewIssueId,
        previewRestoreAttempted: canRestorePreview,
      });
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
    const previewPool = canRestorePreview
      ? await readMissionPreviewPool(owner.stateContainer, previewPreferences(owner.developer), now)
      : null;
    const previewOpportunity = previewPool?.find(opportunity => String(opportunity?.id) === previewIssueId);
    const eligiblePool = previewOpportunity
      ? [previewOpportunity, ...pool.filter(opportunity => String(opportunity?.id) !== previewIssueId)]
      : pool;
    const prioritizedPool = canRestorePreview ? prioritizeMissionOpportunity(eligiblePool, previewIssueId) : eligiblePool;

    const updated = await patchMissionState(owner.container, owner.developer, current => {
      const currentMission = current.dailyMission?.day === day && current.dailyMission.status !== 'passed'
        ? current.dailyMission
        : null;
      if (currentMission && !(canRestorePreview && currentMission.status === 'offered')) return current;
      const excludedIssueIds = current.dailyMissionHistory?.day === day ? current.dailyMissionHistory.issueIds : [];
      const mission = selectDailyMission(prioritizedPool, { login: owner.developer.login, now, excludedIssueIds });
      const previousMission = current.dailyMission;
      const replyWatchMissions = replyWatchEligible(previousMission, now)
        ? [previousMission, ...(current.replyWatchMissions || []).filter(item => item.id !== previousMission.id)].slice(0, 5)
        : current.replyWatchMissions || [];
      return {
        ...current,
        dailyMission: mission,
        dailyMissionPool: { day, opportunities: prioritizedPool },
        replyWatchMissions,
      };
    });
    return missionResponse(updated.dailyMission, {
      completedMissions: completedMissions(updated),
      maintainerReplies: refreshed.replies,
      restoredPreview: canRestorePreview && updated.dailyMission?.issueId === previewIssueId,
      previewRestoreAttempted: canRestorePreview,
    });
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
      return {
        ...current,
        dailyMission: responseMission,
        dailyMissionHistory: history,
        completedMissions: action === 'complete'
          ? addCompletedMission(current.completedMissions, changed)
          : completedMissions(current),
      };
    });
    if (action === 'accept') await recordMissionAcceptanceActivity(owner.developer, updated.dailyMission);
    return missionResponse(updated.dailyMission, { completedMissions: completedMissions(updated) });
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