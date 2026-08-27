import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLeaderboardActivities } from '../lib/activity-ribbon.js';

test('selects only real DevGlobe platform events for the ribbon', () => {
  const result = selectLeaderboardActivities([
    { id: 'one', documentType: 'platform-activity', login: 'alice', description: 'claimed a profile', url: '/developer/alice' },
    { id: 'two', documentType: 'fallback-activity', fallback: true, login: 'sample', description: 'sample event', url: '/developer/sample' },
    { id: 'three', documentType: 'github-activity', login: 'bob', description: 'pushed code', url: 'https://github.com' },
    { id: 'four', documentType: 'platform-activity', login: 'carol', description: '', url: '/developer/carol' },
  ]);

  assert.deepEqual(result.map(activity => activity.id), ['one']);
});

test('bounds the visible ribbon events', () => {
  const activities = Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    documentType: 'platform-activity',
    login: `dev${index}`,
    description: 'joined DevGlobe',
    url: `/developer/dev${index}`,
  }));
  assert.equal(selectLeaderboardActivities(activities, 5).length, 5);
});