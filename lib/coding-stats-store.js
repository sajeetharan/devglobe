import { getCosmosContainer } from './cosmos.js';
import { buildCodingDelta, mergeCodingDay } from './coding-stats.js';

export function getCodingStatsContainer() {
  return getCosmosContainer(process.env.COSMOS_CODING_STATS_CONTAINER || 'coding-stats');
}

export async function recordCodingHeartbeat(previous, current, container = getCodingStatsContainer()) {
  const delta = buildCodingDelta(previous, current);
  if (!delta || !container) return null;
  const id = `${delta.login}:${delta.day}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { resource } = await container.item(id, delta.login).read().catch(error => {
      if (error.code === 404) return { resource: null };
      throw error;
    });
    const next = mergeCodingDay(resource, delta);
    try {
      if (!resource) {
        const { resource: created } = await container.items.create(next);
        return created;
      }
      const { resource: replaced } = await container.item(id, delta.login).replace(next, {
        accessCondition: { type: 'IfMatch', condition: resource._etag },
      });
      return replaced;
    } catch (error) {
      if (![409, 412].includes(error.code) || attempt === 2) throw error;
    }
  }
  return null;
}

export async function listCodingDays(login, days = 400, container = getCodingStatsContainer()) {
  if (!container) throw new Error('Coding stats storage is not configured');
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { resources } = await container.items.query({
    query: `SELECT c.day, c.activeSeconds, c.heartbeatCount, c.languages, c.editors
      FROM c
      WHERE c.login = @login AND c.type = "coding-stats-day" AND c.day >= @cutoff
      ORDER BY c.day DESC`,
    parameters: [
      { name: '@login', value: login.toLowerCase() },
      { name: '@cutoff', value: cutoff },
    ],
  }, { partitionKey: login.toLowerCase() }).fetchAll();
  return resources;
}