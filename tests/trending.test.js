import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrending, windowStartDay } from '../lib/trending.js';

test('windowStartDay subtracts the window in days and returns YYYY-MM-DD', () => {
  assert.equal(windowStartDay(30, new Date('2026-08-23T12:00:00Z')), '2026-07-24');
  assert.equal(windowStartDay(7, new Date('2026-08-23T00:00:00Z')), '2026-08-16');
});

test('ranks gainers by score delta and computes rank movement indicators', () => {
  const developers = [
    { login: 'alice', name: 'Alice', score: 90, globalRank: 1 },
    { login: 'bob', name: 'Bob', score: 80, globalRank: 2 },
    { login: 'carol', name: 'Carol', score: 60, globalRank: 4 },
  ];
  const baseline = [
    { login: 'alice', day: '2026-07-24', score: 70, globalRank: 5 },
    { login: 'bob', day: '2026-07-24', score: 78, globalRank: 1 },
    { login: 'carol', day: '2026-07-24', score: 65, globalRank: 2 },
  ];

  const trending = buildTrending(developers, baseline, { windowDays: 30 });

  assert.equal(trending.hasHistory, true);
  assert.deepEqual(trending.gainers.map(g => g.login), ['alice', 'bob']);
  assert.equal(trending.gainers[0].scoreDelta, 20);
  assert.equal(trending.gainers[0].indicator, '↑4');
  assert.equal(trending.gainers[1].indicator, '↓1');
  // Carol's score dropped, so she is not a gainer and not "new" (has a baseline).
  assert.equal(trending.newEntries.length, 0);
});

test('developers with no baseline snapshot are surfaced as new entries, not gainers', () => {
  const developers = [
    { login: 'alice', name: 'Alice', score: 90, globalRank: 1 },
    { login: 'dave', name: 'Dave', score: 55, globalRank: 3 },
  ];
  const baseline = [{ login: 'alice', day: '2026-07-24', score: 70, globalRank: 2 }];

  const trending = buildTrending(developers, baseline);

  assert.deepEqual(trending.gainers.map(g => g.login), ['alice']);
  assert.deepEqual(trending.newEntries.map(n => n.login), ['dave']);
  assert.equal(trending.newEntries[0].indicator, 'NEW');
  assert.equal(trending.newEntries[0].scoreDelta, null);
});

test('reports no history when there are no baseline snapshots at all', () => {
  const developers = [{ login: 'alice', name: 'Alice', score: 90, globalRank: 1 }];
  const trending = buildTrending(developers, []);
  assert.equal(trending.hasHistory, false);
  assert.equal(trending.gainers.length, 0);
});

test('respects gainerLimit and newLimit options', () => {
  const developers = Array.from({ length: 10 }, (_, i) => ({
    login: `dev${i}`,
    name: `Dev ${i}`,
    score: 100 - i,
    globalRank: i + 1,
  }));
  const baseline = developers.map(d => ({ login: d.login, day: '2026-07-24', score: d.score - 10, globalRank: d.globalRank }));

  const trending = buildTrending(developers, baseline, { gainerLimit: 3 });
  assert.equal(trending.gainers.length, 3);
});
