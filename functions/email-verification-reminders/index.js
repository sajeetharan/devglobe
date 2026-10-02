module.exports = async function emailVerificationReminders(context) {
  const endpoint = process.env.EMAIL_VERIFICATION_REMINDERS_URL;
  const secret = process.env.CRON_SECRET;
  if (!endpoint || !secret) {
    throw new Error('EMAIL_VERIFICATION_REMINDERS_URL and CRON_SECRET are required');
  }

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result = await response.json();
  context.log('DevGlobe email verification reminders', {
    status: response.status,
    scanned: result.scanned,
    eligible: result.eligible,
    sent: result.sent,
    skipped: result.skipped,
    suppressed: result.suppressed,
    failed: result.failed,
  });
  if (!response.ok) throw new Error(`Email verification reminders returned ${response.status}`);
};