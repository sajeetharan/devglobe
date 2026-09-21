import { createHash } from 'node:crypto';

export const MISSION_PREVIEW_CACHE_MS = 15 * 60 * 1000;

export function missionPreviewPoolId(preferences) {
  const key = createHash('sha256').update(JSON.stringify(preferences)).digest('base64url').slice(0, 24);
  return `mission-preview-pool:${key}`;
}

export async function readMissionPreviewPool(container, preferences, now = new Date()) {
  const id = missionPreviewPoolId(preferences);
  try {
    const { resource } = await container.item(id, id).read();
    return Date.parse(resource?.expiresAt) > now.getTime() && Array.isArray(resource?.opportunities)
      ? resource.opportunities
      : null;
  } catch (error) {
    if (error.code === 404 || error.statusCode === 404) return null;
    throw error;
  }
}

export async function writeMissionPreviewPool(container, preferences, opportunities, now = new Date()) {
  const id = missionPreviewPoolId(preferences);
  await container.items.upsert({
    id,
    documentType: 'mission-preview-pool',
    expiresAt: new Date(now.getTime() + MISSION_PREVIEW_CACHE_MS).toISOString(),
    opportunities,
    ttl: Math.ceil(MISSION_PREVIEW_CACHE_MS / 1000) * 2,
  });
}
