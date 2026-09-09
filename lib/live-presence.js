const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const MAX_FIELD_LENGTH = 80;

export const LIVE_PRESENCE_ACTIVE_SECONDS = 90;
export const LIVE_PRESENCE_RECENT_SECONDS = 15 * 60;
export const LIVE_PRESENCE_TTL_SECONDS = LIVE_PRESENCE_RECENT_SECONDS;
export const LIVE_PRESENCE_MIN_INTERVAL_SECONDS = 10;
export const LIVE_PRESENCE_METADATA_MIN_INTERVAL_SECONDS = 2;
export const LIVE_PRESENCE_REPLACEMENT_MIN_INTERVAL_SECONDS = 2;
export const WAVE_COOLDOWN_SECONDS = 10 * 60;
export const MAX_PRESENCE_WAVES = 20;
const MAX_WAVE_COOLDOWNS = 200;
export const CODING_STATUSES = Object.freeze([
  'building',
  'debugging',
  'reviewing',
  'learning',
  'open-source',
  'pairing',
]);

function boundedText(value, maximum = MAX_FIELD_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function finiteCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function normalizedCodingStatus(value) {
  const status = boundedText(value, 24).toLowerCase();
  return CODING_STATUSES.includes(status) ? status : '';
}

function normalizedAgentIdentity(heartbeat) {
  const codingAgent = boundedText(heartbeat?.codingAgent, 50).replace(/\s+/g, ' ');
  if (!codingAgent) return { codingAgent: '', codingModel: '' };
  return {
    codingAgent,
    codingModel: boundedText(heartbeat?.codingModel, 80).replace(/\s+/g, ' '),
  };
}

function normalizedFocus(heartbeat, now) {
  const startedAt = Date.parse(heartbeat?.focusStartedAt || '');
  const endsAt = Date.parse(heartbeat?.focusEndsAt || '');
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= now.getTime()) return {};
  const maximumEnd = startedAt + 60 * 60 * 1000;
  if (endsAt <= startedAt || endsAt > maximumEnd) return {};
  return {
    focusStartedAt: new Date(startedAt).toISOString(),
    focusEndsAt: new Date(endsAt).toISOString(),
  };
}

export function normalizeLivePresence({
  heartbeat,
  profile,
  previousPresence = null,
  now = new Date(),
}) {
  const login = boundedText(profile?.login || heartbeat?.login, 39).toLowerCase();
  const lat = finiteCoordinate(profile?.lat, -90, 90);
  const lng = finiteCoordinate(profile?.lng, -180, 180);
  if (!LOGIN_PATTERN.test(login) || lat === null || lng === null) return null;

  const timestamp = now.toISOString();
  const incomingSessionId = boundedText(heartbeat?.sessionId, 80);
  const incomingSessionStartedAt = boundedText(heartbeat?.sessionStartedAt, 40) || timestamp;
  const incomingSession = {
    sessionId: incomingSessionId,
    sessionStartedAt: incomingSessionStartedAt,
  };
  const sameSession = isSamePresenceSession(previousPresence, incomingSession);
  return {
    id: login,
    type: 'live-presence',
    login,
    name: boundedText(profile?.name) || login,
    avatarUrl: boundedText(profile?.avatarUrl, 500),
    location: boundedText(profile?.location),
    profileAvailable: profile?.profileAvailable !== false,
    lat,
    lng,
    activeLanguage: boundedText(heartbeat?.activeLanguage, 40) || 'Unknown',
    editor: boundedText(heartbeat?.editor, 40) || 'VS Code',
    platform: boundedText(heartbeat?.platform, 40) || 'Unknown',
    codingStatus: normalizedCodingStatus(heartbeat?.codingStatus),
    ...normalizedAgentIdentity(heartbeat),
    sessionId: incomingSessionId,
    sessionStartedAt: incomingSessionStartedAt,
    lastHeartbeat: timestamp,
    lastMetadataAt: heartbeat?.metadataOnly === true
      ? timestamp
      : boundedText(previousPresence?.lastMetadataAt, 40),
    waves: normalizeWaves(sameSession ? previousPresence.waves : []),
    waveCooldowns: normalizeWaveCooldowns(sameSession ? previousPresence.waveCooldowns : [], now),
    ...normalizedFocus(heartbeat, now),
    ttl: LIVE_PRESENCE_TTL_SECONDS,
  };
}

export function presenceProfileFromIdentity(profile, identity = {}) {
  if (profile) return { ...profile, profileAvailable: true };
  const login = boundedText(identity.login, 39).toLowerCase();
  if (!LOGIN_PATTERN.test(login)) return null;
  return {
    login,
    name: boundedText(identity.name) || login,
    avatarUrl: boundedText(identity.avatarUrl, 500),
    location: boundedText(identity.location),
    lat: null,
    lng: null,
    profileAvailable: false,
  };
}

