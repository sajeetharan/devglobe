export const LEADERBOARD_PERIODS = [7, 30, 90];
export const LEADERBOARD_MOVEMENT_LIMIT = 100;

export function normalizeLeaderboardPeriod(value) {
  const period = Number.parseInt(value, 10);
  return LEADERBOARD_PERIODS.includes(period) ? period : 30;
}

export function buildRankMovement(developers, baselines) {
  const baselineByLogin = new Map(
    baselines.map(snapshot => [snapshot.login.toLowerCase(), snapshot])
  );

  return new Map(developers.map(developer => {
    const baseline = baselineByLogin.get(developer.login.toLowerCase());
    if (!baseline) return [developer.login.toLowerCase(), { status: 'new', delta: null }];
    if (!Number.isInteger(developer.globalRank) || !Number.isInteger(baseline.globalRank)) {
      return [developer.login.toLowerCase(), { status: 'unavailable', delta: null }];
    }
    const delta = baseline.globalRank - developer.globalRank;
    return [developer.login.toLowerCase(), {
      status: delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged',
      delta,
      previousRank: baseline.globalRank,
      day: baseline.day,
    }];
  }));
}

export function normalizeLeaderboardLogins(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map(login => login.trim().toLowerCase())
    .filter(login => /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(login)))]
    .slice(0, LEADERBOARD_MOVEMENT_LIMIT);
}