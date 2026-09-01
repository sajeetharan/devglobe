import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyDigestEmail,
  createDigestPreferenceToken,
  getDigestWeekKey,
  loadPendingIntroductionCounts,
  selectWeeklyDigestUpdate,
  sendWeeklyDigests,
  verifyDigestPreferenceToken,
} from '../lib/weekly-digest.js';

const developers = [
  { login: 'octocat', name: 'Octocat', globalRank: 3, globalTotal: 100, countryRank: 1, country: 'US', score: 88 },
];

test('selects only meaningful personalized weekly updates', () => {
  const now = new Date('2026-08-31T13:00:00.000Z');
  assert.equal(selectWeeklyDigestUpdate({ developer: developers[0], now }), null);
  assert.deepEqual(selectWeeklyDigestUpdate({ developer: developers[0], previousRank: 5, now }), { type: 'rank_movement' });
  assert.equal(selectWeeklyDigestUpdate({ developer: developers[0], previousRank: 3, now }), null);
  assert.deepEqual(selectWeeklyDigestUpdate({
    developer: developers[0],
    previousRank: 3,
    pendingIntroductionCount: 2,
    now,
  }), { type: 'introduction_request', count: 2 });

  const opportunity = { title: 'Improve parser tests', url: 'https://github.com/org/repo/issues/10' };
  assert.deepEqual(selectWeeklyDigestUpdate({
    developer: {
      ...developers[0],
      dailyMission: { day: '2026-08-28', status: 'offered', opportunity },
    },
    previousRank: 3,
    now,
  }), { type: 'contribution_opportunity', opportunity });
});

test('builds a weekly digest with ranking movement and exploration links', () => {
  const message = buildWeeklyDigestEmail({
    developer: developers[0],
    previousRank: 5,
    update: { type: 'rank_movement' },
    weekKey: '2026-W34',
    unsubscribeUrl: 'https://www.devglobe.dev/api/contact/unsubscribe?token=test',
  });
  assert.match(message.subject, /#3/);
  assert.match(message.text, /moved up 2 places/);
  assert.doesNotMatch(message.html, /What's new on DevGlobe/);
  assert.match(message.html, /View impact history/);
  assert.match(message.html, /utm_source=weekly_digest/);
  assert.match(message.html, /utm_term=2026-W34/);
  assert.match(message.html, /Unsubscribe/);
  assert.match(message.html, /devglobe\.png/);
  assert.match(message.html, /The open-source talent graph for humans and AI agents\./);
  assert.match(message.html, /Generate identity card/);
  assert.match(message.html, /Invite a developer/);
  assert.match(message.html, /\?ref=octocat/);
  assert.match(message.html, /Star the repo/);
});

test('builds signal-specific deep links for opportunities and introduction requests', () => {
  const opportunity = buildWeeklyDigestEmail({
    developer: developers[0],
    previousRank: 3,
    update: { type: 'contribution_opportunity', opportunity: { title: 'Improve parser tests', url: 'https://github.com/org/repo/issues/10' } },
    weekKey: '2026-W35',
  });
  assert.match(opportunity.html, /A contribution opportunity is ready/);
  assert.match(opportunity.html, /open=contributions/);
  assert.match(opportunity.html, /utm_content=contribution_opportunity/);

  const introduction = buildWeeklyDigestEmail({
    developer: developers[0],
    previousRank: 3,
    update: { type: 'introduction_request', count: 2 },
    weekKey: '2026-W35',
  });
  assert.match(introduction.text, /2 pending introduction requests/);
  assert.match(introduction.html, /open=introductions/);
  assert.match(introduction.html, /utm_content=introduction_request/);
});

test('aggregates only pending, unexpired introduction records returned by the private query', async () => {
  let query;
  const counts = await loadPendingIntroductionCounts({
    now: new Date('2026-08-31T13:00:00.000Z'),
    container: {
      items: {
        query: definition => {
          query = definition;
          return { fetchAll: async () => ({ resources: ['OctoCat', 'octocat', 'mona'] }) };
        },
      },
    },
  });

  assert.match(query.query, /c\.status = "pending"/);
  assert.match(query.query, /c\.expiresAt > @now/);
  assert.equal(counts.get('octocat'), 2);
  assert.equal(counts.get('mona'), 1);
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
    providerAccepted: 1,
    providerFailed: 0,
    reasons: {
      alreadySent: 1,
      baselineCreated: 0,
      missingDeveloper: 1,
      noMeaningfulUpdate: 0,
      missingRecipient: 0,
      providerNotConfigured: 0,
      providerRejected: 0,
      deliveryRecordFailed: 0,
    },
  });
  assert.equal(sent[0].idempotencyKey, `weekly-digest-octocat-${weekKey}`);
  assert.equal(recorded[0].delivery.rank, 3);
  assert.equal(recorded[0].delivery.weekKey, weekKey);
  assert.equal(recorded[0].delivery.updateType, 'rank_movement');
});

