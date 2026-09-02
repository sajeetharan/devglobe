const CAMPAIGN = 'identity_card';
const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
const SOCIAL_SOURCES = new Set(['copy_link', 'discord', 'facebook', 'github_discussions', 'linkedin', 'native_share', 'reddit', 'share_page', 'x']);
const COMMUNITY_SOURCES = new Set(['discord', 'github_discussions']);
const SOCIAL_CAMPAIGNS = new Set(['country_leaderboard', 'developer_spotlight', 'identity_card', 'india_top_50', 'rank_movement']);
const SHARE_CHANNELS = new Set(SOCIAL_SOURCES);
const ACQUISITION_SOURCES = new Set([...SOCIAL_SOURCES, 'direct', 'external_referral', 'manual_outreach', 'other', 'weekly_digest', 'weekly_spotlight']);
const ACQUISITION_CHANNELS = new Set(['community', 'direct', 'email', 'other', 'referral', 'social']);
const ACQUISITION_CAMPAIGNS = new Set([...SOCIAL_CAMPAIGNS, 'agents', 'community', 'developer_activation', 'developer_invite', 'none', 'organic_referral', 'product', 'shared_profile', 'unknown', 'weekly_impact']);
const WEEKLY_DIGEST_ACTIONS = new Set(['contribution_opportunity', 'introduction_request', 'rank_movement']);
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export const DEVELOPER_STORY_TYPES = Object.freeze({
  SPOTLIGHT: 'developer_spotlight',
  COUNTRY_LEADER: 'country_leaderboard',
  RANK_MOVEMENT: 'rank_movement',
});

function cleanText(value, fallback, maxLength = 48) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

export function normalizeDeveloperLogin(value) {
  const login = cleanText(value, '', 39).toLowerCase();
  if (!LOGIN_PATTERN.test(login)) throw new TypeError('A valid developer login is required');
  return login;
}

function normalizeShareChannel(value) {
  const channel = cleanText(value, 'copy_link', 40).toLowerCase();
  const source = channel === 'twitter' ? 'x' : channel;
  return SHARE_CHANNELS.has(source) ? source : 'copy_link';
}

export function acquisitionAttributionProperties(params, { referrer = '', siteUrl = '' } = {}) {
  const rawSource = String(params?.get?.('utm_source') || '').trim().toLowerCase();
  const rawChannel = String(params?.get?.('utm_medium') || '').trim().toLowerCase();
  const rawCampaign = String(params?.get?.('utm_campaign') || '').trim().toLowerCase();
  const rawAction = String(params?.get?.('utm_content') || '').trim().toLowerCase();
  let hasExternalReferrer = Boolean(referrer);
  if (referrer && siteUrl) {
    try {
      hasExternalReferrer = new URL(referrer).origin !== new URL(siteUrl).origin;
    } catch {
      hasExternalReferrer = false;
    }
  }
  const source = rawSource
    ? (ACQUISITION_SOURCES.has(rawSource) ? rawSource : 'other')
    : (hasExternalReferrer ? 'external_referral' : 'direct');
  const defaultChannel = source === 'direct' ? 'direct'
    : source === 'external_referral' || source === 'copy_link' || source === 'share_page' ? 'referral'
      : source === 'weekly_digest' ? 'email'
        : source === 'manual_outreach' || COMMUNITY_SOURCES.has(source) ? 'community'
          : SOCIAL_SOURCES.has(source) || source === 'weekly_spotlight' ? 'social'
            : 'other';
  const defaultCampaign = source === 'direct' ? 'none'
    : source === 'external_referral' ? 'organic_referral'
      : SOCIAL_SOURCES.has(source) ? 'shared_profile'
        : 'unknown';
  const attribution = {
    source,
    channel: ACQUISITION_CHANNELS.has(rawChannel) ? rawChannel : defaultChannel,
    campaign: ACQUISITION_CAMPAIGNS.has(rawCampaign) ? rawCampaign : defaultCampaign,
  };
  if (WEEKLY_DIGEST_ACTIONS.has(rawAction)) attribution.action = rawAction;
  return attribution;
}

function trackingParams(params = {}) {
  const sourceValue = String(params.utm_source || '').trim().toLowerCase();
  const campaignValue = String(params.utm_campaign || '').trim().toLowerCase();
  const contentValue = String(params.utm_content || '').trim().toLowerCase();
  const source = SOCIAL_SOURCES.has(sourceValue) ? sourceValue : 'direct';
  const campaign = SOCIAL_CAMPAIGNS.has(campaignValue) ? campaignValue : 'shared_profile';
  const medium = source === 'direct' ? 'direct'
    : source === 'copy_link' || source === 'share_page' ? 'referral'
      : COMMUNITY_SOURCES.has(source) ? 'community'
        : 'social';
  const result = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: campaign });
  if (LOGIN_PATTERN.test(contentValue)) result.set('utm_content', contentValue);
  return result;
}

export function identityCardShareUrl(siteUrl, login, channel, version) {
  const targetLogin = normalizeDeveloperLogin(login);
  const safeSource = normalizeShareChannel(channel);
  const url = new URL(`/share/${encodeURIComponent(targetLogin)}`, siteUrl);
  if (version) url.searchParams.set('v', version);
  url.searchParams.set('utm_source', safeSource);
  url.searchParams.set('utm_medium', safeSource === 'copy_link' ? 'referral' : COMMUNITY_SOURCES.has(safeSource) ? 'community' : 'social');
  url.searchParams.set('utm_campaign', CAMPAIGN);
  url.searchParams.set('utm_content', targetLogin);
  return url.toString();
}

export function developerInviteUrl(siteUrl, login, channel) {
  const targetLogin = normalizeDeveloperLogin(login);
  const source = normalizeShareChannel(channel);
  const url = new URL('/', siteUrl);
  url.searchParams.set('ref', targetLogin);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'developer_invite');
  return url.toString();
}

export function buildDeveloperStory({ siteUrl, developer, type, channel = 'copy_link', period = 7, movement = 0 } = {}) {
  const login = normalizeDeveloperLogin(developer?.login);
  const source = normalizeShareChannel(channel);
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
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', source === 'copy_link' ? 'referral' : COMMUNITY_SOURCES.has(source) ? 'community' : 'social');
  url.searchParams.set('utm_campaign', type);
  url.searchParams.set('utm_content', login.toLowerCase());
  return { ...content, type, url: url.toString() };
}

export function socialAttributionProperties(params) {
  const attribution = acquisitionAttributionProperties(params);
  return {
    source: SOCIAL_SOURCES.has(attribution.source) ? attribution.source : 'direct',
    journey: SOCIAL_CAMPAIGNS.has(attribution.campaign) ? attribution.campaign : 'shared_profile',
  };
}

export function attributedGlobePath(login, params = {}) {
  const query = trackingParams(params);
  if (login) query.set('dev', normalizeDeveloperLogin(login));
  const value = query.toString();
  return value ? `/?${value}` : '/';
}