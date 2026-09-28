import test from 'node:test';
import assert from 'node:assert/strict';
import {
  developerMatchesSearchQuery,
  findExactLoginResult,
  normalizeTextSearchQuery,
  rankDeveloperSearchResults,
  searchTermAlternatives,
  tokenizeDeveloperSearchQuery,
} from '../lib/developer-search.js';

const results = [
  { login: 'torvalds', name: 'Linus Torvalds' },
  { login: 'octocat', name: 'The Octocat' },
];

test('finds exact GitHub logins case-insensitively with an optional at-sign', () => {
  assert.equal(normalizeTextSearchQuery(' @Torvalds '), 'Torvalds');
  assert.equal(findExactLoginResult(' @Torvalds ', results), results[0]);
  assert.equal(findExactLoginResult('octocat', results), results[1]);
});

test('does not treat partial names, display names, or locations as exact logins', () => {
  assert.equal(findExactLoginResult('tor', results), null);
  assert.equal(findExactLoginResult('Linus Torvalds', results), null);
  assert.equal(findExactLoginResult('San Francisco', results), null);
  assert.equal(findExactLoginResult('', results), null);
});

test('extracts meaningful terms from natural-language developer searches', () => {
  assert.deepEqual(
    tokenizeDeveloperSearchQuery('Find me a TypeScript developer in India'),
    ['typescript', 'india'],
  );
  assert.deepEqual(
    tokenizeDeveloperSearchQuery('open source maintainer looking for collaborators'),
    ['open', 'source', 'maintainer', 'collaborators'],
  );
  assert.deepEqual(tokenizeDeveloperSearchQuery('"machine learning" with C++'), ['machine learning', 'c++']);
});

test('matches natural-language intent across developer fields and tags', () => {
  const developer = {
    login: 'ada-builds',
    name: 'Ada Builder',
    location: 'Bengaluru, India',
    bio: 'Open source maintainer and community mentor',
    topLanguage: 'TypeScript',
    specialTags: ['AI agents', 'MCP'],
  };

  assert.equal(developerMatchesSearchQuery(developer, 'TypeScript developer in India'), true);
  assert.equal(developerMatchesSearchQuery(developer, 'open source maintainer'), true);
  assert.equal(developerMatchesSearchQuery(developer, 'AI agent builder using MCP'), true);
  assert.equal(developerMatchesSearchQuery(developer, 'Python developer in India'), false);
});

test('expands bounded programming aliases without changing the interpreted query', () => {
  assert.deepEqual(searchTermAlternatives('ts'), ['ts', 'typescript']);
  assert.deepEqual(searchTermAlternatives('unknown'), ['unknown']);
  assert.deepEqual(tokenizeDeveloperSearchQuery('TS developer in India'), ['ts', 'india']);
});

test('ranks exact all-term matches before profile score', () => {
  const developers = [
    { login: 'high-score', topLanguage: 'Python', location: 'India', score: 99 },
    { login: 'exact-match', topLanguage: 'TypeScript', location: 'India', score: 40 },
  ];

  const search = rankDeveloperSearchResults(developers, 'TypeScript developer in India');

  assert.equal(search.matchMode, 'all');
  assert.deepEqual(search.results.map(developer => developer.login), ['exact-match']);
});

test('uses bounded typo tolerance before broadening', () => {
  const developers = [
    { login: 'typed', topLanguage: 'TypeScript', location: 'Bengaluru, India', score: 60 },
  ];

  const search = rankDeveloperSearchResults(developers, 'Typescrpt developer in India');

  assert.equal(search.matchMode, 'approximate');
  assert.deepEqual(search.results.map(developer => developer.login), ['typed']);
});

test('broadens multi-term searches only when strict matching has no results', () => {
  const developers = [
    { login: 'partial', bio: 'Open source maintainer', topLanguage: 'Go', score: 80 },
    { login: 'weak', bio: 'Open source contributor', topLanguage: 'Rust', score: 95 },
  ];

  const search = rankDeveloperSearchResults(developers, 'open source maintainer kubernetes');

  assert.equal(search.matchMode, 'broadened');
  assert.deepEqual(search.results.map(developer => developer.login), ['partial']);
});

test('reports no match mode when broadening finds no relevant candidates', () => {
  const search = rankDeveloperSearchResults([
    { login: 'python-dev', topLanguage: 'Python' },
  ], 'typescript maintainer canada');

  assert.equal(search.matchMode, 'none');
  assert.deepEqual(search.results, []);
});