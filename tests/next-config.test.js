import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

test('rewrites documented badge API path to badge route', async () => {
  const rewrites = await nextConfig.rewrites();

  assert.deepEqual(rewrites, [
    {
      source: '/api/badge/:login.svg',
      destination: '/badge/:login.svg',
    },
  ]);
});
