module.exports = async function maintainerOutreach(context) {
  const endpoint = process.env.MAINTAINER_OUTREACH_URL;
  const secret = process.env.CRON_SECRET;
  if (!endpoint || !secret) throw new Error('MAINTAINER_OUTREACH_URL and CRON_SECRET are required');

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result = await response.json();
  context.log('DevGlobe maintainer outreach queue', {
    status: response.status,
    selected: result.selected,
    queued: result.queued,
    delivery: result.delivery,
  });
  if (!response.ok) throw new Error(`Maintainer outreach queue returned ${response.status}`);
};