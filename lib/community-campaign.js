import { buildDeveloperStory, DEVELOPER_STORY_TYPES } from './share-attribution.js';

export const COMMUNITY_CAMPAIGN_CHANNELS = Object.freeze([
  'linkedin',
  'x',
  'reddit',
  'discord',
  'github_discussions',
]);

export const COMMUNITY_CAMPAIGN_TYPES = Object.freeze([
  DEVELOPER_STORY_TYPES.SPOTLIGHT,
  DEVELOPER_STORY_TYPES.COUNTRY_LEADER,
]);

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function channelAsset(story, channel) {
  const hashtags = '#DevGlobe #OpenSource';
  if (channel === 'linkedin') {
    return { channel, text: `${story.text}\n\nExplore the public contribution signals behind the profile: ${story.url}\n\n${hashtags}` };
  }
  if (channel === 'x') {
    const suffix = `\n\n${story.url}\n\n${hashtags}`;
    return { channel, text: `${truncate(story.text, 280 - suffix.length)}${suffix}` };
  }
  if (channel === 'reddit') {
    return { channel, title: story.title, text: `${story.text}\n\nExplore the profile: ${story.url}` };
  }
  if (channel === 'discord') {
    return { channel, text: `**${story.title}**\n${story.text}\n${story.url}` };
  }
  return { channel, title: story.title, text: `${story.text}\n\nSee the public DevGlobe profile and contribution signals: ${story.url}` };
}

export function buildCommunityCampaignBundle({ siteUrl, developer, type } = {}) {
  if (!COMMUNITY_CAMPAIGN_TYPES.includes(type)) throw new TypeError('A supported community campaign type is required');
  if (type === DEVELOPER_STORY_TYPES.COUNTRY_LEADER
    && (!developer?.country || !Number.isInteger(developer?.countryRank))) {
    throw new TypeError('Country leaderboard campaigns require a country and country rank');
  }

  return {
    campaign: type,
    developerLogin: developer?.login?.toLowerCase(),
    delivery: 'manual_review_only',
    assets: COMMUNITY_CAMPAIGN_CHANNELS.map(channel => {
      const story = buildDeveloperStory({ siteUrl, developer, type, channel });
      return channelAsset(story, channel);
    }),
  };
}