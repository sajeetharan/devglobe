import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubAuthorizationUrl, resolveGitHubCallbackBaseUrl } from '../lib/github-oauth.js';
import { resolveSessionCookieDomain } from '../lib/auth-config.js';

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

test('uses the canonical site origin after a production OAuth callback', () => {
  assert.equal(
    resolveGitHubCallbackBaseUrl(
      'https://devglobe.dev/api/auth/callback?code=redacted',
      'https://www.devglobe.dev',
      true
    ),
    'https://www.devglobe.dev'
  );
  assert.equal(
    resolveGitHubCallbackBaseUrl('http://localhost:3000/api/auth/callback', 'https://www.devglobe.dev', false),
    'http://localhost:3000'
  );
});

test('shares production session cookies between the canonical www host and apex', () => {
  assert.equal(resolveSessionCookieDomain('https://www.devglobe.dev', true), 'devglobe.dev');
  assert.equal(resolveSessionCookieDomain('https://www.devglobe.dev', false), undefined);
  assert.equal(resolveSessionCookieDomain('https://app.example.com', true), undefined);
});