test('reports privacy-safe aggregate delivery failure reasons', async () => {
  const contacts = [
    { id: 'missing-recipient', login: 'octocat', email: '', lastWeeklyDigestRank: 5 },
    { id: 'not-configured', login: 'octocat', email: 'configured@example.com', lastWeeklyDigestRank: 5 },
    { id: 'provider-rejected', login: 'octocat', email: 'rejected@example.com', lastWeeklyDigestRank: 5 },
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
  assert.equal(summary.providerAccepted, 0);
  assert.equal(summary.providerFailed, 3);
  assert.deepEqual(summary.reasons, {
    alreadySent: 0,
    baselineCreated: 0,
    missingDeveloper: 0,
    noMeaningfulUpdate: 0,
    missingRecipient: 1,
    providerNotConfigured: 1,
    providerRejected: 1,
    deliveryRecordFailed: 0,
  });
  assert.doesNotMatch(JSON.stringify(summary), /example\.com|private details/);
});

test('reports delivery record failures separately from provider failures', async () => {
  const summary = await sendWeeklyDigests({
    contacts: [{ id: 'octocat', login: 'octocat', email: 'octocat@example.com', lastWeeklyDigestRank: 5 }],
    developers,
    preferenceSecret: 'test-secret',
    sendEmail: async () => ({ sent: true, id: 'email-1' }),
    recordDelivery: async () => {
      throw new Error('Cosmos write failed');
    },
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.providerAccepted, 1);
  assert.equal(summary.providerFailed, 0);
  assert.equal(summary.reasons.deliveryRecordFailed, 1);
  assert.equal(summary.reasons.providerRejected, 0);
});

test('skips an unchanged profile without another meaningful update', async () => {
  const summary = await sendWeeklyDigests({
    contacts: [{ id: 'octocat', login: 'octocat', email: 'octocat@example.com', lastWeeklyDigestRank: 3 }],
    developers,
    pendingIntroductionCounts: new Map(),
    preferenceSecret: 'test-secret',
    sendEmail: async () => assert.fail('Empty digest must not be sent'),
  });

  assert.equal(summary.sent, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.reasons.noMeaningfulUpdate, 1);
});

test('records a first rank baseline without sending an empty digest', async () => {
  const baselines = [];
  const summary = await sendWeeklyDigests({
    contacts: [{ id: 'octocat', login: 'octocat', email: 'octocat@example.com' }],
    developers,
    pendingIntroductionCounts: new Map(),
    recordBaseline: async (login, rank) => baselines.push({ login, rank }),
    sendEmail: async () => assert.fail('A baseline is not an email update'),
  });

  assert.deepEqual(baselines, [{ login: 'octocat', rank: 3 }]);
  assert.equal(summary.sent, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.reasons.baselineCreated, 1);
});

test('sends a real introduction signal instead of suppressing a first-run subscriber', async () => {
  const sent = [];
  const summary = await sendWeeklyDigests({
    contacts: [{ id: 'octocat', login: 'octocat', email: 'octocat@example.com' }],
    developers,
    pendingIntroductionCounts: new Map([['octocat', 1]]),
    preferenceSecret: 'test-secret',
    sendEmail: async email => {
      sent.push(email);
      return { sent: true, id: 'email-1' };
    },
    recordDelivery: async () => {},
    recordBaseline: async () => assert.fail('A real signal should establish rank through delivery'),
  });

  assert.equal(sent.length, 1);
  assert.match(sent[0].message.html, /Review requests/);
  assert.equal(summary.sent, 1);
  assert.equal(summary.reasons.baselineCreated, 0);
});