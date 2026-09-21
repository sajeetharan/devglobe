import { getCosmosContainer } from './cosmos.js';
import { buildCodingDelta, mergeCodingDay } from './coding-stats.js';

const EXTENSION_USER_RETENTION_DAYS = 400;

export function getCodingStatsContainer() {
  return getCosmosContainer(process.env.COSMOS_CODING_STATS_CONTAINER || 'coding-stats');
}

export function extensionUserFromPresence(presence) {
  const login = String(presence?.login || '').trim().toLowerCase();
  if (!login) return null;
  return {
    id: `${login}:extension-user`,
    type: 'extension-user',
    login,
    name: presence.name || login,
    avatarUrl: presence.avatarUrl || '',
    location: presence.location || '',
    profileAvailable: presence.profileAvailable !== false,
    lat: presence.lat,
    lng: presence.lng,
    activeLanguage: presence.activeLanguage || 'Unknown',
    editor: presence.editor || 'VS Code',
    platform: presence.platform || 'Unknown',
    lastLiveAt: presence.lastHeartbeat,
    ttl: EXTENSION_USER_RETENTION_DAYS * 24 * 60 * 60,
  };
}

export async function saveExtensionUser(presence, container = getCodingStatsContainer()) {
  const user = extensionUserFromPresence(presence);
  if (!user || !container) return null;
  const { resource } = await container.items.upsert(user);
  return resource || user;
}

export async function listExtensionUsers(container = getCodingStatsContainer()) {
  if (!container) throw new Error('Coding stats storage is not configured');
  const { resources } = await container.items.query({
    query: `SELECT c.id, c.login, c.name, c.avatarUrl, c.location, c.profileAvailable,
      c.lat, c.lng, c.activeLanguage, c.editor, c.platform, c.lastLiveAt
      FROM c WHERE c.type = "extension-user"`,
  }).fetchAll();
  return resources
    .map(user => ({
      ...user,
      id: user.login,
      lastHeartbeat: user.lastLiveAt,
      presenceState: 'installed',
    }))
    .sort((left, right) => String(right.lastHeartbeat).localeCompare(String(left.lastHeartbeat)));
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