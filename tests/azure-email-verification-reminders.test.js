import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runEmailVerificationReminders = require('../functions/email-verification-reminders/index.js');

test('Azure timer invokes the protected verification reminder endpoint', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.EMAIL_VERIFICATION_REMINDERS_URL;
  const originalSecret = process.env.CRON_SECRET;
  const logs = [];

  try {
    delete process.env.EMAIL_VERIFICATION_REMINDERS_URL;
    delete process.env.CRON_SECRET;
    await assert.rejects(
      runEmailVerificationReminders({ log() {} }),
      /EMAIL_VERIFICATION_REMINDERS_URL and CRON_SECRET are required/
    );

    process.env.EMAIL_VERIFICATION_REMINDERS_URL = 'https://example.test/api/cron/email-verification-reminders';
    process.env.CRON_SECRET = 'test-secret';
    global.fetch = async (url, options) => {
      assert.equal(url, process.env.EMAIL_VERIFICATION_REMINDERS_URL);
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      return {
        ok: true,
        status: 200,
        json: async () => ({ scanned: 7, eligible: 7, sent: 7, skipped: 0, suppressed: 0, failed: 0 }),
      };
    };

    await runEmailVerificationReminders({ log: (...args) => logs.push(args) });
    assert.deepEqual(logs[0][1], {
      status: 200,
      scanned: 7,
      eligible: 7,
      sent: 7,
      skipped: 0,
      suppressed: 0,
      failed: 0,
    });

    global.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'failed' }),
    });
    await assert.rejects(
      runEmailVerificationReminders({ log() {} }),
      /Email verification reminders returned 500/
    );
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EMAIL_VERIFICATION_REMINDERS_URL;
    else process.env.EMAIL_VERIFICATION_REMINDERS_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
});