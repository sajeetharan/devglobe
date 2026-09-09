import { getCosmosContainer } from './cosmos.js';
import {
  addWave,
  deduplicateLivePresence,
  isOlderPresenceSession,
  isSamePresenceSession,
  normalizeWaveCooldowns,
  normalizeWaves,
  presenceActivityState,
  presenceMetadataRetryAfter,
  presenceReplacementRetryAfter,
  presenceRetryAfter,
} from './live-presence.js';

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

export async function saveLivePresence(presence, {
  allowRapidUpdate = false,
  container = getLivePresenceContainer(),
} = {}) {
  if (!container) throw new Error('Live presence storage is not configured');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await findLivePresence(presence.login, container);
    if (isOlderPresenceSession(current, presence)) {
      const error = new Error('A newer editor session is already live');
      error.code = 'stale-session';
      throw error;
    }
    const sameSession = isSamePresenceSession(current, presence);
    if (attempt > 0) {
      const retryAfter = allowRapidUpdate
        ? presenceMetadataRetryAfter(current)
        : sameSession
          ? presenceRetryAfter(current)
          : presenceReplacementRetryAfter(current);
      if (retryAfter > 0) {
        const error = new Error('Heartbeat rate limit exceeded');
        error.code = 'heartbeat-rate-limit';
        error.retryAfter = retryAfter;
        throw error;
      }
    }
    const next = {
      ...presence,
      waves: normalizeWaves(sameSession ? current.waves : presence.waves),
      waveCooldowns: normalizeWaveCooldowns(
        sameSession ? current.waveCooldowns : presence.waveCooldowns,
      ),
    };
    try {
      if (!current) {
        const { resource } = await container.items.create(next);
        return resource || next;
      }
      const { resource } = await container.item(next.id, next.id).replace(next, {
        accessCondition: { type: 'IfMatch', condition: current._etag },
      });
      return resource || next;
    } catch (error) {
      if (![409, 412].includes(error.code) || attempt === 2) throw error;
    }
  }
  return presence;
}

export async function removeLivePresence(
  login,
  expectedSessionId = '',
  container = getLivePresenceContainer(),
) {
  if (!container) throw new Error('Live presence storage is not configured');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await findLivePresence(login, container);
    if (!current) return true;
    if (expectedSessionId && current.sessionId !== expectedSessionId) return false;
    try {
      await container.item(login.toLowerCase(), login.toLowerCase()).delete({
        accessCondition: { type: 'IfMatch', condition: current._etag },
      });
      return true;
    } catch (error) {
      if (error.code === 404) return true;
      if (error.code !== 412 || attempt === 2) throw error;
    }
  }
  return false;
}

export async function listLivePresence(container = getLivePresenceContainer(), now = Date.now()) {
  if (!container) return [];
  const { resources } = await container.items.query({
    query: `SELECT c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
      c.profileAvailable, c.activeLanguage, c.editor, c.platform, c.sessionStartedAt, c.lastHeartbeat
      , c.codingStatus, c.focusStartedAt, c.focusEndsAt, c.waves
      FROM c WHERE c.type = 'live-presence'`,
  }).fetchAll();
  return deduplicateLivePresence(resources)
    .map(developer => ({
      ...developer,
      waveCount: normalizeWaves(developer.waves).length,
      waves: undefined,
      presenceState: presenceActivityState(developer, now),
    }))
    .filter(developer => developer.presenceState);
}

export async function waveToDeveloper(targetLogin, sender, container = getLivePresenceContainer()) {
  if (!container) throw new Error('Live presence storage is not configured');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await findLivePresence(targetLogin, container);
    if (!current || !presenceActivityState(current)) {
      const error = new Error('This developer is no longer on the globe');
      error.code = 404;
      throw error;
    }
    const next = addWave(current, sender);
    try {
      const { resource } = await container.item(current.id, current.id).replace(next, {
        accessCondition: { type: 'IfMatch', condition: current._etag },
      });
      return resource || next;
    } catch (error) {
      if (error.retryAfter || ![409, 412].includes(error.code) || attempt === 2) throw error;
    }
  }
  return null;
}