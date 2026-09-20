import test from 'node:test';
import assert from 'node:assert/strict';
import { isAutomatedUserAgent, shouldCollectBrowserTelemetry } from '../lib/automated-traffic.js';

test('filters known automated traffic and local browser sessions', () => {
  assert.equal(isAutomatedUserAgent('Mozilla/5.0 Chrome/120'), false);
  assert.equal(isAutomatedUserAgent('Twitterbot/1.0'), true);
  assert.equal(shouldCollectBrowserTelemetry({ hostname: 'www.devglobe.dev', userAgent: 'Mozilla/5.0 Chrome/120' }), true);
  assert.equal(shouldCollectBrowserTelemetry({ hostname: 'localhost', userAgent: 'Mozilla/5.0 Chrome/120' }), false);
  assert.equal(shouldCollectBrowserTelemetry({ hostname: 'www.devglobe.dev', userAgent: 'Googlebot/2.1' }), false);
});
