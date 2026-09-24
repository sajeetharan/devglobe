import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const GITHUB_OAUTH_STATE_COOKIE = 'devglobe_github_oauth_state';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function normalizeOAuthReturnTo(value, login = '') {
  const fallback = LOGIN_PATTERN.test(login) ? `/developer/${encodeURIComponent(login.toLowerCase())}` : '/';
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  try {
    const url = new URL(candidate, 'https://www.devglobe.dev');
    if (url.origin !== 'https://www.devglobe.dev' || url.pathname.startsWith('/api/')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function createGitHubOAuthState({
  login = '',
  returnTo = '',
  secret,
  nonce = randomBytes(24).toString('base64url'),
  now = new Date(),
} = {}) {
  if (!secret) throw new Error('GitHub OAuth state secret is required');
  const claimLogin = LOGIN_PATTERN.test(login) ? login.toLowerCase() : '';
  const payload = encode(JSON.stringify({
    version: 1,
    nonce,
    issuedAt: now.toISOString(),
    returnTo: normalizeOAuthReturnTo(returnTo, claimLogin),
    claimLogin,
  }));
  return {
    nonce,
    state: `${payload}.${sign(payload, secret)}`,
  };
}

export function verifyGitHubOAuthState(state, cookieNonce, secret, now = new Date()) {
  if (!state || !cookieNonce || !secret) return null;
  const [payload, signature, extra] = String(state).split('.');
  if (!payload || !signature || extra) return null;
  const expected = sign(payload, secret);
  if (signature.length !== expected.length
    || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const issuedAt = Date.parse(value.issuedAt);
    if (value.version !== 1
      || value.nonce !== cookieNonce
      || !Number.isFinite(issuedAt)
      || issuedAt > now.getTime()
      || now.getTime() - issuedAt > STATE_MAX_AGE_MS) return null;
    const claimLogin = LOGIN_PATTERN.test(value.claimLogin) ? value.claimLogin.toLowerCase() : '';
    return {
      claimLogin,
      returnTo: normalizeOAuthReturnTo(value.returnTo, claimLogin),
    };
  } catch {
    return null;
  }
}
