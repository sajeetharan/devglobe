import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingMission, parsePendingMission } from '../lib/pending-mission.js';

const NOW = Date.parse('2026-09-21T06:00:00.000Z');

test('creates a bounded mission intent without storing issue content', () => {
  assert.deepEqual(createPendingMission({
    login: '@OctoCat',
    issueId: 123,
    createdAt: NOW,
  }), {
    login: 'octocat',
    issueId: '123',
    createdAt: NOW,
  });
  assert.equal(createPendingMission({ login: 'invalid/login', issueId: '123' }), null);
});

test('accepts only fresh valid pending missions', () => {
  const serialized = JSON.stringify({ login: 'octocat', issueId: '123', createdAt: NOW - 1000 });
  assert.equal(parsePendingMission(serialized, { now: NOW }).issueId, '123');
  assert.equal(parsePendingMission(serialized, { now: NOW + 2 * 60 * 60 * 1000 }), null);
  assert.equal(parsePendingMission('not-json', { now: NOW }), null);
});
