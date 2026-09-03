module.exports = async function maintainerOutreachReport(context) {
  const endpoint = process.env.MAINTAINER_OUTREACH_REPORT_URL;
  const secret = process.env.CRON_SECRET;
  if (!endpoint || !secret) throw new Error('MAINTAINER_OUTREACH_REPORT_URL and CRON_SECRET are required');

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result = await response.json();
  context.log('DevGlobe maintainer outreach report', {
    status: response.status,
    selected: result.selected,
    contacted: result.contacted,
    claimed: result.claimed,
    reportSent: result.reportSent,
    reason: result.reason,
  });
  if (!response.ok) throw new Error(`Maintainer outreach report returned ${response.status}`);
};