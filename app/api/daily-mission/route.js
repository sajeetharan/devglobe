import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { getSession } from '../../../lib/auth.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import { isAllowedMutationOrigin } from '../../../lib/request-origin.js';
import { normalizeContributionPreferences, rankContributionOpportunities } from '../../../lib/contribution-opportunities.js';
import { ContributionOpportunitiesUnavailableError, fetchGitHubContributionCandidates } from '../../../lib/github-contribution-opportunities.js';
import { acquireDailyMissionLease, getContributionOpportunityStateContainer, reserveGlobalRecommendationRefresh } from '../../../lib/contribution-opportunity-store.js';
import {
  DailyMissionError,
  addCompletedMission,
  activeDailyMission,
  applyMissionAction,
  applyMissionProgress,
  MISSION_PROGRESS_ACTIONS,
  cachedMissionPool,
  missionDay,
  prioritizeMissionOpportunity,
  selectDailyMission,
} from '../../../lib/daily-mission.js';
import { findFirstMaintainerReply, MissionVerificationUnavailableError, verifyGitHubMissionCompletion, verifyGitHubMissionProgress, parseMissionIssueUrl } from '../../../lib/github-mission-verification.js';
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

  const applyChecked = mission => {
    const result = checked.get(mission?.id);
    return result ? {
      ...mission, maintainerReplyCheckedAt: result.maintainerReplyCheckedAt,
      ...(result.maintainerReply ? { maintainerReply: result.maintainerReply } : {}),
    } : mission;
  };
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

