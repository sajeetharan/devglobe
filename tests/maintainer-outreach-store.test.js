import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMemoryMaintainerOutreachStoreForTests,
  getMaintainerOutreachRecord,
  saveMaintainerOutreachDraft,
  updateMaintainerOutreachStatus,
} from '../lib/maintainer-outreach-store.js';

const draft = {
  id: 'maintainer',
  login: 'maintainer',
  documentType: 'maintainer-outreach',
  status: 'pending',
  attempt: 1,
  delivery: 'manual_review_only',
  selectedAt: '2026-09-03T12:00:00.000Z',
  profileUrl: 'https://example.com/developer/maintainer',
  message: 'Review this draft',
};

test.beforeEach(() => __resetMemoryMaintainerOutreachStoreForTests());

test('creates drafts idempotently and enforces manual state transitions', async () => {
  await saveMaintainerOutreachDraft(draft, null);
  await saveMaintainerOutreachDraft({ ...draft, message: 'Duplicate' }, null);
  assert.equal((await getMaintainerOutreachRecord('maintainer', null)).message, 'Review this draft');

  await updateMaintainerOutreachStatus('maintainer', 'approve', 'operator', null, new Date('2026-09-03T13:00:00.000Z'));
  const sent = await updateMaintainerOutreachStatus('maintainer', 'sent', 'operator', null, new Date('2026-09-03T14:00:00.000Z'));
  assert.equal(sent.status, 'sent');
  assert.equal(sent.followUpDueAt, '2026-09-07T14:00:00.000Z');
  await assert.rejects(() => updateMaintainerOutreachStatus('maintainer', 'sent', 'operator', null), /Cannot sent/);
});

test('preserves first-attempt history when a follow-up draft becomes due', async () => {
  await saveMaintainerOutreachDraft(draft, null);
  await updateMaintainerOutreachStatus('maintainer', 'approve', 'operator', null);
  await updateMaintainerOutreachStatus('maintainer', 'sent', 'operator', null, new Date('2026-09-03T14:00:00.000Z'));
  const followUp = await saveMaintainerOutreachDraft({
    ...draft,
    attempt: 2,
    selectedAt: '2026-09-07T14:00:00.000Z',
    message: 'One final follow-up',
  }, null);
  assert.equal(followUp.status, 'pending');
  assert.equal(followUp.attempt, 2);
  assert.deepEqual(followUp.attemptHistory, [{ attempt: 1, sentAt: '2026-09-03T14:00:00.000Z' }]);
});

test('rejection is terminal', async () => {
  await saveMaintainerOutreachDraft(draft, null);
  const rejected = await updateMaintainerOutreachStatus('maintainer', 'reject', 'operator', null);
  assert.equal(rejected.status, 'rejected');
  await assert.rejects(() => updateMaintainerOutreachStatus('maintainer', 'approve', 'operator', null), /Cannot approve/);
});