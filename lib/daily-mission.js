const MISSION_DURATION_MINUTES = 15;
const ACTIONS = new Set(['accept', 'pass', 'complete']);

export class DailyMissionError extends Error {}

export function missionDay(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function missionType(opportunity) {
  const text = [opportunity.title, ...(opportunity.labels || [])].join(' ').toLowerCase();
  if (/\b(documentation|docs|readme)\b/.test(text)) return 'Improve documentation';
  if (/\b(test|testing|coverage)\b/.test(text)) return 'Strengthen a test';
  if (/\b(reproduce|reproduction|bug|defect)\b/.test(text)) return 'Reproduce a bug';
  return 'Investigate a good first issue';
}

export function selectDailyMission(opportunities, { login, now = new Date(), excludedIssueIds = [] } = {}) {
  const day = missionDay(now);
  const excluded = new Set(excludedIssueIds.map(String));
  const opportunity = opportunities.find(candidate => !excluded.has(String(candidate.id)));
  if (!opportunity) return null;
  return {
    id: `${String(login).toLowerCase()}:${day}:${opportunity.id}`,
    day,
    issueId: String(opportunity.id),
    type: missionType(opportunity),
    durationMinutes: MISSION_DURATION_MINUTES,
    status: 'offered',
    offeredAt: new Date(now).toISOString(),
    opportunity,
  };
}

export function cachedMissionPool(state, preferences, now = new Date()) {
  const cacheKey = JSON.stringify(preferences);
  const expiresAt = Date.parse(state?.cache?.expiresAt);
  if (state?.cache?.key !== cacheKey || !Number.isFinite(expiresAt) || expiresAt <= new Date(now).getTime()) return null;
  return Array.isArray(state.cache.opportunities) ? state.cache.opportunities : null;
}

export function applyMissionAction(mission, action, now = new Date(), expectedMissionId = mission?.id) {
  if (!expectedMissionId || mission?.id !== expectedMissionId) throw new DailyMissionError('Mission changed. Refresh and try again');
  if (!mission || mission.day !== missionDay(now)) throw new DailyMissionError('Mission is no longer active');
  if (!ACTIONS.has(action)) throw new DailyMissionError('Unsupported mission action');
  if (action === 'accept' && mission.status !== 'offered') throw new DailyMissionError('Mission cannot be accepted');
  if (action === 'complete' && mission.status !== 'accepted') throw new DailyMissionError('Accept the mission before completing it');
  if (action === 'pass' && !['offered', 'accepted'].includes(mission.status)) throw new DailyMissionError('Mission cannot be passed');
  return {
    ...mission,
    status: action === 'accept' ? 'accepted' : action === 'complete' ? 'completed' : 'passed',
    [`${action === 'complete' ? 'completed' : `${action}ed`}At`]: new Date(now).toISOString(),
  };
}