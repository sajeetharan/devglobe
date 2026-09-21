import { getCodingStatsContainer } from './coding-stats-store.js';
import { buildVibeCard, normalizeVibeCardIdentity } from './vibe-card.js';

function publicVibeCard(card) {
  return {
    vibeId: card.vibeId,
    login: card.login,
    name: card.name,
    avatarUrl: card.avatarUrl,
    activeLanguage: card.activeLanguage,
    codingAgent: card.codingAgent,
    codingModel: card.codingModel,
    editor: card.editor,
    durationMinutes: card.durationMinutes,
    developerCount: card.developerCount,
    countryCount: card.countryCount,
    waveCount: card.waveCount,
    createdAt: card.createdAt,
  };
}

export async function saveVibeCard(presence, recap, {
  container = getCodingStatsContainer(),
  vibeId,
  now,
} = {}) {
  if (!container) throw new Error('Vibe Card storage is not configured');
  const card = buildVibeCard(presence, recap, { vibeId, now });
  if (!card) throw new TypeError('Valid public presence and recap are required');
  const { resource } = await container.items.create(card);
  return resource || card;
}

export async function findVibeCard(login, vibeId, container = getCodingStatsContainer()) {
  const identity = normalizeVibeCardIdentity(login, vibeId);
  if (!identity || !container) return null;
  try {
    const { resource } = await container.item(`vibe:${identity.vibeId}`, identity.login).read();
    return resource?.type === 'vibe-card' ? publicVibeCard(resource) : null;
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}
