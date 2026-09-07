import { randomUUID } from 'crypto';

const FALLBACK_ACTIVITIES = [
  { login: 'codeatlas', type: 'generated_card', description: 'revealed their open-source identity with a DevGlobe card - create yours' },
  { login: 'pixelbranch', type: 'logged_in', description: 'signed in to explore the developer globe' },
  { login: 'readmeforge', type: 'generated_readme', description: 'generated their GitHub profile README' },
  { login: 'cloudsyntax', type: 'generated_card', description: 'revealed their open-source identity with a DevGlobe card - create yours' },
  { login: 'commitcraft', type: 'logged_in', description: 'signed in to explore the developer globe' },
];

const SELF_CARD_DESCRIPTION = 'revealed their open-source identity with a DevGlobe card - create yours';

function normalizeProfileName(value, login) {
  return String(value || '').trim().slice(0, 80) || `@${login}`;
}

export function normalizePlatformActivity(activity) {
  if (activity.type !== 'generated_card') return activity;
  const targetMatch = activity.description?.match(/^generated @(.+)'s developer card$/);
  const targetLogin = activity.targetLogin || targetMatch?.[1] || activity.login;
  if (!targetLogin) return activity;
  const targetName = normalizeProfileName(activity.targetName, targetLogin);
  return {
    ...activity,
    targetLogin,
    targetName,
    description: `created a DevGlobe card for ${targetName}${targetName === `@${targetLogin}` ? '' : ` (@${targetLogin})`}`,
    url: `/share/${encodeURIComponent(targetLogin)}`,
  };
}

export function createPlatformActivity({ id, type, login, avatarUrl, targetLogin, targetName, now = new Date() }) {
  const isCard = type === 'generated_card';
  const isReadme = type === 'generated_readme';
  const isMissionAcceptance = type === 'mission_accepted';
  const target = targetLogin || login;
  const profileName = normalizeProfileName(targetName, target);
  const description = isCard
    ? `created a DevGlobe card for ${profileName}${profileName === `@${target}` ? '' : ` (@${target})`}`
    : isReadme
      ? target !== login ? `generated @${target}'s GitHub profile README` : 'generated their GitHub profile README'
      : isMissionAcceptance
        ? 'accepted an open-source mission'
        : 'signed in to DevGlobe';
  return {
    id: id || `platform:${randomUUID()}`,
    login,
    avatarUrl: avatarUrl || null,
    type,
    description,
    ...(isCard ? { targetLogin: target, targetName: profileName } : {}),
    repo: null,
    url: isCard
      ? `/share/${encodeURIComponent(target)}`
      : isReadme ? `/developer/${encodeURIComponent(target)}` : `/developer/${encodeURIComponent(login)}`,
    createdAt: now.toISOString(),
    documentType: 'platform-activity',
  };
}

export function createFallbackActivities(now = Date.now()) {
  const bucketMs = 60 * 60 * 1000;
  const bucket = Math.floor(now / bucketMs);
  const bucketStart = bucket * bucketMs;
  const offset = bucket % FALLBACK_ACTIVITIES.length;

  return FALLBACK_ACTIVITIES.map((_, index) => {
    const activity = FALLBACK_ACTIVITIES[(index + offset) % FALLBACK_ACTIVITIES.length];
    return {
      id: `fallback:${bucket}:${index}`,
      ...activity,
      avatarUrl: null,
      repo: null,
      url: activity.type === 'generated_card' ? `/share/${activity.login}` : `/developer/${activity.login}`,
      createdAt: new Date(bucketStart - (index + 1) * 7 * 60 * 1000).toISOString(),
      documentType: 'fallback-activity',
      fallback: true,
    };
  });
}