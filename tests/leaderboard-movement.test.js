import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRankMovement,
  normalizeLeaderboardLogins,
  normalizeLeaderboardPeriod,
} from '../lib/leaderboard-movement.js';

test('accepts only supported leaderboard periods', () => {
  assert.equal(normalizeLeaderboardPeriod('7'), 7);
  assert.equal(normalizeLeaderboardPeriod('90'), 90);
  assert.equal(normalizeLeaderboardPeriod('365'), 30);
  assert.equal(normalizeLeaderboardPeriod('bad'), 30);
});

test('derives rank direction and preserves unavailable states', () => {
  const developers = [
    { login: 'alice', globalRank: 2 },
    { login: 'bob', globalRank: 4 },
    { login: 'carol', globalRank: 6 },
    { login: 'new-dev', globalRank: 8 },
  ];
  const baselines = [
    { login: 'alice', globalRank: 5, day: '2026-07-01' },
    { login: 'bob', globalRank: 2, day: '2026-07-01' },
    { login: 'carol', globalRank: 6, day: '2026-07-01' },
  ];

  const movement = buildRankMovement(developers, baselines);
  assert.deepEqual(movement.get('alice'), { status: 'up', delta: 3, previousRank: 5, day: '2026-07-01' });
  assert.equal(movement.get('bob').status, 'down');
  assert.equal(movement.get('bob').delta, -2);
  assert.equal(movement.get('carol').status, 'unchanged');
  assert.deepEqual(movement.get('new-dev'), { status: 'new', delta: null });
});

test('normalizes, deduplicates, and bounds movement logins', () => {
  const logins = Array.from({ length: 105 }, (_, index) => `dev-${index}`).join(',');
  const result = normalizeLeaderboardLogins(`Alice,alice,invalid login,${logins}`);
  assert.equal(result[0], 'alice');
  assert.equal(result.length, 100);
  assert.equal(result.includes('invalid login'), false);
});