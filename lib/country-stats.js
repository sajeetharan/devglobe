import { extractCountry, normalizeCountry, countryKey } from './country.js';

const DEFAULT_LIMIT = 200;
const TOP_LANGUAGES_PER_COUNTRY = 3;

/**
 * Aggregates a developer list into per-country stats: developer count,
 * average score, and top languages. Countries are grouped using the same
 * normalization/alias rules the globe and leaderboard already use, so this
 * lines up with what a user sees when filtering by country elsewhere.
 *
 * @param {Array} developers
 * @param {object} [options]
 * @param {number} [options.limit] - max countries to return, sorted by developer count
 * @returns {Array<{ country: string, developerCount: number, avgScore: number, topLanguages: Array }>}
 */
export function computeCountryStats(developers, options = {}) {
  const { limit = DEFAULT_LIMIT } = options;
  const groups = new Map();

  developers.forEach(developer => {
    if (!developer.location) return;
    const country = normalizeCountry(extractCountry(developer.location));
    const key = countryKey(country);
    if (!key) return;

    if (!groups.has(key)) {
      groups.set(key, { country, count: 0, scoreSum: 0, languages: new Map() });
    }
    const group = groups.get(key);
    group.count += 1;
    group.scoreSum += Number.isFinite(developer.score) ? developer.score : 0;
    if (developer.topLanguage) {
      group.languages.set(
        developer.topLanguage,
        (group.languages.get(developer.topLanguage) || 0) + 1,
      );
    }
  });

  return [...groups.values()]
    .map(group => ({
      country: group.country,
      developerCount: group.count,
      avgScore: Number((group.scoreSum / group.count).toFixed(1)),
      topLanguages: [...group.languages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_LANGUAGES_PER_COUNTRY)
        .map(([language, count]) => ({ language, count })),
    }))
    .sort((a, b) => b.developerCount - a.developerCount)
    .slice(0, limit);
}
