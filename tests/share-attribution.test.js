import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attributedGlobePath,
  buildDeveloperStory,
  developerInviteUrl,
  DEVELOPER_STORY_TYPES,
  identityCardShareUrl,
  socialAttributionProperties,
} from '../lib/share-attribution.js';

test('builds channel-specific identity card referral URLs', () => {
  const linkedIn = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octo cat', 'linkedin', '4'));
  const copied = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octocat', 'copy_link', '4'));

  assert.equal(linkedIn.pathname, '/share/octo%20cat');
  assert.equal(linkedIn.searchParams.get('v'), '4');
  assert.equal(linkedIn.searchParams.get('utm_source'), 'linkedin');
  assert.equal(linkedIn.searchParams.get('utm_medium'), 'social');
  assert.equal(linkedIn.searchParams.get('utm_campaign'), 'identity_card');
  assert.equal(copied.searchParams.get('utm_medium'), 'referral');
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
  const url = new URL(developerInviteUrl('https://www.devglobe.dev', 'octocat', 'native_share'));

  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('ref'), 'octocat');
  assert.equal(url.searchParams.get('utm_source'), 'native_share');
  assert.equal(url.searchParams.get('utm_medium'), 'referral');
  assert.equal(url.searchParams.get('utm_campaign'), 'developer_invite');
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