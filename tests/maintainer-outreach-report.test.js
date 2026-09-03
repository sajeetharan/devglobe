import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMaintainerOutreachReportEmail,
  sendMaintainerOutreachReport,
} from '../lib/maintainer-outreach-report.js';

const report = { selected: 10, pending: 2, approved: 1, contacted: 5, profileViewed: 2, claimed: 1 };

test('builds an aggregate report with conversion rates and no profile identities', () => {
  const message = buildMaintainerOutreachReportEmail(report);
  assert.match(message.text, /Profile viewed: 2 \(40%\)/);
  assert.match(message.text, /Claimed: 1 \(20%\)/);
  assert.doesNotMatch(JSON.stringify(message), /login|recipient/i);
});

test('sends one idempotent operator report through the existing email provider', async () => {
  let request;
  const summary = await sendMaintainerOutreachReport({
    now: new Date('2026-09-07T13:30:00.000Z'),
    recipient: 'operator@example.com',
    loadReport: async () => report,
    sendEmail: async value => {
      request = value;
      return { sent: true, id: 'email-1' };
    },
  });
  assert.equal(summary.reportSent, true);
  assert.equal(request.to, 'operator@example.com');
  assert.equal(request.idempotencyKey, 'maintainer-outreach-report-2026-09-07');
});

test('skips email cleanly when the operator recipient is absent', async () => {
  const summary = await sendMaintainerOutreachReport({
    recipient: '',
    loadReport: async () => report,
  });
  assert.equal(summary.reportSent, false);
  assert.equal(summary.reason, 'missing_recipient');
});