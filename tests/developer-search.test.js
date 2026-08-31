import test from 'node:test';
import assert from 'node:assert/strict';
import { findExactLoginResult, normalizeTextSearchQuery } from '../lib/developer-search.js';

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