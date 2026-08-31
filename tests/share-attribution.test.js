import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquisitionAttributionProperties,
  attributedGlobePath,
  buildDeveloperStory,
  developerInviteUrl,
  DEVELOPER_STORY_TYPES,
  identityCardShareUrl,
  normalizeDeveloperLogin,
  socialAttributionProperties,
} from '../lib/share-attribution.js';

test('normalizes acquisition attribution into bounded reporting categories', () => {
  assert.deepEqual(acquisitionAttributionProperties(new URLSearchParams({
    utm_source: 'weekly_digest',
    utm_medium: 'email',
    utm_campaign: 'weekly_impact',
    utm_content: 'contribution_opportunity',
  })), {
    source: 'weekly_digest',
    channel: 'email',
    campaign: 'weekly_impact',
    action: 'contribution_opportunity',
  });
  assert.deepEqual(acquisitionAttributionProperties(new URLSearchParams(), {
    referrer: 'https://example.com/private/path',
  }), {
    source: 'external_referral',
    channel: 'referral',
    campaign: 'organic_referral',
  });
  assert.deepEqual(acquisitionAttributionProperties(new URLSearchParams({
    utm_source: 'person@example.com',
    utm_medium: 'private channel',
    utm_campaign: 'secret campaign',
    utm_content: 'private message',
  })), {
    source: 'other',
    channel: 'other',
    campaign: 'unknown',
  });
});

test('does not classify same-origin navigation as acquisition', () => {
  assert.deepEqual(acquisitionAttributionProperties(new URLSearchParams(), {
    referrer: 'https://www.devglobe.dev/leaderboard?private=value',
    siteUrl: 'https://www.devglobe.dev/developer/octocat',
  }), {
    source: 'direct',
    channel: 'direct',
    campaign: 'none',
  });
});

test('builds channel-specific identity card referral URLs', () => {
  const linkedIn = new URL(identityCardShareUrl('https://www.devglobe.dev', 'OctoCat', 'linkedin', '4'));
  const copied = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octocat', 'copy_link', '4'));

  assert.equal(linkedIn.pathname, '/share/octocat');
  assert.equal(linkedIn.searchParams.get('v'), '4');
  assert.equal(linkedIn.searchParams.get('utm_source'), 'linkedin');
  assert.equal(linkedIn.searchParams.get('utm_medium'), 'social');
  assert.equal(linkedIn.searchParams.get('utm_campaign'), 'identity_card');
  assert.equal(linkedIn.searchParams.get('utm_content'), 'octocat');
  assert.equal(copied.searchParams.get('utm_medium'), 'referral');
});

test('bounds identity card channels and normalizes X referrals', () => {
  const x = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octocat', 'twitter', '5'));
  const unknown = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octocat', 'person@example.com', '5'));

  assert.equal(x.searchParams.get('utm_source'), 'x');
  assert.equal(x.searchParams.get('utm_medium'), 'social');
  assert.equal(unknown.searchParams.get('utm_source'), 'copy_link');
  assert.equal(unknown.searchParams.get('utm_medium'), 'referral');
  assert.throws(() => identityCardShareUrl('https://www.devglobe.dev', '../private', 'copy_link', '5'), /valid developer login/);
});

test('preserves only campaign attribution when entering the globe', () => {
  const path = attributedGlobePath('octocat', {
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: 'identity_card',
    token: 'do-not-forward',
  });
  const url = new URL(path, 'https://www.devglobe.dev');

  assert.equal(url.searchParams.get('dev'), 'octocat');
  assert.equal(url.searchParams.get('utm_source'), 'linkedin');
  assert.equal(url.searchParams.get('utm_medium'), 'social');
  assert.equal(url.searchParams.get('utm_campaign'), 'identity_card');
  assert.equal(url.searchParams.has('token'), false);
});

test('attributes member invitations without exposing identity outside ref', () => {
  const url = new URL(developerInviteUrl('https://www.devglobe.dev', 'OctoCat', 'native_share'));

  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('ref'), 'octocat');
  assert.equal(url.searchParams.get('utm_source'), 'native_share');
  assert.equal(url.searchParams.get('utm_medium'), 'referral');
  assert.equal(url.searchParams.get('utm_campaign'), 'developer_invite');
});

