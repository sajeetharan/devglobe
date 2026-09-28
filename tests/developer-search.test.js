import test from 'node:test';
import assert from 'node:assert/strict';
import {
  developerMatchesSearchQuery,
  findExactLoginResult,
  normalizeTextSearchQuery,
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