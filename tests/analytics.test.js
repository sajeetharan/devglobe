import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAnalyticsProperties } from '../lib/analytics.js';

test('keeps bounded search dimensions without retaining raw queries', () => {
  assert.deepEqual(safeAnalyticsProperties({
    query: 'private search wording',
    termCount: 4,
    resultCount: 12,
    resultRank: 3,
    matchMode: 'broadened',
    fallback: 'none',
  }), {
    termCount: 4,
    resultCount: 12,
    resultRank: 3,
    matchMode: 'broadened',
    fallback: 'none',
  });
});

test('clamps numeric analytics dimensions and bounds strings', () => {
  assert.deepEqual(safeAnalyticsProperties({
    resultCount: 500,
    resultRank: -2,
    termCount: 100,
    source: 'x'.repeat(120),
  }), {
    resultCount: 50,
    resultRank: 0,
    termCount: 20,
    source: 'x'.repeat(100),
  });
});