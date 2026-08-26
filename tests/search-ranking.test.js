import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fuseRankedResults } = require('../functions/shared/search-ranking.js');

test('fuseRankedResults promotes developers present in both result sets', () => {
  const vector = [{ login: 'vector-first' }, { login: 'shared' }, { login: 'vector-only' }];
  const text = [{ login: 'text-first' }, { login: 'shared' }, { login: 'text-only' }];

  assert.deepEqual(
    fuseRankedResults(vector, text, 3).map(developer => developer.login),
    ['shared', 'vector-first', 'text-first'],
  );
});

test('fuseRankedResults deduplicates and respects the result limit', () => {
  const result = fuseRankedResults(
    [{ login: 'alpha' }, { login: 'beta' }],
    [{ login: 'alpha' }, { login: 'gamma' }],
    2,
  );

  assert.equal(result.length, 2);
  assert.equal(new Set(result.map(developer => developer.login)).size, 2);
});
