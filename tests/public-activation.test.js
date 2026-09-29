import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { missionGitHubAuthUrl, normalizePublicFeature } from '../lib/public-activation.js';

test('mission authentication returns users to the mission feature', () => {
  assert.equal(missionGitHubAuthUrl(), '/api/auth/github?returnTo=%2F%3Ffeature%3Dmission');
});

test('public feature names are bounded to the three primary modes', () => {
  assert.equal(normalizePublicFeature('mission'), 'mission');
  assert.equal(normalizePublicFeature('live'), 'live');
  assert.equal(normalizePublicFeature('unknown'), 'search');
});

test('homepage prioritizes the feature bar without competing first-visit panels', async () => {
  const homepage = await readFile('app/page.jsx', 'utf8');
  assert.match(homepage, /<PublicFeatureBar/);
  assert.match(homepage, /showMissionPreview=\{false\}/);
  assert.doesNotMatch(homepage, /<PlatformActivityBanner/);
  assert.doesNotMatch(homepage, /setTourStep\('search'\).*localStorage\.getItem\(TOUR_COMPLETE_KEY\)/s);
});