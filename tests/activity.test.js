import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeActivityCursor, encodeActivityCursor } from '../lib/activity-store.js';
import { describeGitHubEvent, normalizeGitHubEvent } from '../lib/github-activity.js';
import { createFallbackActivities, createPlatformActivity, normalizePlatformActivity } from '../lib/platform-activity.js';

test('normalizes a GitHub event into the public activity shape', () => {
  const activity = normalizeGitHubEvent({
    id: 123,
    type: 'PushEvent',
    actor: { login: 'Octocat', avatar_url: 'https://example.test/avatar.png' },
    repo: { name: 'octo/repo' },
    created_at: '2026-08-12T12:00:00Z',
    payload: { size: 2 },
  });

  assert.equal(activity.id, '123');
  assert.equal(activity.login, 'Octocat');
  assert.equal(activity.description, 'Pushed 2 commits to octo/repo');
  assert.equal(activity.createdAt, '2026-08-12T12:00:00.000Z');
});

test('rejects events without an identity or valid timestamp', () => {
  assert.equal(normalizeGitHubEvent({ id: '1', created_at: 'invalid' }), null);
  assert.equal(normalizeGitHubEvent({ id: '1', created_at: '2026-08-12T12:00:00Z' }), null);
});

test('describes unknown GitHub event types safely', () => {
  assert.equal(describeGitHubEvent({ type: 'OtherEvent', repo: { name: 'octo/repo' } }), 'Contributed to octo/repo');
});

test('round trips stable timestamp and id cursors', () => {
  const activity = { id: '123', createdAt: '2026-08-12T12:00:00.000Z' };
  assert.deepEqual(decodeActivityCursor(encodeActivityCursor(activity)), activity);
  assert.equal(decodeActivityCursor('not-a-cursor'), null);
});

test('creates platform card activity for the actor and target', () => {
  const activity = createPlatformActivity({
    type: 'generated_card',
    login: 'octocat',
    targetLogin: 'hubot',
    now: new Date('2026-08-13T12:00:00Z'),
  });

  assert.equal(activity.login, 'octocat');
  assert.equal(activity.description, "revealed @hubot's open-source identity with a DevGlobe card - try it yourself");
  assert.equal(activity.url, '/developer/hubot');
  assert.equal(activity.documentType, 'platform-activity');
});

test('invites viewers to create a card from self-generated activity', () => {
  const activity = createPlatformActivity({
    type: 'generated_card',
    login: 'octocat',
    now: new Date('2026-08-13T12:00:00Z'),
  });

  assert.equal(activity.description, 'revealed their open-source identity with a DevGlobe card - create yours');
  assert.equal(activity.url, '/developer/octocat');
});

test('refreshes legacy card activity wording for the live feed', () => {
  const selfActivity = normalizePlatformActivity({
    type: 'generated_card',
    description: 'had their developer card generated',
  });
  const targetActivity = normalizePlatformActivity({
    type: 'generated_card',
    description: "generated @hubot's developer card",
  });

  assert.equal(selfActivity.description, 'revealed their open-source identity with a DevGlobe card - create yours');
  assert.equal(targetActivity.description, "revealed @hubot's open-source identity with a DevGlobe card - try it yourself");
});

test('creates platform README activity for the actor and target', () => {
  const activity = createPlatformActivity({
    type: 'generated_readme',
    login: 'octocat',
    targetLogin: 'hubot',
    now: new Date('2026-08-13T12:00:00Z'),
  });

  assert.equal(activity.login, 'octocat');
  assert.equal(activity.description, "generated @hubot's GitHub profile README");
  assert.equal(activity.url, '/developer/hubot');
  assert.equal(activity.documentType, 'platform-activity');
});

test('creates privacy-safe mission acceptance activity', () => {
  const activity = createPlatformActivity({
    id: 'platform:mission-accepted:octocat:2026-08-13:101',
    type: 'mission_accepted',
    login: 'octocat',
    avatarUrl: 'https://example.test/octocat.png',
    now: new Date('2026-08-13T12:00:00Z'),
  });

  assert.equal(activity.id, 'platform:mission-accepted:octocat:2026-08-13:101');
  assert.equal(activity.login, 'octocat');
  assert.equal(activity.avatarUrl, 'https://example.test/octocat.png');
  assert.equal(activity.description, 'accepted an open-source mission');
  assert.equal(activity.url, '/developer/octocat');
  assert.equal(activity.documentType, 'platform-activity');
  assert.equal('repo' in activity && activity.repo !== null, false);
});

test('creates stable fallback activities within an hourly window', () => {
  const first = createFallbackActivities(Date.parse('2026-08-13T12:10:00Z'));
  const second = createFallbackActivities(Date.parse('2026-08-13T12:50:00Z'));

  assert.deepEqual(first, second);
  assert.ok(first.every(activity => activity.fallback));
});