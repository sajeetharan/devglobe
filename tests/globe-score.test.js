import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHighestScore,
  getScoreColor,
  SCORE_TIERS,
} from '../lib/globe-score.js';

test('maps score boundaries to the visible globe tiers', () => {
  assert.equal(getScoreColor(80), SCORE_TIERS[0].color);
  assert.equal(getScoreColor(60), SCORE_TIERS[1].color);
  assert.equal(getScoreColor(40), SCORE_TIERS[2].color);
  assert.equal(getScoreColor(39), SCORE_TIERS[3].color);
});

test('uses the highest developer score to represent a cluster', () => {
  const developers = [{ score: 37 }, { score: 82 }, { score: 64 }];
  assert.equal(getHighestScore(developers), 82);
  assert.equal(getScoreColor(getHighestScore(developers)), SCORE_TIERS[0].color);
  assert.equal(getHighestScore([]), 0);
});
