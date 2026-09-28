import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeveloperContactValidationError,
  VERIFICATION_REMINDER_INTERVAL_MS,
  buildDeveloperContact,
  claimEmailDelivery,
  completeEmailDelivery,
  createEmailVerification,
  getDeveloperContact,
  isVerificationReminderDue,
  iterateWeeklyDigestContacts,
  normalizeContactEmail,
  recordEmailVerificationReminder,
  recordWeeklyDigestBaseline,
  releaseEmailDelivery,
  saveDeveloperContact,
  setProductUpdatesPreference,
  verifyDeveloperContactEmail,
} from '../lib/developer-contact-store.js';

const timestamp = '2026-08-14T12:00:00.000Z';

function fakeContainer(existing = null) {
  let saved;
  let current = existing;
  return {
    item: () => ({
      read: async () => {
        if (!current) throw Object.assign(new Error('Not found'), { code: 404 });
        return { resource: current };
      },
      replace: async document => {
        saved = document;
        current = { ...document, _etag: 'next-etag' };
        return { resource: current };
      },
    }),
    items: {
      upsert: async document => {
        saved = document;
        return { resource: document };
      },
    },
    get saved() { return saved; },
  };
}

function fakeDeliveryContainer() {
  const documents = new Map();
  let version = 0;
  const save = (id, document) => {
    version += 1;
    const stored = { ...document, _etag: `etag-${version}` };
    documents.set(id, stored);
    return stored;
  };
  return {
    item: id => ({
      read: async () => {
        if (!documents.has(id)) throw Object.assign(new Error('Not found'), { code: 404 });
        return { resource: documents.get(id) };
      },
      replace: async (document, options) => {
        if (documents.get(id)?._etag !== options.accessCondition.condition) {
          throw Object.assign(new Error('Precondition failed'), { code: 412 });
        }
        return { resource: save(id, document) };
      },
    }),
    items: {
      create: async document => {
        if (documents.has(document.id)) throw Object.assign(new Error('Conflict'), { code: 409 });
        return { resource: save(document.id, document) };
      },
    },
    get documents() { return [...documents.values()]; },
  };
}

test('claims one delivery per normalized recipient and campaign without storing email', async () => {
  const container = fakeDeliveryContainer();
  const first = await claimEmailDelivery({
    campaign: 'weekly-digest',
    deliveryKey: '2026-W39',
    recipient: ' Dev@Example.com ',
  }, { container, now: '2026-09-28T13:00:00.000Z', hashSecret: 'test-secret' });
  const overlapping = await claimEmailDelivery({
    campaign: 'weekly-digest',
    deliveryKey: '2026-W39',
    recipient: 'dev@example.com',
  }, { container, now: '2026-09-28T13:00:01.000Z', hashSecret: 'test-secret' });

  assert.equal(first.claimed, true);
  assert.deepEqual(overlapping, { claimed: false, reason: 'in_progress' });
  assert.doesNotMatch(JSON.stringify(container.documents), /dev@example\.com/i);

  await completeEmailDelivery(first, { deliveredAt: '2026-09-28T13:00:02.000Z' }, { container });
  assert.deepEqual(await claimEmailDelivery({
    campaign: 'weekly-digest',
    deliveryKey: '2026-W39',
    recipient: 'dev@example.com',
  }, { container, now: '2026-09-28T13:10:00.000Z', hashSecret: 'test-secret' }), { claimed: false, reason: 'already_delivered' });
});

test('enforces reminder cadence across delivery keys and releases failed attempts', async () => {
  const container = fakeDeliveryContainer();
  const first = await claimEmailDelivery({
    campaign: 'verification-reminder',
    deliveryKey: '2026-09-28',
    recipient: 'dev@example.com',
    minimumIntervalMs: VERIFICATION_REMINDER_INTERVAL_MS,
  }, { container, now: '2026-09-28T14:00:00.000Z', hashSecret: 'test-secret' });
  await releaseEmailDelivery(first, { container, now: '2026-09-28T14:01:00.000Z' });
  const retry = await claimEmailDelivery({
    campaign: 'verification-reminder',
    deliveryKey: '2026-09-28',
    recipient: 'dev@example.com',
    minimumIntervalMs: VERIFICATION_REMINDER_INTERVAL_MS,
  }, { container, now: '2026-09-28T14:02:00.000Z', hashSecret: 'test-secret' });
  assert.equal(retry.claimed, true);
  await completeEmailDelivery(retry, { deliveredAt: '2026-09-28T14:03:00.000Z' }, { container });

  assert.deepEqual(await claimEmailDelivery({
    campaign: 'verification-reminder',
    deliveryKey: '2026-09-29',
    recipient: 'dev@example.com',
    minimumIntervalMs: VERIFICATION_REMINDER_INTERVAL_MS,
  }, { container, now: '2026-09-29T14:00:00.000Z', hashSecret: 'test-secret' }), { claimed: false, reason: 'recently_delivered' });
});

