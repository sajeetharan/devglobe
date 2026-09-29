export const PUBLIC_FEATURES = new Set(['search', 'mission', 'live']);

export function normalizePublicFeature(value) {
  return PUBLIC_FEATURES.has(value) ? value : 'search';
}

export function missionGitHubAuthUrl() {
  return `/api/auth/github?returnTo=${encodeURIComponent('/?feature=mission')}`;
}