export async function resolvePresenceProfile(profile, {
  fallbackLocation = '',
  previousPresence = null,
  geocode,
} = {}) {
  if (!profile) return null;
  const lat = finiteCoordinate(profile.lat, -90, 90);
  const lng = finiteCoordinate(profile.lng, -180, 180);
  if (lat !== null && lng !== null) return profile;

  const fallback = boundedText(fallbackLocation);
  const previousLocation = boundedText(previousPresence?.location);
  const previousLat = finiteCoordinate(previousPresence?.lat, -90, 90);
  const previousLng = finiteCoordinate(previousPresence?.lng, -180, 180);
  const locationChanged = fallback
    && fallback.toLowerCase() !== previousLocation.toLowerCase();
  if (!locationChanged && previousLat !== null && previousLng !== null) {
    return {
      ...profile,
      location: previousLocation || fallback || boundedText(profile.location),
      lat: previousLat,
      lng: previousLng,
    };
  }

  const profileLocation = boundedText(profile.location);
  const location = fallback || (profileLocation.toLowerCase() === 'unknown' ? '' : profileLocation);
  if (!location || typeof geocode !== 'function') return profile;

  const coordinates = await geocode(location);
  const geocodedLat = finiteCoordinate(coordinates?.lat, -90, 90);
  const geocodedLng = finiteCoordinate(coordinates?.lng, -180, 180);
  return geocodedLat === null || geocodedLng === null
    ? profile
    : { ...profile, location, lat: geocodedLat, lng: geocodedLng };
}

export function isLivePresenceActive(presence, now = Date.now()) {
  const lastHeartbeat = Date.parse(presence?.lastHeartbeat || '');
  return Number.isFinite(lastHeartbeat)
    && now - lastHeartbeat < LIVE_PRESENCE_ACTIVE_SECONDS * 1000;
}

export function presenceActivityState(presence, now = Date.now()) {
  const lastHeartbeat = Date.parse(presence?.lastHeartbeat || '');
  if (!Number.isFinite(lastHeartbeat)) return null;
  const age = now - lastHeartbeat;
  if (age < LIVE_PRESENCE_ACTIVE_SECONDS * 1000) return 'live';
  if (age < LIVE_PRESENCE_RECENT_SECONDS * 1000) return 'recent';
  return null;
}

export function presenceRetryAfter(presence, now = Date.now()) {
  const lastHeartbeat = Date.parse(presence?.lastHeartbeat || '');
  if (!Number.isFinite(lastHeartbeat)) return 0;
  const elapsedSeconds = Math.floor((now - lastHeartbeat) / 1000);
  return Math.max(0, LIVE_PRESENCE_MIN_INTERVAL_SECONDS - elapsedSeconds);
}

export function presenceMetadataRetryAfter(presence, now = Date.now()) {
  const lastMetadataAt = Date.parse(presence?.lastMetadataAt || '');
  if (!Number.isFinite(lastMetadataAt)) return 0;
  const elapsedSeconds = Math.floor((now - lastMetadataAt) / 1000);
  return Math.max(0, LIVE_PRESENCE_METADATA_MIN_INTERVAL_SECONDS - elapsedSeconds);
}

export function presenceReplacementRetryAfter(presence, now = Date.now()) {
  const lastHeartbeat = Date.parse(presence?.lastHeartbeat || '');
  if (!Number.isFinite(lastHeartbeat)) return 0;
  const elapsedSeconds = Math.floor((now - lastHeartbeat) / 1000);
  return Math.max(0, LIVE_PRESENCE_REPLACEMENT_MIN_INTERVAL_SECONDS - elapsedSeconds);
}

export function diffLivePresence(previous, next) {
  const before = new Map(previous.map(developer => [developer.id, developer]));
  const after = new Map(next.map(developer => [developer.id, developer]));
  const updates = [];

  for (const developer of next) {
    const existing = before.get(developer.id);
    if (!existing
      || existing.lastHeartbeat !== developer.lastHeartbeat
      || existing.presenceState !== developer.presenceState
      || existing.waveCount !== developer.waveCount) {
      updates.push({ type: 'upsert', developer });
    }
  }
  for (const developer of previous) {
    if (!after.has(developer.id)) updates.push({ type: 'delete', developerId: developer.id });
  }
  return updates;
}

