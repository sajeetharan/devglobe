import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommunityCampaignBundle,
  COMMUNITY_CAMPAIGN_CHANNELS,
} from '../lib/community-campaign.js';

const developer = {
  login: 'OctoCat',
  name: 'Octo Cat',
  topLanguage: 'TypeScript',
  globalRank: 12,
  country: 'India',
  countryRank: 3,
  email: 'private@example.com',
};

test('builds review-only developer campaign assets for every supported channel', () => {
  const bundle = buildCommunityCampaignBundle({
    siteUrl: 'https://www.devglobe.dev',
    developer,
    type: 'developer_spotlight',
  });

  assert.equal(bundle.delivery, 'manual_review_only');
  assert.deepEqual(bundle.assets.map(asset => asset.channel), COMMUNITY_CAMPAIGN_CHANNELS);
  assert.doesNotMatch(JSON.stringify(bundle), /private@example\.com/);
  for (const asset of bundle.assets) {
    assert.match(asset.text, /utm_campaign=developer_spotlight/);
    assert.match(asset.text, new RegExp(`utm_source=${asset.channel}`));
  }
  assert.ok(bundle.assets.find(asset => asset.channel === 'x').text.length <= 280);
});

test('builds country leaderboard assets and rejects incomplete ranking data', () => {
  const bundle = buildCommunityCampaignBundle({
    siteUrl: 'https://www.devglobe.dev',
    developer,
    type: 'country_leaderboard',
  });
  assert.match(bundle.assets[0].text, /India leaderboard.*#3/);
  assert.ok(bundle.assets.find(asset => asset.channel === 'x').text.length <= 280);
  assert.throws(() => buildCommunityCampaignBundle({
    siteUrl: 'https://www.devglobe.dev',
    developer: { login: 'octocat' },
    type: 'country_leaderboard',
  }), /country and country rank/i);
});