test('prevents an expired worker from completing a renewed delivery claim', async () => {
  const container = fakeDeliveryContainer();
  const expired = await claimEmailDelivery({
    campaign: 'weekly-digest',
    deliveryKey: '2026-W39',
    recipient: 'dev@example.com',
  }, { container, now: '2026-09-28T13:00:00.000Z', hashSecret: 'test-secret' });
  const renewed = await claimEmailDelivery({
    campaign: 'weekly-digest',
    deliveryKey: '2026-W39',
    recipient: 'dev@example.com',
  }, { container, now: '2026-09-28T13:16:00.000Z', hashSecret: 'test-secret' });

  assert.equal(renewed.claimed, true);
  assert.notEqual(expired.claimToken, renewed.claimToken);
  assert.deepEqual(await completeEmailDelivery(expired, {
    deliveredAt: '2026-09-28T13:16:01.000Z',
  }, { container }), { completed: false, reason: 'stale_claim' });
  assert.deepEqual(await completeEmailDelivery(renewed, {
    deliveredAt: '2026-09-28T13:16:02.000Z',
  }, { container }), { completed: true });
});

test('normalizes and validates contact email', () => {
  assert.equal(normalizeContactEmail(' Dev@Example.COM '), 'dev@example.com');
  assert.throws(() => normalizeContactEmail('not-an-email'), DeveloperContactValidationError);
});

