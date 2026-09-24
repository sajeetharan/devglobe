import { NextResponse } from 'next/server';
import { buildGitHubAuthorizationUrl } from '../../../../lib/github-oauth.js';
import {
  createGitHubOAuthState,
  GITHUB_OAUTH_STATE_COOKIE,
} from '../../../../lib/github-oauth-state.js';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export async function GET(request) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'GitHub OAuth is not configured' },
      { status: 503 }
    );
  }

  const requestUrl = new URL(request.url);
  const login = requestUrl.searchParams.get('login') || '';
  const { nonce, state } = createGitHubOAuthState({
    login,
    returnTo: requestUrl.searchParams.get('returnTo') || '',
    secret: GITHUB_CLIENT_SECRET,
  });
  const response = NextResponse.redirect(buildGitHubAuthorizationUrl(GITHUB_CLIENT_ID, login, state));
  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60,
    path: '/',
  });
  return response;
}
