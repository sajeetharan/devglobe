import { getSiteUrl } from './site.js';

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function displayName(developer) {
  return String(developer.name || developer.login || '').trim();
}

function contributionSignal(developer) {
  const signals = [
    [numeric(developer.totalStars), 'stars across public repositories'],
    [numeric(developer.totalCommits), 'public commits'],
    [numeric(developer.followers), 'GitHub followers'],
    [numeric(developer.soReputation), 'Stack Overflow reputation'],
  ].filter(([value]) => value > 0);
  if (!signals.length) return 'your public open-source activity';
  const [value, label] = signals.sort((left, right) => right[0] - left[0])[0];
  return `${value.toLocaleString('en-US')} ${label}`;
}

export function selectActivationCandidates(developers = [], limit = 100) {
  return developers
    .filter(developer => developer?.login && developer.claimed !== true)
    .sort((left, right) => (
      numeric(right.score) - numeric(left.score)
      || numeric(right.totalStars) - numeric(left.totalStars)
      || String(left.login).localeCompare(String(right.login))
    ))
    .slice(0, Math.max(0, limit));
}

export function buildOutreachMessage(developer, siteUrl = getSiteUrl()) {
  const profileUrl = `${siteUrl}/developer/${encodeURIComponent(developer.login)}?utm_source=manual_outreach&utm_medium=community&utm_campaign=developer_activation`;
  const expertise = developer.topLanguage ? `, especially your ${developer.topLanguage} work` : '';
  return `Hi ${displayName(developer)}, DevGlobe mapped your public developer profile${expertise} and highlighted ${contributionSignal(developer)}. You can review it here: ${profileUrl}\n\nIf it looks right, sign in with GitHub to claim it and unlock a verified identity card, impact history, AI collaboration controls, and weekly rankings. No obligation; I would value any feedback.`;
}

export function buildWeeklySpotlight(developers = [], siteUrl = getSiteUrl()) {
  const candidates = selectActivationCandidates(developers, 5);
  if (!candidates.length) return '';
  const lines = candidates.map((developer, index) => (
    `${index + 1}. ${displayName(developer)} (@${developer.login}) - ${developer.topLanguage || 'Open source'} - ${contributionSignal(developer)}`
  ));
  return `This week's DevGlobe open-source spotlight:\n\n${lines.join('\n')}\n\nExplore the profiles and find your own developer identity: ${siteUrl}/?utm_source=weekly_spotlight&utm_medium=social&utm_campaign=developer_spotlight\n\n#DevGlobe #OpenSource #DeveloperCommunity`;
}

const COMMUNITY_CHANNELS = [
  { id: 'linkedin', medium: 'social' },
  { id: 'x', medium: 'social' },
  { id: 'reddit', medium: 'social' },
  { id: 'discord', medium: 'community' },
  { id: 'github_discussions', medium: 'community' },
];

function campaignUrl(developer, channel, siteUrl) {
  const url = new URL(`/share/${encodeURIComponent(developer.login)}`, siteUrl);
  url.searchParams.set('utm_source', channel.id);
  url.searchParams.set('utm_medium', channel.medium);
  url.searchParams.set('utm_campaign', 'developer_spotlight');
  url.searchParams.set('utm_content', developer.login.toLowerCase());
  return url.toString();
}

export function buildCommunityCampaignAssets(developer, siteUrl = getSiteUrl()) {
  const name = displayName(developer);
  const language = developer.topLanguage || 'open source';
  const evidence = contributionSignal(developer);
  return COMMUNITY_CHANNELS.map(channel => {
    const profileUrl = campaignUrl(developer, channel, siteUrl);
    const body = channel.id === 'x'
      ? `${name} (@${developer.login}) builds with ${language} and has ${evidence}. Explore the public contribution evidence on DevGlobe, then create your own profile: ${profileUrl} #DevGlobe #OpenSource`
      : `Developer spotlight: ${name} (@${developer.login})\n\nPublic DevGlobe signals highlight ${language} work and ${evidence}. Explore the profile, review the evidence, and create your own developer identity:\n${profileUrl}`;
    return {
      channel: channel.id,
      campaign: 'developer_spotlight',
      title: `${name}'s open-source developer profile`,
      profileUrl,
      body,
    };
  });
}