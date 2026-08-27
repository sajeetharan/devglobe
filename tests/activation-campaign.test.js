import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutreachMessage,
  buildWeeklySpotlight,
  selectActivationCandidates,
} from '../lib/activation-campaign.js';

const developers = [
  { login: 'lower', name: 'Lower', score: 70, totalStars: 20, topLanguage: 'Go' },
  { login: 'claimed', name: 'Claimed', score: 99, claimed: true },
  { login: 'higher', name: 'Higher', score: 90, totalCommits: 500, topLanguage: 'TypeScript' },
];

test('selects high-scoring unclaimed outreach candidates', () => {
  assert.deepEqual(selectActivationCandidates(developers).map(developer => developer.login), ['higher', 'lower']);
});

test('builds personalized outreach with a measurable profile link and claim benefits', () => {
  const message = buildOutreachMessage(developers[2], 'https://example.com');
  assert.match(message, /Hi Higher/);
  assert.match(message, /500 public commits/);
  assert.match(message, /utm_source=manual_outreach/);
  assert.match(message, /utm_campaign=developer_activation/);
  assert.match(message, /verified identity card/);
});

test('builds a weekly spotlight from public contribution signals', () => {
  const spotlight = buildWeeklySpotlight(developers, 'https://example.com');
  assert.match(spotlight, /Higher \(@higher\)/);
  assert.doesNotMatch(spotlight, /Claimed/);
  assert.match(spotlight, /utm_source=weekly_spotlight/);
  assert.match(spotlight, /utm_campaign=developer_spotlight/);
});