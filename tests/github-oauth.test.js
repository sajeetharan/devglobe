import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubAuthorizationUrl } from '../lib/github-oauth.js';

test('uses the callback registered on the GitHub OAuth application', () => {
  const url = new URL(buildGitHubAuthorizationUrl('client-id'));

  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('scope'), 'read:user user:email');
  assert.equal(url.searchParams.has('redirect_uri'), false);
});

test('suggests a valid nominated login without forwarding invalid input', () => {
  const hintedUrl = new URL(buildGitHubAuthorizationUrl('client-id', 'octo-cat'));
  const invalidUrl = new URL(buildGitHubAuthorizationUrl('client-id', 'not a login'));

  assert.equal(hintedUrl.searchParams.get('login'), 'octo-cat');
  assert.equal(invalidUrl.searchParams.has('login'), false);
});