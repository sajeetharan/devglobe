import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimApprovedEmail,
  buildClaimWelcomeEmail,
  buildEmailVerificationEmail,
  buildNominationApprovedEmail,
  sendLifecycleEmail,
} from '../lib/lifecycle-email.js';

test('builds combined claim and automatic approval email', () => {
  const message = buildClaimApprovedEmail({ login: 'octocat', name: 'Octocat' });

  assert.match(message.subject, /claimed and live/i);
  assert.match(message.text, /approved automatically/i);
  assert.match(message.text, /Generate identity card/);
  assert.match(message.html, /Your profile is live/);
});

test('builds claim email with an encoded profile link and escaped HTML', () => {
  const message = buildClaimWelcomeEmail({ login: 'dev user', name: '<Dev & Co>' });

  assert.match(message.subject, /claimed/i);
  assert.match(message.text, /developer\/dev%20user/);
  assert.match(message.html, /&lt;Dev &amp; Co&gt;/);
  assert.doesNotMatch(message.html, /<Dev & Co>/);
  assert.match(message.html, /src="https:\/\/www\.devglobe\.dev\/devglobe\.png"/);
  assert.match(message.html, /The open-source talent graph for humans and AI agents\./);
  assert.match(message.html, /Generate identity card/);
  assert.match(message.html, /Star DevGlobe on GitHub/);
  assert.match(message.text, /github\.com\/sajeetharan\/devglobe/);
});

test('builds nomination approval email with claim follow-up', () => {
  const message = buildNominationApprovedEmail({ login: 'octocat', name: 'Octocat' });

  assert.match(message.subject, /approved/i);
  assert.match(message.text, /claim it/i);
  assert.match(message.html, /View your profile/);
  assert.match(message.html, /github\.com\/sajeetharan\/devglobe/);
});

test('skips delivery when recipient or provider configuration is missing', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;

  try {
    assert.deepEqual(await sendLifecycleEmail({ to: '', message: {} }), {
      sent: false,
      reason: 'missing_recipient',
    });
    assert.deepEqual(await sendLifecycleEmail({ to: 'dev@example.com', message: {} }), {
      sent: false,
      reason: 'not_configured',
    });
  } finally {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  }
});

test('sends through Resend with an idempotency key', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'DevGlobe <hello@example.com>';
  let request;

  try {
    const result = await sendLifecycleEmail({
      to: 'dev@example.com',
      message: { subject: 'Subject', text: 'Text', html: '<p>HTML</p>' },
      idempotencyKey: 'profile-claimed-octocat',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ id: 'email-123' }) };
      },
    });

    assert.deepEqual(result, { sent: true, id: 'email-123' });
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers['Idempotency-Key'], 'profile-claimed-octocat');
    assert.deepEqual(JSON.parse(request.options.body).to, ['dev@example.com']);
  } finally {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  }
});

test('throws a sanitized provider error', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'hello@example.com';

  try {
    await assert.rejects(sendLifecycleEmail({
      to: 'dev@example.com',
      message: { subject: 'Subject', text: 'Text', html: '<p>HTML</p>' },
      fetchImpl: async () => ({ ok: false, status: 422 }),
    }), /status 422/);
  } finally {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  }
});

test('builds an encoded email verification link', () => {
  const message = buildEmailVerificationEmail({ login: 'dev user', token: 'token+/=' });

  assert.match(message.subject, /verify/i);
  assert.match(message.text, /login=dev\+user/);
  assert.match(message.text, /token=token%2B%2F%3D/);
  assert.match(message.text, /24 hours/);
  assert.match(message.html, /Verify email/);
  assert.match(message.html, /devglobe\.png/);
  assert.match(message.html, /Generate identity card/);
});