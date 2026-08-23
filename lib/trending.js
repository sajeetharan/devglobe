// Trending developers (#24): who gained the most score over a 30-day window.
//
// Baseline is the most recent impact-history snapshot on or before the
// window's start day, per developer (see listLatestSnapshotsOnOrBeforeDay).
// Developers with no snapshot that old (new to tracking, or history capture
// hasn't run long enough yet) are surfaced separately as "new" risers rather
// than silently dropped.

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_GAINER_LIMIT = 25;
const DEFAULT_NEW_LIMIT = 8;

export function windowStartDay(windowDays = DEFAULT_WINDOW_DAYS, now = new Date()) {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

function rankIndicator(row) {
  if (row.isNew) return 'NEW';
  if (!Number.isInteger(row.rankDelta) || row.rankDelta === 0) return null;
  return row.rankDelta > 0 ? `↑${row.rankDelta}` : `↓${Math.abs(row.rankDelta)}`;
}

function toRow(developer, baseline) {
  const scoreDelta = baseline ? Number((developer.score - baseline.score).toFixed(2)) : null;
  const rankDelta = baseline && Number.isInteger(baseline.globalRank) && Number.isInteger(developer.globalRank)
    ? baseline.globalRank - developer.globalRank
    : null;
  const row = {
    login: developer.login,
    name: developer.name || developer.login,
    avatarUrl: developer.avatarUrl,
    topLanguage: developer.topLanguage || null,
    score: developer.score,
    globalRank: developer.globalRank ?? null,
    scoreDelta,
    rankDelta,
    isNew: !baseline,
  };
  return { ...row, indicator: rankIndicator(row) };
}

/**
 * @param {Array} developers - ranked developers (addDeveloperRanks output), must have login/score/globalRank
 * @param {Array} baselineSnapshots - listLatestSnapshotsOnOrBeforeDay() output
 */
export function buildTrending(developers, baselineSnapshots, options = {}) {
  const { windowDays = DEFAULT_WINDOW_DAYS, gainerLimit = DEFAULT_GAINER_LIMIT, newLimit = DEFAULT_NEW_LIMIT } = options;
  const baselineByLogin = new Map(baselineSnapshots.map(snapshot => [snapshot.login, snapshot]));

  const rows = developers
    .filter(developer => developer.login)
    .map(developer => toRow(developer, baselineByLogin.get(developer.login.toLowerCase())));

  const gainers = rows
    .filter(row => row.scoreDelta !== null && row.scoreDelta > 0)
    .sort((a, b) => b.scoreDelta - a.scoreDelta)
    .slice(0, gainerLimit);

  // "New" risers: no baseline old enough to diff against, so we can't show a
  // score delta, but they're worth surfacing if they're already ranking well.
  const newEntries = rows
    .filter(row => row.isNew && Number.isInteger(row.globalRank))
    .sort((a, b) => a.globalRank - b.globalRank)
    .slice(0, newLimit);

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    gainers,
    newEntries,
    hasHistory: baselineSnapshots.length > 0,
  };
}