export function normalizeWaves(waves) {
  if (!Array.isArray(waves)) return [];
  return waves.flatMap((wave) => {
    const fromLogin = boundedText(wave?.fromLogin, 39).toLowerCase();
    const sentAt = Date.parse(wave?.sentAt || '');
    if (!LOGIN_PATTERN.test(fromLogin) || !Number.isFinite(sentAt)) return [];
    return [{
      fromLogin,
      fromName: boundedText(wave?.fromName) || fromLogin,
      sentAt: new Date(sentAt).toISOString(),
    }];
  }).sort((left, right) => right.sentAt.localeCompare(left.sentAt)).slice(0, MAX_PRESENCE_WAVES);
}

export function normalizeWaveCooldowns(cooldowns, now = new Date()) {
  if (!Array.isArray(cooldowns)) return [];
  const cutoff = now.getTime() - WAVE_COOLDOWN_SECONDS * 1000;
  return cooldowns.flatMap((cooldown) => {
    const fromLogin = boundedText(cooldown?.fromLogin, 39).toLowerCase();
    const sentAt = Date.parse(cooldown?.sentAt || '');
    if (!LOGIN_PATTERN.test(fromLogin) || !Number.isFinite(sentAt) || sentAt <= cutoff) return [];
    return [{ fromLogin, sentAt: new Date(sentAt).toISOString() }];
  }).sort((left, right) => right.sentAt.localeCompare(left.sentAt)).slice(0, MAX_WAVE_COOLDOWNS);
}

export function addWave(presence, sender, now = new Date()) {
  const targetLogin = boundedText(presence?.login, 39).toLowerCase();
  const fromLogin = boundedText(sender?.login, 39).toLowerCase();
  if (!LOGIN_PATTERN.test(targetLogin) || !LOGIN_PATTERN.test(fromLogin)) {
    throw new Error('A valid developer is required to wave');
  }
  if (targetLogin === fromLogin) throw new Error('You cannot wave to yourself');

  const waves = normalizeWaves(presence?.waves);
  const cooldowns = normalizeWaveCooldowns(presence?.waveCooldowns, now);
  const previous = cooldowns.find(cooldown => cooldown.fromLogin === fromLogin);
  const retryAfter = previous
    ? WAVE_COOLDOWN_SECONDS - Math.floor((now.getTime() - Date.parse(previous.sentAt)) / 1000)
    : 0;
  if (retryAfter > 0) {
    const error = new Error('You already waved to this developer recently');
    error.retryAfter = retryAfter;
    throw error;
  }

  return {
    ...presence,
    waves: normalizeWaves([{
      fromLogin,
      fromName: boundedText(sender?.name) || fromLogin,
      sentAt: now.toISOString(),
    }, ...waves]),
    waveCooldowns: normalizeWaveCooldowns([{
      fromLogin,
      sentAt: now.toISOString(),
    }, ...cooldowns], now),
  };
}

export function deduplicateLivePresence(developers) {
  const byLogin = new Map();
  for (const developer of developers) {
    const login = boundedText(developer?.login || developer?.id, 39).toLowerCase();
    if (!LOGIN_PATTERN.test(login)) continue;
    const normalized = { ...developer, id: login, login };
    const existing = byLogin.get(login);
    if (!existing || String(normalized.lastHeartbeat || '') > String(existing.lastHeartbeat || '')) {
      byLogin.set(login, normalized);
    }
  }
  return [...byLogin.values()];
}

export function isOlderPresenceSession(previous, next) {
  if (!previous || !next || isSamePresenceSession(previous, next)) return false;
  const previousStartedAt = Date.parse(previous.sessionStartedAt || '');
  const nextStartedAt = Date.parse(next.sessionStartedAt || '');
  return Number.isFinite(previousStartedAt)
    && Number.isFinite(nextStartedAt)
    && nextStartedAt < previousStartedAt;
}

export function isSamePresenceSession(left, right) {
  if (!left || !right) return false;
  if (left.sessionId || right.sessionId) {
    return Boolean(left.sessionId && right.sessionId && left.sessionId === right.sessionId);
  }
  return Boolean(
    left.sessionStartedAt
    && right.sessionStartedAt
    && left.sessionStartedAt === right.sessionStartedAt
  );
}

export function buildPresenceRecap(presence, peers, now = new Date()) {
  const startedAt = Date.parse(presence?.sessionStartedAt || '');
  const durationMinutes = Number.isFinite(startedAt)
    ? Math.max(1, Math.round((now.getTime() - startedAt) / 60000))
    : 0;
  const countries = new Set(
    peers
      .filter(peer => peer.login !== presence?.login)
      .map(peer => boundedText(peer.location).split(',').at(-1)?.trim().toLowerCase())
      .filter(Boolean)
  );
  return {
    durationMinutes,
    developerCount: peers.filter(peer => peer.login !== presence?.login).length,
    countryCount: countries.size,
    waveCount: normalizeWaves(presence?.waves).length,
  };
}