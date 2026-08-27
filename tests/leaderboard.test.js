import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSortLeaderboard, getLeaderboardFilters } from '../lib/leaderboard.js';

const developers = [
  {
    login: 'alice', globalRank: 1, location: 'Paris, France', topLanguage: 'TypeScript',
    totalStars: 10, totalCommits: 50, ossWorth: { totalDollarValue: 100 },
  },
  {
    login: 'bob', globalRank: 2, location: 'Berlin, Germany', topLanguage: 'Go',
    totalStars: 100, totalCommits: 20, ossWorth: { totalDollarValue: 50 },
  },
  {
    login: 'carol', globalRank: 3, location: 'Lyon, France', topLanguage: 'Go',
    totalStars: 20, totalCommits: 80, ossWorth: { totalDollarValue: 200 },
  },
];

test('filters leaderboard by normalized country and language', () => {
  const result = filterAndSortLeaderboard(developers, { country: 'france', language: 'Go' });
  assert.deepEqual(result.map(developer => developer.login), ['carol']);
});

test('sorts alternate metrics without replacing global ranks', () => {
  const result = filterAndSortLeaderboard(developers, { sortBy: 'stars' });
  assert.deepEqual(result.map(developer => developer.login), ['bob', 'carol', 'alice']);
  assert.deepEqual(result.map(developer => developer.globalRank), [2, 3, 1]);
});

test('builds unique alphabetical filter options', () => {
  assert.deepEqual(getLeaderboardFilters(developers), {
    countries: ['France', 'Germany'],
    languages: ['Go', 'TypeScript'],
  });
});