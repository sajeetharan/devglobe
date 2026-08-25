import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveImpactSnapshot,
  listLatestSnapshotsOnOrBeforeDay,
  __resetMemoryImpactHistoryForTests,
} from '../lib/impact-history-store.js';

function snapshot(login, day, score, globalRank) {
  return {
    id: `${login}:${day}`,
    documentType: 'impact-snapshot',
    login,
    day,
    capturedAt: `${day}T00:00:00.000Z`,
    score,
    globalRank,
  };
}

test('listLatestSnapshotsOnOrBeforeDay returns the most recent snapshot per login on or before the cutoff', async (t) => {
  __resetMemoryImpactHistoryForTests();
  t.after(__resetMemoryImpactHistoryForTests);

  await saveImpactSnapshot(snapshot('alice', '2026-07-20', 60, 5));
  await saveImpactSnapshot(snapshot('alice', '2026-07-24', 70, 3));
  await saveImpactSnapshot(snapshot('alice', '2026-08-10', 90, 1)); // after cutoff, should be ignored
  await saveImpactSnapshot(snapshot('bob', '2026-07-22', 40, 8));

  const results = await listLatestSnapshotsOnOrBeforeDay('2026-07-24');
  const byLogin = Object.fromEntries(results.map(r => [r.login, r]));

  assert.equal(results.length, 2);
  assert.equal(byLogin.alice.day, '2026-07-24');
  assert.equal(byLogin.alice.score, 70);
  assert.equal(byLogin.bob.day, '2026-07-22');
});

test('listLatestSnapshotsOnOrBeforeDay excludes capture-progress documents', async (t) => {
  __resetMemoryImpactHistoryForTests();
  t.after(__resetMemoryImpactHistoryForTests);

  await saveImpactSnapshot(snapshot('alice', '2026-07-24', 70, 3));
  await saveImpactSnapshot({
    id: 'capture:2026-07-24',
    documentType: 'impact-capture-progress',
    login: '__capture__',
    captureDay: '2026-07-24',
  });

  const results = await listLatestSnapshotsOnOrBeforeDay('2026-07-24');
  assert.equal(results.length, 1);
  assert.equal(results[0].login, 'alice');
});