async function getDailyMission(request, dependencies = {}) {
  const ownerLoader = dependencies.loadOwner || loadOwner;
  const refreshReplies = dependencies.refreshReplies || refreshMaintainerReplies;
  const reserveRefresh = dependencies.reserveRefresh || reserveGlobalRecommendationRefresh;
  const fetchCandidates = dependencies.fetchCandidates || fetchGitHubContributionCandidates;
  const patchState = dependencies.patchMissionState || patchMissionState;
  const recordAcceptance = dependencies.recordAcceptance || recordMissionAcceptanceActivity;
  const clock = dependencies.now || (() => new Date());
  try {
    const owner = await ownerLoader();
    if (owner.error) return owner.error;
    const now = clock();
    const day = missionDay(now);
    const requestUrl = new URL(request.url);
    const savedIssueUrl = requestUrl.searchParams.get('savedIssueUrl') || '';
    if (savedIssueUrl && !parseMissionIssueUrl(savedIssueUrl)) {
      return NextResponse.json({ error: 'Invalid saved contribution URL' }, { status: 400 });
    }
    const previewLogin = requestUrl.searchParams.get('previewLogin')?.trim().toLowerCase() || '';
    const previewIssueId = requestUrl.searchParams.get('previewIssueId')?.trim() || '';
    const canRestorePreview = previewLogin === owner.developer.login.toLowerCase()
      && PREVIEW_ISSUE_ID_PATTERN.test(previewIssueId);
    const initialState = owner.developer.contributionOpportunity || {};
    const refreshed = await refreshReplies(owner.container, owner.developer, initialState, now);
    const state = refreshed.state;
    const activeMission = activeDailyMission(state.dailyMission, now);
    const canReplaceActiveMission = activeMission?.status === 'offered'
      && (canRestorePreview || Boolean(savedIssueUrl));
    if (activeMission && !canReplaceActiveMission) {
      await recordAcceptance(owner.developer, state.dailyMission);
      return missionResponse(state.dailyMission, {
        completedMissions: completedMissions(state),
        maintainerReplies: refreshed.replies,
        restoredPreview: canRestorePreview && state.dailyMission.issueId === previewIssueId,
        previewRestoreAttempted: canRestorePreview,
        restoredSaved: false,
        savedRestoreAttempted: Boolean(savedIssueUrl),
      });
    }

    if (savedIssueUrl) {
      const retryAfterSeconds = await reserveRefresh(owner.stateContainer, now);
      if (retryAfterSeconds > 0) return missionResponse(null, { unavailable: true, retryAfterSeconds });
      const savedPreferences = previewPreferences(owner.developer);
      const candidates = await fetchCandidates(savedPreferences, {
        token: process.env.GITHUB_TOKEN, now, issueUrl: savedIssueUrl,
      });
      const opportunities = rankContributionOpportunities(candidates, savedPreferences, [], now);
      if (opportunities.length === 0) {
        return NextResponse.json({ error: 'Your saved issue is no longer contribution-ready. It may be assigned, closed, stale, or outside beginner scope. Remove it or choose another issue.' }, { status: 422 });
      }
      const updated = await patchState(owner.container, owner.developer, current => {
        const active = activeDailyMission(current.dailyMission, now);
        if (active && active.status !== 'offered') return current;
        return { ...current, dailyMission: selectDailyMission(opportunities, { login: owner.developer.login, now }) };
      });
      return missionResponse(updated.dailyMission, {
        completedMissions: completedMissions(updated), maintainerReplies: refreshed.replies,
        restoredSaved: updated.dailyMission?.opportunity.url === savedIssueUrl, savedRestoreAttempted: true,
      });
    }

    let pool = state.dailyMissionPool?.day === day ? state.dailyMissionPool.opportunities : null;
    const missionPreferences = preferences(owner.developer);
    if (pool === null) pool = cachedMissionPool(state, missionPreferences, now);
    if (pool === null) {
      const acquiredLease = await acquireDailyMissionLease(owner.stateContainer, owner.developer.login, day, now);
      if (!acquiredLease) return missionResponse(null, { unavailable: true, retryAfterSeconds: 2 });
      const retryAfterSeconds = await reserveRefresh(owner.stateContainer, now);
      if (retryAfterSeconds > 0) return missionResponse(null, { unavailable: true, retryAfterSeconds });
      const candidates = await fetchCandidates(missionPreferences, { token: process.env.GITHUB_TOKEN, now });
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

    const updated = await patchState(owner.container, owner.developer, current => {
      const currentMission = activeDailyMission(current.dailyMission, now);
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

export function createDailyMissionGetHandler(dependencies = {}) {
  return request => getDailyMission(request, dependencies);
}

export const GET = createDailyMissionGetHandler();

async function postDailyMission(request, dependencies = {}) {
  const ownerLoader = dependencies.loadOwner || loadOwner;
  const patchState = dependencies.patchMissionState || patchMissionState;
  const verifyCompletion = dependencies.verifyCompletion || verifyGitHubMissionCompletion;
  const verifyProgress = dependencies.verifyProgress || verifyGitHubMissionProgress;
  const recordAcceptance = dependencies.recordAcceptance || recordMissionAcceptanceActivity;
  const clock = dependencies.now || (() => new Date());
  try {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
    }
    if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Cross-origin mutation denied' }, { status: 403 });
    const owner = await ownerLoader();
    if (owner.error) return owner.error;
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'Invalid mission action' }, { status: 400 });
    }
    const { action, missionId, blocker, localProgress } = input;
    const now = clock();
    const day = missionDay(now);
    let completionEvidence;
    let progressVerification;
    if (MISSION_PROGRESS_ACTIONS.includes(action)) {
      if (action === 'verify_progress') {
        const current = owner.developer.contributionOpportunity?.dailyMission;
        applyMissionProgress(current, 'started', { now, missionId });
        progressVerification = await verifyProgress(current, owner.developer.login, { token: process.env.GITHUB_TOKEN });
        if (!progressVerification.submitted && !progressVerification.completed && !progressVerification.closed) {
          return NextResponse.json({ error: 'No open, non-draft PR authored by you and linked to this issue was found since acceptance. Link the issue from your PR, then try again.' }, { status: 422 });
        }
      }
    }
    if (action === 'complete') {
      applyMissionAction(owner.developer.contributionOpportunity?.dailyMission, action, now, missionId);
      const verification = await verifyCompletion(
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
    const acceptedAt = owner.developer.contributionOpportunity?.dailyMission?.acceptedAt;
    const updated = await patchState(owner.container, owner.developer, current => {
      if ((completionEvidence || progressVerification) && current.dailyMission?.acceptedAt !== acceptedAt) {
        throw new DailyMissionError('Mission changed. Refresh and try again');
      }
      let changedMission = MISSION_PROGRESS_ACTIONS.includes(action)
        ? applyMissionProgress(current.dailyMission, action, { now, missionId, blocker, verification: progressVerification })
        : applyMissionAction(current.dailyMission, action, now, missionId);
      if (action === 'accept') {
        if (localProgress?.guideRead === true) changedMission = applyMissionProgress(changedMission, 'read_guide', { now, missionId });
        if (localProgress?.started === true) changedMission = applyMissionProgress(changedMission, 'started', { now, missionId });
      }
      const changed = completionEvidence
        ? { ...changedMission, completionEvidence: { ...completionEvidence, verifiedAt: now.toISOString() } }
        : changedMission;
      const issueIds = current.dailyMissionHistory?.day === day ? current.dailyMissionHistory.issueIds : [];
      const history = action === 'pass'
        ? { day, issueIds: [...new Set([...issueIds, changed.issueId])].slice(-8) }
        : current.dailyMissionHistory;
      responseMission = action === 'pass'
        ? selectDailyMission(current.dailyMissionPool?.day === day ? current.dailyMissionPool.opportunities : [], {
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
    if (action === 'accept') await recordAcceptance(owner.developer, updated.dailyMission);
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

export function createDailyMissionPostHandler(dependencies = {}) {
  return request => postDailyMission(request, dependencies);
}

export const POST = createDailyMissionPostHandler();