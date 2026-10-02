import test from 'node:test';
import assert from 'node:assert/strict';
import { isHacktoberfestCampaignActive, HACKTOBERFEST_CAMPAIGN } from '../lib/hacktoberfest-campaign.js';
import { acquisitionAttributionProperties } from '../lib/share-attribution.js';
import { createEngagementEvent } from '../lib/engagement.js';

test('homepage promotion is limited to October 2026 UTC', () => {
  assert.equal(isHacktoberfestCampaignActive(new Date('2026-09-30T23:59:59.999Z')), false);
  assert.equal(isHacktoberfestCampaignActive(new Date('2026-10-01T00:00:00.000Z')), true);
  assert.equal(isHacktoberfestCampaignActive(new Date('2026-10-31T23:59:59.999Z')), true);
  assert.equal(isHacktoberfestCampaignActive(new Date('2026-11-01T00:00:00.000Z')), false);
  assert.equal(isHacktoberfestCampaignActive(new Date('2027-10-02T00:00:00.000Z')), false);
});

test('campaign acquisition survives client attribution and durable ingestion', () => {
  const properties = acquisitionAttributionProperties(new URLSearchParams({
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: HACKTOBERFEST_CAMPAIGN,
    utm_content: 'private-unapproved-content',
  }));
  assert.deepEqual(properties, { source: 'linkedin', channel: 'social', campaign: HACKTOBERFEST_CAMPAIGN });
  const event = createEngagementEvent({
    eventName: 'site_visited',
    properties: { ...properties, journey: 'hacktoberfest_matchmaker' },
  }, { session: 'campaign-session', secret: 'test-secret', privacyKey: 'test-cohort' });
  assert.equal(event.properties.campaign, HACKTOBERFEST_CAMPAIGN);
  assert.equal(event.properties.journey, 'hacktoberfest_matchmaker');
});
