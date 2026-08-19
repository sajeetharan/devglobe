module.exports = async function weeklyDigest(context) {
  const endpoint = process.env.WEEKLY_DIGEST_URL;
  const secret = process.env.CRON_SECRET;
  if (!endpoint || !secret) {
    throw new Error('WEEKLY_DIGEST_URL and CRON_SECRET are required');
  }

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result = await response.json();
  context.log('DevGlobe weekly digest', {
    status: response.status,
    eligible: result.eligible,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
  });
  if (!response.ok) throw new Error(`Weekly digest returned ${response.status}`);
};