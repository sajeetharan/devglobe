import test from 'node:test';
import assert from 'node:assert/strict';
import { readDiscoveryHistory, recordRecentProfile, recordRecentSearch } from '../lib/discovery-history.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('keeps recent searches local, bounded, and deduplicated', () => {
  const storage = memoryStorage();
  for (let index = 0; index < 7; index += 1) {
    recordRecentSearch({ query: `Query ${index}`, mode: 'hybrid' }, storage);
  }
  recordRecentSearch({ query: 'query 5', mode: 'vector' }, storage);

  const history = readDiscoveryHistory(storage);
  assert.equal(history.searches.length, 5);
  assert.equal(history.searches[0].query, 'query 5');
  assert.equal(history.searches[0].mode, 'vector');
  assert.equal(typeof history.searches[0].savedAt, 'number');
  assert.equal(history.searches.filter(item => item.query.toLowerCase() === 'query 5').length, 1);
});

test('stores only the public fields needed to reopen recent profiles', () => {
  const storage = memoryStorage();
  recordRecentProfile({
    login: 'octocat',
    name: 'The Octocat',
    avatarUrl: 'https://example.com/octocat.png',
    email: 'private@example.com',
  }, storage);

  const [profile] = readDiscoveryHistory(storage).profiles;
  assert.equal(profile.login, 'octocat');
  assert.equal(profile.name, 'The Octocat');
  assert.equal(profile.avatarUrl, 'https://example.com/octocat.png');
  assert.equal(typeof profile.savedAt, 'number');
  assert.equal(Object.hasOwn(profile, 'email'), false);
});

test('expires anonymous discovery history after 30 days', () => {
  const storage = memoryStorage();
  storage.setItem('devglobe-discovery-history:v1', JSON.stringify({
    searches: [{ query: 'old query', mode: 'text', savedAt: Date.now() - (31 * 24 * 60 * 60 * 1000) }],
    profiles: [{ login: 'octocat', name: 'Octocat', avatarUrl: '', savedAt: Date.now() - (31 * 24 * 60 * 60 * 1000) }],
  }));

  assert.deepEqual(readDiscoveryHistory(storage), { searches: [], profiles: [] });
});
