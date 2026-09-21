const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const VIBE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETENTION_DAYS = 400;

function boundedText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function boundedCount(value, maximum = 1_000_000) {
  const number = Math.floor(Number(value) || 0);
  return Math.min(Math.max(number, 0), maximum);
}

export function normalizeVibeCardIdentity(login, vibeId) {
  const normalizedLogin = boundedText(login, 39).toLowerCase();
  const normalizedId = boundedText(vibeId, 36).toLowerCase();
  if (!LOGIN_PATTERN.test(normalizedLogin) || !VIBE_ID_PATTERN.test(normalizedId)) return null;
  return { login: normalizedLogin, vibeId: normalizedId };
}

export function buildVibeCard(presence, recap, {
  vibeId = globalThis.crypto.randomUUID(),
  now = new Date(),
} = {}) {
  const identity = normalizeVibeCardIdentity(presence?.login, vibeId);
  if (!identity || !Number.isFinite(now.getTime())) return null;

  return {
    id: `vibe:${identity.vibeId}`,
    type: 'vibe-card',
    vibeId: identity.vibeId,
    login: identity.login,
    name: boundedText(presence.name, 80) || identity.login,
    avatarUrl: boundedText(presence.avatarUrl, 500),
    activeLanguage: boundedText(presence.activeLanguage, 40) || 'Code',
    codingAgent: boundedText(presence.codingAgent, 50),
    codingModel: boundedText(presence.codingModel, 80),
    editor: boundedText(presence.editor, 40) || 'VS Code',
    durationMinutes: boundedCount(recap?.durationMinutes, 7 * 24 * 60),
    developerCount: boundedCount(recap?.developerCount),
    countryCount: boundedCount(recap?.countryCount),
    waveCount: boundedCount(recap?.waveCount),
    createdAt: now.toISOString(),
    ttl: RETENTION_DAYS * 24 * 60 * 60,
  };
}

export function formatVibeDuration(minutes) {
  const value = boundedCount(minutes, 7 * 24 * 60);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function vibeShareText(card) {
  const duration = formatVibeDuration(card?.durationMinutes);
  const language = boundedText(card?.activeLanguage, 40) || 'coding';
  const agent = boundedText(card?.codingAgent, 50);
  const companion = agent ? ` with ${agent}` : '';
  const developers = boundedCount(card?.developerCount);
  const countries = boundedCount(card?.countryCount);
  const community = developers > 0
    ? ` alongside ${developers} ${developers === 1 ? 'developer' : 'developers'}${countries > 0 ? ` across ${countries} ${countries === 1 ? 'country' : 'countries'}` : ''}`
    : '';
  return `I just finished a ${duration} ${language} vibe coding session${companion}${community}.`;
}
