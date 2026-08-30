import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DEVELOPER_FOLLOWS,
  mutateShortlists,
  normalizeDeveloperFollow,
  updateDeveloperFollows,
} from '../lib/watchlist-store.js';

test('normalizes developer follows and removes duplicate casing', () => {
  assert.equal(normalizeDeveloperFollow(' @OctoCat '), 'octocat');
  assert.deepEqual(updateDeveloperFollows(['OctoCat'], '@octocat', { ownerLogin: 'viewer' }), ['octocat']);
});

test('rejects invalid and self follows', () => {
  assert.throws(() => normalizeDeveloperFollow('invalid--login'), /Invalid GitHub login/);
  assert.throws(
    () => updateDeveloperFollows([], 'Viewer', { ownerLogin: 'viewer' }),
    /own profile/,
  );
});

test('removes follows and enforces the developer follow limit', () => {
  assert.deepEqual(updateDeveloperFollows(['octocat'], 'OCTOCAT', { remove: true }), []);
  const follows = Array.from({ length: MAX_DEVELOPER_FOLLOWS }, (_, index) => `dev-${index}`);
  assert.throws(() => updateDeveloperFollows(follows, 'one-more'), /follow limit/);
});

test('shortlist mutations reload and retry after an ETag conflict', async () => {
  let loads = 0;
  let saves = 0;
  const result = await mutateShortlists('viewer', shortlists => ({
    shortlists: [...shortlists, { id: 'new' }],
  }), {
    load: async () => ({
      id: 'viewer',
      login: 'viewer',
      shortlists: loads++ === 0 ? [] : [{ id: 'concurrent' }],
    }),
    save: async watchlist => {
      saves += 1;
      if (saves === 1) throw Object.assign(new Error('conflict'), { code: 412 });
      return watchlist;
    },
  });
  assert.equal(loads, 2);
  assert.equal(saves, 2);
  assert.deepEqual(result.watchlist.shortlists, [{ id: 'concurrent' }, { id: 'new' }]);
});