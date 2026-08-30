import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyDigestEmail,
  createDigestPreferenceToken,
  getDigestWeekKey,
  sendWeeklyDigests,
  verifyDigestPreferenceToken,
} from '../lib/weekly-digest.js';

const developers = [
  { login: 'octocat', name: 'Octocat', globalRank: 3, globalTotal: 100, countryRank: 1, country: 'US', score: 88 },
];

test('builds a weekly digest with ranking movement and exploration links', () => {
  const message = buildWeeklyDigestEmail({
    developer: developers[0],
    previousRank: 5,
    unsubscribeUrl: 'https://www.devglobe.dev/api/contact/unsubscribe?token=test',
  });
  assert.match(message.subject, /#3/);
  assert.match(message.text, /moved up 2 places/);
  assert.match(message.html, /What's new on DevGlobe/);
  assert.match(message.html, /Explore DevGlobe/);
  assert.match(message.html, /Unsubscribe/);
  assert.match(message.html, /devglobe\.png/);
  assert.match(message.html, /Where Developers and AI Agents Connect/);
  assert.match(message.html, /Generate identity card/);
  assert.match(message.html, /Invite a developer/);
  assert.match(message.html, /\?ref=octocat/);
  assert.match(message.html, /Star the repo/);
});

test('creates verifiable unsubscribe tokens', () => {
  const token = createDigestPreferenceToken('OctoCat', 'test-secret');
  assert.equal(verifyDigestPreferenceToken('octocat', token, 'test-secret'), true);
  assert.equal(verifyDigestPreferenceToken('another-user', token, 'test-secret'), false);
});

test('sends one eligible digest per ISO week and records its rank', async () => {
  const weekKey = getDigestWeekKey(new Date('2026-08-17T13:00:00.000Z'));
  const contacts = [
    { id: 'octocat', login: 'octocat', email: 'octocat@example.com', lastWeeklyDigestRank: 5 },
    { id: 'already-sent', login: 'octocat', email: 'other@example.com', lastWeeklyDigestWeek: weekKey },
    { id: 'missing', login: 'missing', email: 'missing@example.com' },
  ];
  const sent = [];
  const recorded = [];
  const summary = await sendWeeklyDigests({
    contacts,
    developers,
    now: new Date('2026-08-17T13:00:00.000Z'),
    preferenceSecret: 'test-secret',
    sendEmail: async email => {
      sent.push(email);
      return { sent: true, id: 'email-1' };
    },
    recordDelivery: async (login, delivery) => recorded.push({ login, delivery }),
  });

  assert.deepEqual(summary, {
    eligible: 3,
    sent: 1,
    skipped: 2,
    failed: 0,
    reasons: {
      alreadySent: 1,
      missingDeveloper: 1,
      missingRecipient: 0,
      providerNotConfigured: 0,
      providerRejected: 0,
      deliveryRecordFailed: 0,
    },
  });
  assert.equal(sent[0].idempotencyKey, `weekly-digest-octocat-${weekKey}`);
  assert.equal(recorded[0].delivery.rank, 3);
  assert.equal(recorded[0].delivery.weekKey, weekKey);
});

test('reports privacy-safe aggregate delivery failure reasons', async () => {
  const contacts = [
    { id: 'missing-recipient', login: 'octocat', email: '' },
    { id: 'not-configured', login: 'octocat', email: 'configured@example.com' },
    { id: 'provider-rejected', login: 'octocat', email: 'rejected@example.com' },
  ];
  const summary = await sendWeeklyDigests({
    contacts,
    developers,
    preferenceSecret: 'test-secret',
    sendEmail: async ({ to }) => {
      if (!to) return { sent: false, reason: 'missing_recipient' };
      if (to.startsWith('configured')) return { sent: false, reason: 'not_configured' };
      throw new Error('Provider response included private details');
    },
  });

  assert.equal(summary.failed, 3);
  assert.deepEqual(summary.reasons, {
    alreadySent: 0,
    missingDeveloper: 0,
    missingRecipient: 1,
    providerNotConfigured: 1,
    providerRejected: 1,
    deliveryRecordFailed: 0,
  });
  assert.doesNotMatch(JSON.stringify(summary), /example\.com|private details/);
});

test('reports delivery record failures separately from provider failures', async () => {
  const summary = await sendWeeklyDigests({
    contacts: [{ id: 'octocat', login: 'octocat', email: 'octocat@example.com' }],
    developers,
    preferenceSecret: 'test-secret',
    sendEmail: async () => ({ sent: true, id: 'email-1' }),
    recordDelivery: async () => {
      throw new Error('Cosmos write failed');
    },
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.reasons.deliveryRecordFailed, 1);
  assert.equal(summary.reasons.providerRejected, 0);
});