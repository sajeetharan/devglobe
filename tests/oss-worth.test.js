import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOssWorth,
  compareOssWorth,
  OSS_WORTH_FORMULA_VERSION,
  OSS_WORTH_MAX_CREDITS,
} from '../lib/oss-worth.js';

test('zero inputs produce zero credits with unavailable Stack Overflow', () => {
  const worth = calculateOssWorth({});

  assert.equal(worth.formulaVersion, OSS_WORTH_FORMULA_VERSION);
  assert.equal(worth.totalCredits, 0);
  assert.equal(worth.github.available, true);
  assert.equal(worth.stackoverflow.available, false);
});

test('reference caps produce the exact 60/40 maximum allocation', () => {
  const worth = calculateOssWorth({
    totalStars: 100_000,
    totalCommits: 10_000,
    totalForks: 25_000,
    totalWatchers: 25_000,
    followers: 25_000,
    publicRepos: 100,
    soUserId: 1,
    soReputation: 100_000,
    soAnswers: 1_000,
    soAcceptRate: 100,
    soBadges: 100,
  });

  assert.equal(worth.github.credits, 600_000);
  assert.equal(worth.stackoverflow.credits, 400_000);
  assert.equal(worth.totalCredits, OSS_WORTH_MAX_CREDITS);
});

test('missing Stack Overflow data is not redistributed to GitHub', () => {
  const worth = calculateOssWorth({
    totalStars: 100_000,
    totalCommits: 10_000,
    totalForks: 50_000,
    followers: 25_000,
    publicRepos: 100,
  });

  assert.equal(worth.github.credits, 600_000);
  assert.equal(worth.stackoverflow.available, false);
  assert.equal(worth.stackoverflow.credits, 0);
  assert.equal(worth.totalCredits, 600_000);
});

test('a linked all-zero Stack Overflow profile is available with zero credits', () => {
  const worth = calculateOssWorth({ soUserId: 42 });

  assert.equal(worth.stackoverflow.available, true);
  assert.equal(worth.stackoverflow.credits, 0);
});

test('credits are monotonic and invalid inputs are clamped', () => {
  const baseline = calculateOssWorth({ totalStars: 10, soUserId: 1, soAnswers: 10, soAcceptRate: 50 });
  const increased = calculateOssWorth({ totalStars: 20, soUserId: 1, soAnswers: 10, soAcceptRate: 150 });
  const invalid = calculateOssWorth({ totalStars: -1, totalCommits: Infinity, soUserId: 1, soAnswers: -10, soAcceptRate: NaN });

  assert.ok(increased.github.credits >= baseline.github.credits);
  assert.ok(increased.stackoverflow.credits >= baseline.stackoverflow.credits);
  assert.equal(invalid.github.credits, 0);
  assert.equal(invalid.stackoverflow.credits, 0);
});

test('worth sorting uses score and login as deterministic tie-breakers', () => {
  const developers = [
    { login: 'charlie', score: 20, ossWorth: { totalCredits: 200 } },
    { login: 'bravo', score: 40, ossWorth: { totalCredits: 100 } },
    { login: 'alpha', score: 40, ossWorth: { totalCredits: 100 } },
    { login: 'delta', score: 90, ossWorth: { totalCredits: 300 } },
  ];

  assert.deepEqual(developers.sort(compareOssWorth).map(developer => developer.login), [
    'delta',
    'charlie',
    'alpha',
    'bravo',
  ]);
});