import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SHORTLISTS,
  createShortlist,
  deleteShortlist,
  findSharedShortlist,
  hashShortlistShareToken,
  ownerShortlistView,
  updateShortlist,
} from '../lib/shortlists.js';

const NOW = '2026-08-30T12:00:00.000Z';
const ID = '26ec6492-8057-40b1-b53c-9fb6d14fffa7';

function shortlist(overrides = {}) {
  return { id: ID, name: 'Core maintainers', entries: [], createdAt: NOW, updatedAt: NOW, ...overrides };
}

test('creates bounded, uniquely named private shortlists', () => {
  const result = createShortlist([], { name: ' Core maintainers ' }, { id: ID, now: NOW });
  assert.deepEqual(result, [shortlist()]);
  assert.throws(() => createShortlist([shortlist()], { name: 'core MAINTAINERS' }), /already exists/);
  assert.throws(() => createShortlist(Array.from({ length: MAX_SHORTLISTS }, (_, index) => shortlist({ id: String(index), name: String(index) })), { name: 'More' }), /limit/);
});

test('adds, annotates, and removes normalized developers without duplicates', () => {
  let result = updateShortlist([shortlist()], { id: ID, action: 'add', login: '@OctoCat', note: ' Strong docs ' }, { now: NOW }).shortlists;
  assert.deepEqual(result[0].entries, [{ login: 'octocat', note: 'Strong docs', addedAt: NOW }]);
  assert.throws(() => updateShortlist(result, { id: ID, action: 'add', login: 'OCTOCAT' }), /already/);
  result = updateShortlist(result, { id: ID, action: 'note', login: 'octocat', note: 'Maintainer' }, { now: NOW }).shortlists;
  assert.equal(result[0].entries[0].note, 'Maintainer');
  result = updateShortlist(result, { id: ID, action: 'remove', login: 'octocat' }, { now: NOW }).shortlists;
  assert.deepEqual(result[0].entries, []);
});

test('shares with a stored hash and never exposes it to the owner projection', () => {
  const token = 'trusted-read-only-token';
  const result = updateShortlist([shortlist()], { id: ID, action: 'share' }, { now: NOW, createShareToken: () => token });
  assert.equal(result.shareToken, token);
  assert.equal(result.shortlists[0].share.tokenHash, hashShortlistShareToken(token));
  assert.deepEqual(ownerShortlistView(result.shortlists), [{ ...shortlist(), shared: true }]);
  assert.deepEqual(findSharedShortlist(result.shortlists, token), shortlist());
  assert.equal(findSharedShortlist(result.shortlists, 'wrong-token'), null);
});

test('unsharing revokes access and deleting removes the full list', () => {
  const shared = updateShortlist([shortlist()], { id: ID, action: 'share' }, { createShareToken: () => 'token' }).shortlists;
  const unshared = updateShortlist(shared, { id: ID, action: 'unshare' }, { now: NOW }).shortlists;
  assert.equal(findSharedShortlist(unshared, 'token'), null);
  assert.deepEqual(deleteShortlist(unshared, ID), []);
  assert.throws(() => deleteShortlist([], ID), /not found/);
});

test('renames a shortlist while preserving unique names', () => {
  const other = shortlist({ id: 'other', name: 'Other list' });
  const renamed = updateShortlist([shortlist(), other], { id: ID, action: 'rename', name: 'Review queue' }, { now: NOW }).shortlists;
  assert.equal(renamed[0].name, 'Review queue');
  assert.throws(() => updateShortlist(renamed, { id: ID, action: 'rename', name: 'other LIST' }), /already exists/);
});