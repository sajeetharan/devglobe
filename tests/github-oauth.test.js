import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubAuthorizationUrl, resolveGitHubCallbackBaseUrl } from '../lib/github-oauth.js';
import {
  createGitHubOAuthState,
  normalizeOAuthReturnTo,
  verifyGitHubOAuthState,
} from '../lib/github-oauth-state.js';
import { resolveSessionCookieDomain, selectSessionToken, SESSION_COOKIE_NAME } from '../lib/auth-config.js';

test('uses the callback registered on the GitHub OAuth application', () => {
  const url = new URL(buildGitHubAuthorizationUrl('client-id'));

  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('scope'), 'read:user user:email');
  assert.equal(url.searchParams.has('redirect_uri'), false);
});

test('suggests a valid nominated login without forwarding invalid input', () => {
  const hintedUrl = new URL(buildGitHubAuthorizationUrl('client-id', 'octo-cat', 'signed-state'));
  const invalidUrl = new URL(buildGitHubAuthorizationUrl('client-id', 'not a login'));

  assert.equal(hintedUrl.searchParams.get('login'), 'octo-cat');
  assert.equal(hintedUrl.searchParams.get('state'), 'signed-state');
  assert.equal(invalidUrl.searchParams.has('login'), false);
});

test('signs a same-site OAuth continuation and binds it to the browser nonce', () => {
  const now = new Date('2026-09-24T08:00:00.000Z');
  const continuation = createGitHubOAuthState({
    login: 'Octo-Cat',
    returnTo: '/developer/octo-cat?utm_source=manual_outreach',
    secret: 'oauth-secret',
    nonce: 'browser-nonce',
    now,
  });

  assert.deepEqual(
    verifyGitHubOAuthState(continuation.state, continuation.nonce, 'oauth-secret', now),
    {
      claimLogin: 'octo-cat',
      returnTo: '/developer/octo-cat?utm_source=manual_outreach',
    },
  );
  assert.equal(verifyGitHubOAuthState(continuation.state, 'another-browser', 'oauth-secret', now), null);
  assert.equal(verifyGitHubOAuthState(`${continuation.state}tampered`, continuation.nonce, 'oauth-secret', now), null);
});

test('rejects external and API OAuth destinations', () => {
  assert.equal(normalizeOAuthReturnTo('https://attacker.example/private', 'octocat'), '/developer/octocat');
  assert.equal(normalizeOAuthReturnTo('//attacker.example/private', 'octocat'), '/developer/octocat');
  assert.equal(normalizeOAuthReturnTo('/api/private', 'octocat'), '/developer/octocat');
  assert.equal(normalizeOAuthReturnTo('/developer/octocat#activity', 'octocat'), '/developer/octocat#activity');
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
  assert.equal(SESSION_COOKIE_NAME, 'devglobe_session_v2');
  assert.equal(resolveSessionCookieDomain('https://www.devglobe.dev', true), 'devglobe.dev');
  assert.equal(resolveSessionCookieDomain('https://www.devglobe.dev', false), undefined);
  assert.equal(resolveSessionCookieDomain('https://app.example.com', true), undefined);
});

test('selectSessionToken prefers the current cookie and falls back to the legacy one', () => {
  const both = { devglobe_session_v2: 'new', devglobe_session: 'old' };
  assert.equal(selectSessionToken(name => both[name]), 'new');

  const legacyOnly = { devglobe_session: 'old' };
  assert.equal(selectSessionToken(name => legacyOnly[name]), 'old');

  assert.equal(selectSessionToken(() => undefined), null);
});