test('builds a private nomination contact without product marketing consent', () => {
  assert.deepEqual(buildDeveloperContact({
    login: 'OctoCat',
    email: 'dev@example.com',
    source: 'self-nomination',
    emailVerified: false,
    transactionalEmailsEnabled: true,
  }, null, timestamp), {
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: false,
    source: 'self-nomination',
    transactionalEmailsEnabled: true,
    productUpdatesEnabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

test('verified OAuth contact replaces nomination email and resets address-specific preferences', () => {
  const existing = {
    id: 'octocat',
    login: 'OctoCat',
    email: 'old@example.com',
    emailVerified: false,
    source: 'self-nomination',
    transactionalEmailsEnabled: true,
    productUpdatesEnabled: true,
    createdAt: '2026-08-13T12:00:00.000Z',
  };

  const contact = buildDeveloperContact({
    login: 'OctoCat',
    email: 'verified@example.com',
    source: 'github-oauth',
    emailVerified: true,
    transactionalEmailsEnabled: true,
  }, existing, timestamp);

  assert.equal(contact.email, 'verified@example.com');
  assert.equal(contact.emailVerified, true);
  assert.equal(contact.productUpdatesEnabled, false);
  assert.equal(contact.createdAt, existing.createdAt);
});

test('saves and point-reads contacts by normalized login', async () => {
  const container = fakeContainer();
  const result = await saveDeveloperContact({
    login: 'OctoCat',
    email: 'dev@example.com',
    source: 'github-oauth',
    emailVerified: true,
    transactionalEmailsEnabled: true,
  }, { container, now: timestamp });

  assert.equal(result.saved, true);
  assert.equal(container.saved.id, 'octocat');

  const storedContainer = fakeContainer(container.saved);
  assert.deepEqual(await getDeveloperContact('OCTOCAT', { container: storedContainer }), container.saved);
});

test('skips persistence when Cosmos is not configured', async () => {
  assert.deepEqual(await saveDeveloperContact({ login: 'octocat' }, { container: null }), {
    saved: false,
    reason: 'not_configured',
  });
});

test('enables product updates only for a verified contact', async () => {
  const unverifiedContainer = fakeContainer({
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: false,
    _etag: 'etag-1',
  });
  assert.deepEqual(await setProductUpdatesPreference('OctoCat', true, {
    container: unverifiedContainer,
    now: timestamp,
  }), { updated: false, reason: 'email_not_verified' });

  const verifiedContainer = fakeContainer({
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: true,
    productUpdatesEnabled: false,
    _etag: 'etag-1',
  });
  const result = await setProductUpdatesPreference('OctoCat', true, {
    container: verifiedContainer,
    now: timestamp,
  });
  assert.equal(result.updated, true);
  assert.equal(verifiedContainer.saved.productUpdatesEnabled, true);
});

test('pages through verified weekly digest opt-ins', async () => {
  const pages = [
    [{ id: 'one', login: 'One', email: 'one@example.com' }],
    [{ id: 'two', login: 'Two', email: 'two@example.com' }],
  ];
  const container = {
    items: {
      query: () => ({
        hasMoreResults: () => pages.length > 0,
        fetchNext: async () => ({ resources: pages.shift() }),
      }),
    },
  };

  const contacts = [];
  for await (const contact of iterateWeeklyDigestContacts({ container, pageSize: 1 })) {
    contacts.push(contact.login);
  }
  assert.deepEqual(contacts, ['One', 'Two']);
});

test('records a weekly rank baseline without marking a digest as sent', async () => {
  const container = fakeContainer({
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: true,
    productUpdatesEnabled: true,
    _etag: 'etag-1',
  });

  assert.deepEqual(await recordWeeklyDigestBaseline('OctoCat', 42, { container, now: timestamp }), { updated: true });
  assert.equal(container.saved.lastWeeklyDigestRank, 42);
  assert.equal(container.saved.lastWeeklyDigestWeek, undefined);
  assert.equal(container.saved.lastWeeklyDigestSentAt, undefined);
});

test('verification reminders are due only for opted-in unverified contacts after 72 hours', () => {
  const now = new Date('2026-08-17T14:00:00.000Z');
  const contact = {
    email: 'dev@example.com',
    emailVerified: false,
    transactionalEmailsEnabled: true,
  };

  assert.equal(isVerificationReminderDue(contact, now), true);
  assert.equal(isVerificationReminderDue({
    ...contact,
    lastVerificationReminderAt: '2026-08-14T14:00:00.000Z',
  }, now), true);
  assert.equal(isVerificationReminderDue({
    ...contact,
    lastVerificationReminderAt: '2026-08-15T14:00:00.000Z',
  }, now), false);
  assert.equal(isVerificationReminderDue({ ...contact, emailVerified: true }, now), false);
  assert.equal(isVerificationReminderDue({ ...contact, transactionalEmailsEnabled: false }, now), false);
});

test('records a successful verification reminder', async () => {
  const container = fakeContainer({
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: false,
    verificationReminderCount: 1,
    _etag: 'etag-1',
  });

  const result = await recordEmailVerificationReminder('OctoCat', {
    sentAt: timestamp,
  }, { container });

  assert.equal(result.updated, true);
  assert.equal(container.saved.lastVerificationReminderAt, timestamp);
  assert.equal(container.saved.verificationReminderCount, 2);
});

test('creates a hashed email verification token that expires after 24 hours', async () => {
  const container = fakeContainer({
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: false,
    _etag: 'etag-1',
  });

  const result = await createEmailVerification('OctoCat', {
    container,
    now: timestamp,
    token: 'raw-verification-token',
  });

  assert.equal(result.created, true);
  assert.equal(result.token, 'raw-verification-token');
  assert.notEqual(container.saved.emailVerificationTokenHash, result.token);
  assert.equal(container.saved.emailVerificationExpiresAt, '2026-08-15T12:00:00.000Z');
});

test('rejects an invalid token and consumes a valid verification token', async () => {
  const container = fakeContainer({
    id: 'octocat',
    login: 'OctoCat',
    email: 'dev@example.com',
    emailVerified: false,
    _etag: 'etag-1',
  });
  await createEmailVerification('octocat', {
    container,
    now: timestamp,
    token: 'valid-token',
  });

  assert.deepEqual(await verifyDeveloperContactEmail('octocat', 'wrong-token', {
    container,
    now: '2026-08-14T12:01:00.000Z',
  }), { verified: false, reason: 'invalid' });

  assert.deepEqual(await verifyDeveloperContactEmail('octocat', 'valid-token', {
    container,
    now: '2026-08-14T12:01:00.000Z',
  }), { verified: true });
  assert.equal(container.saved.emailVerified, true);
  assert.equal(container.saved.emailVerifiedAt, '2026-08-14T12:01:00.000Z');
  assert.equal('emailVerificationTokenHash' in container.saved, false);
  assert.equal('emailVerificationExpiresAt' in container.saved, false);
});