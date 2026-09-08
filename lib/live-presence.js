const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const MAX_FIELD_LENGTH = 80;

export const LIVE_PRESENCE_ACTIVE_SECONDS = 90;
export const LIVE_PRESENCE_RECENT_SECONDS = 15 * 60;
export const LIVE_PRESENCE_TTL_SECONDS = LIVE_PRESENCE_RECENT_SECONDS;
export const LIVE_PRESENCE_MIN_INTERVAL_SECONDS = 10;

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

export function normalizeLivePresence({ heartbeat, profile, now = new Date() }) {
  const login = boundedText(profile?.login || heartbeat?.login, 39).toLowerCase();
  const lat = finiteCoordinate(profile?.lat, -90, 90);
  const lng = finiteCoordinate(profile?.lng, -180, 180);
  if (!LOGIN_PATTERN.test(login) || lat === null || lng === null) return null;

  const timestamp = now.toISOString();
  return {
    id: login,
    type: 'live-presence',
    login,
    name: boundedText(profile?.name) || login,
    avatarUrl: boundedText(profile?.avatarUrl, 500),
    location: boundedText(profile?.location),
    lat,
    lng,
    activeLanguage: boundedText(heartbeat?.activeLanguage, 40) || 'Unknown',
    editor: boundedText(heartbeat?.editor, 40) || 'VS Code',
    platform: boundedText(heartbeat?.platform, 40) || 'Unknown',
    sessionStartedAt: boundedText(heartbeat?.sessionStartedAt, 40) || timestamp,
    lastHeartbeat: timestamp,
    ttl: LIVE_PRESENCE_TTL_SECONDS,
  };
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

export function diffLivePresence(previous, next) {
  const before = new Map(previous.map(developer => [developer.id, developer]));
  const after = new Map(next.map(developer => [developer.id, developer]));
  const updates = [];

  for (const developer of next) {
    const existing = before.get(developer.id);
    if (!existing
      || existing.lastHeartbeat !== developer.lastHeartbeat
      || existing.presenceState !== developer.presenceState) {
      updates.push({ type: 'upsert', developer });
    }
  }
  for (const developer of previous) {
    if (!after.has(developer.id)) updates.push({ type: 'delete', developerId: developer.id });
  }
  return updates;
}