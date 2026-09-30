export const PUBLIC_FEATURES = new Set(['today', 'search', 'live']);
export const DAILY_COMPANION_KEY_PREFIX = 'devglobe-daily-companion:v1:';
const DESTINATION_PARAMS = ['add', 'country', 'dev', 'open', 'setup', 'similar'];

export function normalizePublicFeature(value) {
  return PUBLIC_FEATURES.has(value) ? value : 'search';
}

export function todayGitHubAuthUrl() {
  return `/api/auth/github?returnTo=${encodeURIComponent('/?feature=today')}`;
}

export function dailyCompanionVisitKey(login, now = new Date()) {
  const storageKey = dailyCompanionStorageKey(login);
  return storageKey ? `${storageKey}:${now.toISOString().slice(0, 10)}` : '';
}

export function dailyCompanionStorageKey(login) {
  const normalizedLogin = String(login || '').trim().toLowerCase();
  return normalizedLogin ? `${DAILY_COMPANION_KEY_PREFIX}${normalizedLogin}` : '';
}

export function shouldOpenDailyCompanion({ login, pathname = '/', searchParams, lastVisitKey = '', now = new Date() } = {}) {
  const visitKey = dailyCompanionVisitKey(login, now);
  if (!visitKey || pathname !== '/' || lastVisitKey === visitKey) return false;
  if (searchParams?.get?.('feature')) return false;
  return !DESTINATION_PARAMS.some(param => searchParams?.has?.(param));
}