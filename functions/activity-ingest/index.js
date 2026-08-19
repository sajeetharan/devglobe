const { getContainer } = require('../shared/cosmos');

module.exports = async function activityIngest(context) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'DevGlobe', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch('https://api.github.com/events?per_page=100', { headers });
  if (!response.ok) throw new Error(`GitHub Events API returned ${response.status}`);

  const events = await response.json();
  const developerContainer = getContainer();
  const activityContainer = getContainer(process.env.COSMOS_ACTIVITY_CONTAINER || 'activities');
  const logins = [...new Set(events.map(event => event.actor?.login?.toLowerCase()).filter(Boolean))];
  const { resources: indexed } = await developerContainer.items.query({
    query: 'SELECT VALUE LOWER(c.login) FROM c WHERE ARRAY_CONTAINS(@logins, LOWER(c.login))',
    parameters: [{ name: '@logins', value: logins }],
  }).fetchAll();
  const indexedLogins = new Set(indexed);
  let inserted = 0;

  for (const event of events) {
    if (!indexedLogins.has(event.actor?.login?.toLowerCase()) || !event.id || !event.created_at) continue;
    const document = {
      id: String(event.id),
      login: event.actor.login,
      avatarUrl: event.actor.avatar_url || null,
      type: event.type || 'UnknownEvent',
      description: event.repo?.name ? `Contributed to ${event.repo.name}` : 'Contributed on GitHub',
      repo: event.repo?.name || null,
      url: event.repo?.name ? `https://github.com/${event.repo.name}` : `https://github.com/${event.actor.login}`,
      createdAt: new Date(event.created_at).toISOString(),
      ingestedAt: new Date().toISOString(),
      day: event.created_at.slice(0, 10),
      ttl: 48 * 60 * 60,
      schemaVersion: 1,
      documentType: 'github-activity',
    };
    try {
      await activityContainer.items.create(document, { disableAutomaticIdGeneration: true });
      inserted += 1;
    } catch (error) {
      if (error.code !== 409) throw error;
    }
  }
  context.log('DevGlobe activity ingestion', { fetched: events.length, matched: indexedLogins.size, inserted });
};