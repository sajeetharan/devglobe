import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGitHubOAuthCredentials } from '../lib/github-oauth-health.js';

function response(error) {
  return { ok: true, status: 200, json: async () => ({ error }) };
}

test('recognizes valid OAuth credentials without requiring a real authorization code', async () => {
  let request;
  const result = await verifyGitHubOAuthCredentials({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response('bad_verification_code');
    },
  });

  assert.equal(result.valid, true);
  assert.match(request.url, /github\.com\/login\/oauth\/access_token/);
  assert.equal(request.options.body.get('client_secret'), 'client-secret');
});

test('reports rejected OAuth client credentials', async () => {
  const result = await verifyGitHubOAuthCredentials({
    clientId: 'client-id',
    clientSecret: 'invalid-secret',
    fetchImpl: async () => response('incorrect_client_credentials'),
  });

  assert.deepEqual(result, { valid: false, reason: 'incorrect_client_credentials' });
});

test('requires credentials before making a request', async () => {
  await assert.rejects(() => verifyGitHubOAuthCredentials(), /GITHUB_CLIENT_ID/);
});

test('reports an HTTP credential rejection without requiring a JSON body', async () => {
  const result = await verifyGitHubOAuthCredentials({
    clientId: 'client-id',
    clientSecret: 'invalid-secret',
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => { throw new SyntaxError(); } }),
  });

  assert.deepEqual(result, { valid: false, reason: 'http_404' });
});