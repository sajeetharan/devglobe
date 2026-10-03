import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAnalytics } from '../lib/browser-analytics.js';

test('delayed SDK initialization replays entry and action events in order exactly once', () => {
  const analytics = createBrowserAnalytics();
  const delivered = [];
  const client = { trackEvent: (event, properties) => delivered.push({ ...event, properties }) };
  const properties = { campaign: 'hacktoberfest-2026' };
  analytics.track('site_visited', properties);
  analytics.track('recommendation_opened', { journey: 'hacktoberfest_matchmaker' });
  properties.campaign = 'changed';
  assert.equal(delivered.length, 0);
  analytics.attach(client);
  analytics.attach(client);
  analytics.track('next_action_selected', { action: 'open_hacktoberfest_match' });
  assert.deepEqual(delivered.map(event => event.name), ['site_visited', 'recommendation_opened', 'next_action_selected']);
  assert.equal(delivered[0].properties.campaign, 'hacktoberfest-2026');
});

test('disabled analytics clears startup events and accepts no new events until attached', () => {
  const analytics = createBrowserAnalytics();
  const delivered = [];
  analytics.track('site_visited', {});
  analytics.disable();
  analytics.track('next_action_selected', {});
  analytics.attach({ trackEvent: event => delivered.push(event) });
  assert.deepEqual(delivered, []);
  analytics.track('site_visited', {});
  assert.equal(delivered.length, 1);
});

test('startup queue is bounded and reports dropped events', () => {
  const warnings = [];
  const delivered = [];
  const analytics = createBrowserAnalytics({ maxPending: 2, reportError: message => warnings.push(message) });
  analytics.track('first', {});
  analytics.track('second', {});
  analytics.track('third', {});
  analytics.attach({ trackEvent: event => delivered.push(event.name) });
  assert.deepEqual(delivered, ['second', 'third']);
  assert.equal(warnings.length, 1);
});

test('delivery failures are reported and retain pending events for a working client', () => {
  const warnings = [];
  const delivered = [];
  const analytics = createBrowserAnalytics({ reportError: message => warnings.push(message) });
  analytics.track('site_visited', {});
  analytics.attach({ trackEvent: () => { throw new Error('SDK unavailable'); } });
  assert.equal(warnings.length, 1);
  analytics.attach({ trackEvent: event => delivered.push(event.name) });
  assert.deepEqual(delivered, ['site_visited']);
});

test('cleanup of an old client cannot detach a replacement client', () => {
  const analytics = createBrowserAnalytics();
  const delivered = [];
  const oldClient = { trackEvent() {} };
  const replacement = { trackEvent: event => delivered.push(event.name) };
  analytics.attach(oldClient);
  analytics.detach(oldClient);
  analytics.track('site_visited', {});
  analytics.attach(replacement);
  analytics.detach(oldClient);
  analytics.track('next_action_selected', {});
  assert.deepEqual(delivered, ['site_visited', 'next_action_selected']);
});
