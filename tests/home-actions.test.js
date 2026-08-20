import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentityCardDeveloper } from '../lib/home-actions.js';

test('identity card action prefers the selected developer', () => {
  const selected = { login: 'selected' };
  assert.equal(resolveIdentityCardDeveloper(selected, { login: 'owner' }, []), selected);
});

test('identity card action matches the signed-in developer case-insensitively', () => {
  const developer = { login: 'SajeeTharan', score: 99 };
  assert.equal(resolveIdentityCardDeveloper(null, { login: 'sajeetharan' }, [developer]), developer);
});

test('identity card action falls back to the signed-in GitHub profile', () => {
  assert.deepEqual(resolveIdentityCardDeveloper(null, {
    login: 'octocat',
    name: 'The Octocat',
    avatarUrl: 'https://github.com/octocat.png',
  }, []), {
    id: 'octocat',
    login: 'octocat',
    name: 'The Octocat',
    avatarUrl: 'https://github.com/octocat.png',
  });
  assert.equal(resolveIdentityCardDeveloper(null, null, []), null);
});