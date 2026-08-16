import { NextResponse } from 'next/server';
import { buildGitHubAuthorizationUrl } from '../../../../lib/github-oauth.js';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export async function GET(request) {
  if (!GITHUB_CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub OAuth is not configured' },
      { status: 503 }
    );
  }

  const login = new URL(request.url).searchParams.get('login') || '';
  return NextResponse.redirect(buildGitHubAuthorizationUrl(GITHUB_CLIENT_ID, login));
}