test('bounds channels in invitation and developer story URLs', () => {
  const invite = new URL(developerInviteUrl('https://www.devglobe.dev', 'OctoCat', 'person@example.com'));
  const story = buildDeveloperStory({
    siteUrl: 'https://www.devglobe.dev',
    developer: { login: 'OctoCat' },
    type: DEVELOPER_STORY_TYPES.SPOTLIGHT,
    channel: 'person@example.com',
  });

  assert.equal(invite.searchParams.get('ref'), 'octocat');
  assert.equal(invite.searchParams.get('utm_source'), 'copy_link');
  assert.equal(new URL(story.url).searchParams.get('utm_source'), 'copy_link');
});

test('builds canonical public developer spotlight stories with bounded attribution', () => {
  const story = buildDeveloperStory({
    siteUrl: 'https://www.devglobe.dev',
    developer: { login: 'octocat', name: 'Octo Cat', topLanguage: 'TypeScript', globalRank: 12, email: 'private@example.com' },
    type: DEVELOPER_STORY_TYPES.SPOTLIGHT,
    channel: 'native_share',
  });
  const url = new URL(story.url);

  assert.equal(url.pathname, '/share/octocat');
  assert.equal(url.searchParams.get('utm_source'), 'native_share');
  assert.equal(url.searchParams.get('utm_medium'), 'social');
  assert.equal(url.searchParams.get('utm_campaign'), 'developer_spotlight');
  assert.equal(url.searchParams.get('utm_content'), 'octocat');
  assert.match(story.text, /TypeScript/);
  assert.doesNotMatch(JSON.stringify(story), /private@example\.com/);
});

test('builds country and weekly movement stories from public rank fields', () => {
  const developer = { login: 'octocat', name: 'Octo Cat', country: 'India', countryRank: 3, globalRank: 12 };
  const country = buildDeveloperStory({ siteUrl: 'https://www.devglobe.dev', developer, type: DEVELOPER_STORY_TYPES.COUNTRY_LEADER });
  const movement = buildDeveloperStory({
    siteUrl: 'https://www.devglobe.dev',
    developer,
    type: DEVELOPER_STORY_TYPES.RANK_MOVEMENT,
    period: 7,
    movement: 4,
  });

  assert.match(country.text, /India leaderboard.*#3/);
  assert.match(movement.text, /moved up 4 places.*7 days/);
});

test('preserves story attribution but drops arbitrary share-page query fields', () => {
  const path = attributedGlobePath('octocat', {
    utm_source: 'reddit',
    utm_medium: 'social',
    utm_campaign: 'rank_movement',
    utm_content: 'octocat',
    email: 'do-not-forward@example.com',
  });
  const url = new URL(path, 'https://www.devglobe.dev');

  assert.equal(url.searchParams.get('utm_content'), 'octocat');
  assert.equal(url.searchParams.has('email'), false);
});

test('allow-lists social attribution values before telemetry', () => {
  assert.deepEqual(socialAttributionProperties(new URLSearchParams({
    utm_source: 'reddit',
    utm_campaign: 'rank_movement',
  })), { source: 'reddit', journey: 'rank_movement' });
  assert.deepEqual(socialAttributionProperties(new URLSearchParams({
    utm_source: 'person@example.com',
    utm_campaign: 'private campaign text',
  })), { source: 'direct', journey: 'shared_profile' });
});

test('sanitizes hostile attribution before forwarding to the profile funnel', () => {
  const path = attributedGlobePath('OctoCat', {
    utm_source: 'person@example.com',
    utm_medium: 'private text',
    utm_campaign: 'secret campaign',
    utm_content: '../private',
  });
  const url = new URL(path, 'https://www.devglobe.dev');

  assert.equal(url.searchParams.get('dev'), 'octocat');
  assert.equal(url.searchParams.get('utm_source'), 'direct');
  assert.equal(url.searchParams.get('utm_medium'), 'direct');
  assert.equal(url.searchParams.get('utm_campaign'), 'shared_profile');
  assert.equal(url.searchParams.has('utm_content'), false);
});

test('normalizes canonical developer logins', () => {
  assert.equal(normalizeDeveloperLogin('OctoCat'), 'octocat');
  assert.throws(() => normalizeDeveloperLogin('../private'), /valid developer login/);
});