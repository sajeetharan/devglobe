const CAMPAIGN = 'identity_card';
const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
const SOCIAL_SOURCES = new Set(['copy_link', 'facebook', 'linkedin', 'native_share', 'reddit', 'share_page', 'x']);
const SOCIAL_CAMPAIGNS = new Set(['country_leaderboard', 'developer_spotlight', 'identity_card', 'india_top_50', 'rank_movement']);

export const DEVELOPER_STORY_TYPES = Object.freeze({
  SPOTLIGHT: 'developer_spotlight',
  COUNTRY_LEADER: 'country_leaderboard',
  RANK_MOVEMENT: 'rank_movement',
});

function cleanText(value, fallback, maxLength = 48) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function trackingParams(params = {}) {
  return TRACKING_KEYS.reduce((result, key) => {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) result.set(key, value.trim());
    return result;
  }, new URLSearchParams());
}

export function identityCardShareUrl(siteUrl, login, channel, version) {
  const url = new URL(`/share/${encodeURIComponent(login)}`, siteUrl);
  if (version) url.searchParams.set('v', version);
  url.searchParams.set('utm_source', channel);
  url.searchParams.set('utm_medium', channel === 'copy_link' ? 'referral' : 'social');
  url.searchParams.set('utm_campaign', CAMPAIGN);
  return url.toString();
}

export function developerInviteUrl(siteUrl, login, channel) {
  const url = new URL('/', siteUrl);
  url.searchParams.set('ref', login);
  url.searchParams.set('utm_source', channel);
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'developer_invite');
  return url.toString();
}

export function buildDeveloperStory({ siteUrl, developer, type, channel = 'copy_link', period = 7, movement = 0 } = {}) {
  const login = cleanText(developer?.login, '', 39);
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) throw new TypeError('A valid developer login is required');
  if (!Object.values(DEVELOPER_STORY_TYPES).includes(type)) throw new TypeError('A supported developer story type is required');

  const name = cleanText(developer?.name, `@${login}`);
  const language = cleanText(developer?.topLanguage, 'open source', 28);
  const country = cleanText(developer?.country || developer?.location, 'their country', 36);
  const globalRank = Number.isInteger(developer?.globalRank) ? developer.globalRank : null;
  const countryRank = Number.isInteger(developer?.countryRank) ? developer.countryRank : null;
  const safePeriod = [7, 30, 90].includes(Number(period)) ? Number(period) : 7;
  const safeMovement = Number.isInteger(movement) && movement > 0 ? movement : 0;
  const rankText = globalRank ? `global #${globalRank}` : 'ranked on DevGlobe';
  const content = {
    [DEVELOPER_STORY_TYPES.SPOTLIGHT]: {
      title: `${name} on DevGlobe`,
      text: `Developer spotlight: ${name} (@${login}) builds with ${language} and is ${rankText}.`,
    },
    [DEVELOPER_STORY_TYPES.COUNTRY_LEADER]: {
      title: `${name} on the ${country} leaderboard`,
      text: `${country} leaderboard: ${name} (@${login}) is ${countryRank ? `#${countryRank}` : 'a ranked developer'} and ${rankText}.`,
    },
    [DEVELOPER_STORY_TYPES.RANK_MOVEMENT]: {
      title: `${name} is moving up on DevGlobe`,
      text: `${name} (@${login}) moved up ${safeMovement || 'the'} ${safeMovement === 1 ? 'place' : 'places'} to ${rankText} in ${safePeriod} days.`,
    },
  }[type];
  const url = new URL(`/share/${encodeURIComponent(login)}`, siteUrl);
  url.searchParams.set('utm_source', cleanText(channel, 'copy_link', 40));
  url.searchParams.set('utm_medium', channel === 'copy_link' ? 'referral' : 'social');
  url.searchParams.set('utm_campaign', type);
  url.searchParams.set('utm_content', login.toLowerCase());
  return { ...content, type, url: url.toString() };
}

export function socialAttributionProperties(params) {
  const source = String(params?.get?.('utm_source') || '').trim().toLowerCase();
  const journey = String(params?.get?.('utm_campaign') || '').trim().toLowerCase();
  return {
    source: SOCIAL_SOURCES.has(source) ? source : 'direct',
    journey: SOCIAL_CAMPAIGNS.has(journey) ? journey : 'shared_profile',
  };
}

export function attributedGlobePath(login, params = {}) {
  const query = trackingParams(params);
  if (login) query.set('dev', login);
  const value = query.toString();
  return value ? `/?${value}` : '/';
}