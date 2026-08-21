import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRetryAfterSeconds } from '../lib/agent-introductions.js';
import { createDevGlobeMcpClient } from '../lib/devglobe-mcp-client.js';
import { toolError } from '../lib/devglobe-mcp-server.js';

test('computeRetryAfterSeconds reflects when the oldest request rolls off the window', () => {
  const now = new Date('2026-08-20T12:30:00.000Z');
  const oldestRequestAt = '2026-08-20T12:00:00.000Z'; // 30 minutes ago
  const windowMs = 60 * 60 * 1000; // 1 hour

  // 60 minutes since the oldest request, minus the 30 already elapsed = 30 minutes left.
  assert.equal(computeRetryAfterSeconds(oldestRequestAt, windowMs, now), 30 * 60);
});

test('computeRetryAfterSeconds never returns a non-positive value', () => {
  const now = new Date('2026-08-20T13:00:00.000Z');
  const oldestRequestAt = '2026-08-20T12:00:00.000Z'; // already outside the window
  const windowMs = 60 * 60 * 1000;

  assert.equal(computeRetryAfterSeconds(oldestRequestAt, windowMs, now), 1);
});

test('MCP client surfaces structured rate-limit errors with retryAfterSeconds', async () => {
  const client = createDevGlobeMcpClient({
    baseUrl: 'https://devglobe.dev',
    agentToken: 'issued-token',
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        code: 'rate_limited',
        message: 'Agent introduction rate limit exceeded',
        retryable: true,
        retryAfterSeconds: 1800,
      },
    }), { status: 429, headers: { 'Retry-After': '1800' } }),
  });

  await assert.rejects(
    () => client.requestIntroduction({ developerLogin: 'octocat', reason: 'x'.repeat(20), project: 'Demo' }),
    error => {
      assert.equal(error.status, 429);
      assert.equal(error.code, 'rate_limited');
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterSeconds, 1800);
      return true;
    },
  );
});

test('MCP client falls back to the Retry-After header when the body omits retryAfterSeconds', async () => {
  const client = createDevGlobeMcpClient({
    baseUrl: 'https://devglobe.dev',
    agentToken: 'issued-token',
    fetchImpl: async () => new Response(JSON.stringify({
      error: { code: 'rate_limited', message: 'Too many requests' },
    }), { status: 429, headers: { 'Retry-After': '42' } }),
  });

  await assert.rejects(
    () => client.getIntroductionStatus({ id: 'e6fa6dc6-64df-48c4-8597-c70bfe089bec', developerLogin: 'octocat' }),
    error => {
      assert.equal(error.retryAfterSeconds, 42);
      return true;
    },
  );
});

test('MCP client still handles older plain-string error bodies', async () => {
  const client = createDevGlobeMcpClient({
    baseUrl: 'https://devglobe.dev',
    agentToken: 'issued-token',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Introduction request not found' }), { status: 404 }),
  });

  await assert.rejects(
    () => client.getIntroductionStatus({ id: 'e6fa6dc6-64df-48c4-8597-c70bfe089bec', developerLogin: 'octocat' }),
    error => {
      assert.equal(error.message, 'Introduction request not found');
      assert.equal(error.code, undefined);
      assert.equal(error.retryAfterSeconds, undefined);
      return true;
    },
  );
});

test('toolError marks rate-limit errors retryable and includes retryAfterSeconds', () => {
  const upstream = new Error('Agent introduction rate limit exceeded');
  upstream.code = 'rate_limited';
  upstream.retryable = true;
  upstream.retryAfterSeconds = 900;

  const result = toolError(upstream);
  const payload = JSON.parse(result.content[0].text);

  assert.equal(result.isError, true);
  assert.equal(payload.error.code, 'rate_limited');
  assert.equal(payload.error.retryable, true);
  assert.equal(payload.error.retryAfterSeconds, 900);
});

test('toolError does not invent a retry delay for non-retryable errors', () => {
  const upstream = new Error('Introduction request not found');
  upstream.code = 'not_found';
  upstream.retryable = false;

  const result = toolError(upstream);
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.error.code, 'not_found');
  assert.equal(payload.error.retryable, false);
  assert.equal('retryAfterSeconds' in payload.error, false);
});

test('toolError falls back to message sniffing for errors without a code', () => {
  const upstream = new Error('DEVGLOBE_AGENT_TOKEN is required for introduction requests');

  const result = toolError(upstream);
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.error.code, 'authentication_required');
  assert.equal(payload.error.retryable, false);
});

test('toolError treats unclassified upstream failures as retryable', () => {
  const upstream = new Error('DevGlobe API returned 500');

  const result = toolError(upstream);
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.error.code, 'upstream_error');
  assert.equal(payload.error.retryable, true);
});
