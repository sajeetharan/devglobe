import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAnalyticsProperties, track } from '../lib/analytics.js';
import { browserAnalytics } from '../lib/browser-analytics.js';

test('keeps bounded search dimensions without retaining raw queries', () => {
  assert.deepEqual(safeAnalyticsProperties({
    query: 'private search wording',
    termCount: 4,
    resultCount: 12,
    resultRank: 3,
    matchMode: 'broadened',
    fallback: 'none',
  }), {
    termCount: 4,
    resultCount: 12,
    resultRank: 3,
    matchMode: 'broadened',
    fallback: 'none',
  });
});

test('clamps numeric analytics dimensions and bounds strings', () => {
  assert.deepEqual(safeAnalyticsProperties({
    resultCount: 500,
    resultRank: -2,
    termCount: 100,
    source: 'x'.repeat(120),
  }), {
    resultCount: 50,
    resultRank: 0,
    termCount: 20,
    source: 'x'.repeat(100),
  });
});

  test('track queues sanitized early events without replaying durable engagement ingestion', t => {
    const oldWindow = globalThis.window;
    const oldFetch = globalThis.fetch;
    const durable = [];
    const delivered = [];
    globalThis.window = {
      location: { hostname: 'www.devglobe.dev' },
      navigator: { userAgent: 'Mozilla/5.0' },
    };
    globalThis.fetch = async (url, options) => { durable.push(JSON.parse(options.body)); };
    browserAnalytics.disable();
    const client = { trackEvent: (event, properties) => delivered.push({ ...event, properties }) };
    browserAnalytics.attach(client);
    browserAnalytics.detach(client);
    t.after(() => {
      browserAnalytics.disable();
      if (oldWindow === undefined) delete globalThis.window;
      else globalThis.window = oldWindow;
      globalThis.fetch = oldFetch;
    });

    track('site_visited', { journey: 'homepage', query: 'private wording', login: 'private-login' });
    track('next_action_selected', { action: 'open_hacktoberfest_match' });
    assert.equal(durable.length, 2);
    assert.equal(delivered.length, 0);
    browserAnalytics.attach(client);
    assert.deepEqual(delivered, [
      { name: 'site_visited', properties: { journey: 'homepage' } },
      { name: 'next_action_selected', properties: { action: 'open_hacktoberfest_match' } },
    ]);
    assert.equal(durable.length, 2);
  });

  test('local and automated browsers never enqueue Application Insights events', t => {
    const oldWindow = globalThis.window;
    const oldFetch = globalThis.fetch;
    const delivered = [];
    globalThis.fetch = async () => {};
    browserAnalytics.disable();
    const client = { trackEvent: event => delivered.push(event) };
    browserAnalytics.attach(client);
    browserAnalytics.detach(client);
    t.after(() => {
      browserAnalytics.disable();
      if (oldWindow === undefined) delete globalThis.window;
      else globalThis.window = oldWindow;
      globalThis.fetch = oldFetch;
    });
    for (const [hostname, userAgent] of [
      ['localhost', 'Mozilla/5.0'],
      ['www.devglobe.dev', 'Googlebot'],
      ['www.devglobe.dev', ''],
    ]) {
      globalThis.window = { location: { hostname }, navigator: { userAgent } };
      track('site_visited', {});
    }
    browserAnalytics.attach(client);
    assert.deepEqual(delivered, []);
  });