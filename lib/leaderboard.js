import { countryKey, extractCountry, normalizeCountry } from './country.js';
import { compareOssWorth } from './oss-worth.js';

export const LEADERBOARD_SORTS = ['score', 'stars', 'commits', 'worth'];

export function normalizeGitHubLogin(value) {
  const login = String(value || '').trim().replace(/^@/, '');
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login) ? login : '';
}

export function findLeaderboardDeveloper(developers, login) {
  const normalized = normalizeGitHubLogin(login).toLowerCase();
  if (!normalized) return null;
  return developers.find(developer => developer.login?.toLowerCase() === normalized) || null;
}

const SORTERS = {
  score: (left, right) =>
    (left.globalRank || Number.MAX_SAFE_INTEGER) - (right.globalRank || Number.MAX_SAFE_INTEGER),
  stars: (left, right) => (right.totalStars || 0) - (left.totalStars || 0),
  commits: (left, right) => (right.totalCommits || 0) - (left.totalCommits || 0),
  worth: compareOssWorth,
};

export function filterAndSortLeaderboard(developers, filters = {}) {
  const wantedCountry = countryKey(filters.country || '');
  const language = filters.language || '';
  const sorter = SORTERS[filters.sortBy] || SORTERS.score;

  return developers
    .filter(developer => {
      const matchesCountry = !wantedCountry || (
        developer.location && countryKey(extractCountry(developer.location)) === wantedCountry
      );
      const matchesLanguage = !language || developer.topLanguage === language;
      return matchesCountry && matchesLanguage;
    })
    .sort((left, right) => sorter(left, right) || String(left.login).localeCompare(String(right.login)));
}

export function getLeaderboardFilters(developers) {
  const countryNames = new Map();
  const languages = new Set();

  for (const developer of developers) {
    if (developer.location) {
      const country = normalizeCountry(extractCountry(developer.location));
      const key = countryKey(country);
      if (key && !countryNames.has(key)) countryNames.set(key, country);
    }
    if (developer.topLanguage) languages.add(developer.topLanguage);
  }

  return {
    countries: [...countryNames.values()].sort((left, right) => left.localeCompare(right)),
    languages: [...languages].sort((left, right) => left.localeCompare(right)),
  };
}