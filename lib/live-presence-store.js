import { getCosmosContainer } from './cosmos.js';
import { isLivePresenceActive } from './live-presence.js';

export function getLivePresenceContainer() {
  return getCosmosContainer(process.env.COSMOS_LIVE_PRESENCE_CONTAINER || 'live-presence');
}

export async function findPresenceProfile(login, container = getCosmosContainer()) {
  if (!container) return null;
  const { resources } = await container.items.query({
    query: `SELECT TOP 1 c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng
      FROM c
      WHERE LOWER(c.login) = @login
        AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
    parameters: [{ name: '@login', value: login.toLowerCase() }],
  }).fetchAll();
  return resources[0] || null;
}

export async function findLivePresence(login, container = getLivePresenceContainer()) {
  if (!container) return null;
  try {
    const { resource } = await container.item(login.toLowerCase(), login.toLowerCase()).read();
    return resource || null;
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function saveLivePresence(presence, container = getLivePresenceContainer()) {
  if (!container) throw new Error('Live presence storage is not configured');
  await container.items.upsert(presence);
  return presence;
}

export async function removeLivePresence(login, container = getLivePresenceContainer()) {
  if (!container) throw new Error('Live presence storage is not configured');
  try {
    await container.item(login.toLowerCase(), login.toLowerCase()).delete();
  } catch (error) {
    if (error.code !== 404) throw error;
  }
}

export async function listLivePresence(container = getLivePresenceContainer(), now = Date.now()) {
  if (!container) return [];
  const { resources } = await container.items.query({
    query: `SELECT c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
      c.activeLanguage, c.editor, c.platform, c.sessionStartedAt, c.lastHeartbeat
      FROM c WHERE c.type = 'live-presence'`,
  }).fetchAll();
  return resources.filter(developer => isLivePresenceActive(developer, now));
}