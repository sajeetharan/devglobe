export const PENDING_MISSION_KEY = 'devglobe-pending-mission:v1';
export const PENDING_MISSION_MAX_AGE_MS = 15 * 60 * 1000;

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const ISSUE_ID_PATTERN = /^[a-z\d:_-]{1,120}$/i;

export function createPendingMission({ login, issueId, createdAt = Date.now() }) {
  const normalizedLogin = String(login || '').trim().replace(/^@/, '').toLowerCase();
  const normalizedIssueId = String(issueId || '').trim();
  if (!LOGIN_PATTERN.test(normalizedLogin) || !ISSUE_ID_PATTERN.test(normalizedIssueId)) return null;
  return { login: normalizedLogin, issueId: normalizedIssueId, createdAt };
}

export function parsePendingMission(value, { now = Date.now(), maxAgeMs = PENDING_MISSION_MAX_AGE_MS } = {}) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const pending = createPendingMission(parsed || {});
    if (!pending || !Number.isFinite(parsed.createdAt)) return null;
    if (parsed.createdAt > now || now - parsed.createdAt > maxAgeMs) return null;
    return { ...pending, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}
