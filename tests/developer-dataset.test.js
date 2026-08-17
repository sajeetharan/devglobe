import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDeveloperDataset } from '../lib/developer-dataset.js';

test('prepares stored developer scores without mutating the API response', () => {
  const developers = [
    { login: 'second', score: 40, totalCommits: 10 },
    { login: 'first', score: 90, totalStars: 10 },
    { login: 'unscored', totalCommits: 5 },
  ];

  const prepared = prepareDeveloperDataset(developers);

  assert.deepEqual(prepared.map(developer => developer.login), ['first', 'second', 'unscored']);
  assert.deepEqual(prepared.map(developer => developer.globalRank), [1, 2, 3]);
  assert.equal(prepared[0].globalTotal, 3);
  assert.equal(prepared[0].ossWorth.totalDollarValue, 3);
  assert.equal(prepared[2].score, 0);
  assert.equal(developers[2].score, undefined);
});