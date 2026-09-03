import test from 'node:test';
import assert from 'node:assert/strict';
import {
  followUpDueAt,
  selectMaintainerOutreachDrafts,
  summarizeMaintainerOutreach,
} from '../lib/maintainer-outreach.js';

const now = new Date('2026-09-03T12:00:00.000Z');
const developers = Array.from({ length: 12 }, (_, index) => ({
  login: `maintainer-${index + 1}`,
  name: `Maintainer ${index + 1}`,
  score: 100 - index,
  totalStars: 500 - index,
}));

test('selects ten review-only tracked drafts without re-queueing existing logins', () => {
  const drafts = selectMaintainerOutreachDrafts({
    developers,
    records: [{ login: 'maintainer-1', status: 'pending', attempt: 1 }],
    now,
    siteUrl: 'https://example.com',
  });

  assert.equal(drafts.length, 10);
  assert.equal(drafts[0].login, 'maintainer-2');
  assert.equal(drafts[0].delivery, 'manual_review_only');
  assert.match(drafts[0].message, /utm_source=manual_outreach/);
  assert.match(drafts[0].message, /utm_campaign=developer_activation/);
  assert.doesNotMatch(JSON.stringify(drafts), /email|recipient|sendAt/i);
});

test('prepares only one follow-up after four days', () => {
  const dueRecord = {
    login: 'maintainer-1',
    status: 'sent',
    attempt: 1,
    followUpDueAt: '2026-09-03T11:59:00.000Z',
  };
  const [followUp] = selectMaintainerOutreachDrafts({ developers, records: [dueRecord], now, limit: 1, siteUrl: 'https://example.com' });
  assert.equal(followUp.login, 'maintainer-1');
  assert.equal(followUp.attempt, 2);
  assert.match(followUp.message, /will not follow up again/);

  const noThirdAttempt = selectMaintainerOutreachDrafts({
    developers,
    records: [{ ...dueRecord, attempt: 2 }],
    now,
    limit: 1,
  });
  assert.equal(noThirdAttempt[0].login, 'maintainer-2');
  assert.equal(noThirdAttempt[0].attempt, 1);
  assert.equal(followUpDueAt('2026-09-03T12:00:00.000Z'), '2026-09-07T12:00:00.000Z');
});

test('summarizes only contacted profiles in funnel outcomes', () => {
  const summary = summarizeMaintainerOutreach([
    { login: 'maintainer-1', status: 'sent' },
    { login: 'maintainer-2', status: 'pending' },
  ], [
    { targetLogin: 'maintainer-1', eventName: 'profile_viewed' },
    { targetLogin: 'maintainer-1', eventName: 'profile_claimed' },
    { targetLogin: 'someone-else', eventName: 'profile_claimed' },
  ]);
  assert.deepEqual(summary, { selected: 2, pending: 1, approved: 0, contacted: 1, profileViewed: 1, claimed: 1 });
});