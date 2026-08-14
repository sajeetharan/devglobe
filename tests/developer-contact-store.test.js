import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeveloperContactValidationError,
  buildDeveloperContact,
  getDeveloperContact,
  normalizeContactEmail,
  saveDeveloperContact,
} from '../lib/developer-contact-store.js';

const timestamp = '2026-08-14T12:00:00.000Z';

function fakeContainer(existing = null) {
  let saved;
  return {
    item: () => ({
      read: async () => {
        if (!existing) throw Object.assign(new Error('Not found'), { code: 404 });
        return { resource: existing };
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