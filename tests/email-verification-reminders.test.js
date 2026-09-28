import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmailVerificationReminders } from '../lib/email-verification-reminders.js';

test('sends due verification reminders and skips verified or recent contacts', async () => {
  const now = new Date('2026-08-17T14:00:00.000Z');
  const contacts = [
    { id: 'due', login: 'due', email: 'due@example.com', emailVerified: false, transactionalEmailsEnabled: true },
    { id: 'recent', login: 'recent', email: 'recent@example.com', emailVerified: false, transactionalEmailsEnabled: true, lastVerificationReminderAt: '2026-08-16T14:00:00.000Z' },
    { id: 'verified', login: 'verified', email: 'verified@example.com', emailVerified: true, transactionalEmailsEnabled: true },
  ];
  const sent = [];
  const recorded = [];
  const summary = await sendEmailVerificationReminders({
    contacts,
    now,
    createVerification: async login => ({ created: true, email: `${login}@example.com`, token: `${login}-token` }),
    sendEmail: async message => {
      sent.push(message);
      return { sent: true, id: 'email-1' };
    },
    recordDelivery: async (login, delivery) => recorded.push({ login, delivery }),
  });

  assert.deepEqual(summary, { scanned: 3, eligible: 1, sent: 1, skipped: 2, suppressed: 0, failed: 0 });
  assert.equal(sent[0].idempotencyKey, 'email-verification-reminder-due-2026-08-17');
  assert.match(sent[0].message.subject, /^Reminder:/);
  assert.deepEqual(recorded, [{
    login: 'due',
    delivery: { sentAt: '2026-08-17T14:00:00.000Z', providerId: 'email-1' },
  }]);
});

test('does not record a failed reminder delivery', async () => {
  const summary = await sendEmailVerificationReminders({
    contacts: [{ id: 'due', login: 'due', email: 'due@example.com', emailVerified: false, transactionalEmailsEnabled: true }],
    now: new Date('2026-08-17T14:00:00.000Z'),
    createVerification: async () => ({ created: true, email: 'due@example.com', token: 'token' }),
    sendEmail: async () => ({ sent: false, reason: 'unavailable' }),
    recordDelivery: async () => assert.fail('failed delivery must not be recorded'),
  });

  assert.deepEqual(summary, { scanned: 1, eligible: 1, sent: 0, skipped: 0, suppressed: 0, failed: 1 });
});

test('sends one reminder when different logins share an email address', async () => {
  const recipients = new Set();
  const sent = [];
  const summary = await sendEmailVerificationReminders({
    contacts: [
      { id: 'first', login: 'first', email: 'Shared@Example.com', emailVerified: false, transactionalEmailsEnabled: true },
      { id: 'second', login: 'second', email: 'shared@example.com', emailVerified: false, transactionalEmailsEnabled: true },
    ],
    now: new Date('2026-08-17T14:00:00.000Z'),
    claimDelivery: async delivery => {
      const recipient = delivery.recipient.trim().toLowerCase();
      if (recipients.has(recipient)) return { claimed: false, reason: 'recently_delivered' };
      recipients.add(recipient);
      return { claimed: true, id: recipient, deliveryKey: delivery.deliveryKey };
    },
    completeDelivery: async () => ({ completed: true }),
    createVerification: async login => ({ created: true, email: 'shared@example.com', token: `${login}-token` }),
    sendEmail: async email => {
      sent.push(email);
      return { sent: true, id: 'email-1' };
    },
    recordDelivery: async () => {},
  });

  assert.equal(sent.length, 1);
  assert.deepEqual(summary, { scanned: 2, eligible: 2, sent: 1, skipped: 1, suppressed: 1, failed: 0 });
});