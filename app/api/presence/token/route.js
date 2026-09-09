import { NextResponse } from 'next/server';
import { createSessionToken } from '../../../../lib/auth.js';
import { recordExtensionEvent } from '../../../../lib/extension-telemetry.js';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export async function POST(request) {
  const githubToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!githubToken) return NextResponse.json({ error: 'GitHub authentication required' }, { status: 401 });

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'DevGlobe-live-presence',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'GitHub authentication failed' }, { status: 401 });

    const user = await response.json();
    if (!LOGIN_PATTERN.test(user?.login || '')) {
      return NextResponse.json({ error: 'GitHub account is unavailable' }, { status: 401 });
    }
    const token = await createSessionToken({
      login: user.login.toLowerCase(),
      scope: 'live-presence',
      githubName: typeof user.name === 'string' ? user.name.trim().slice(0, 80) : '',
      githubAvatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url.trim().slice(0, 500) : '',
      githubLocation: typeof user.location === 'string' ? user.location.trim().slice(0, 80) : '',
    });
    await recordExtensionEvent('presence_token_issued', user.login, { source: 'vscode_extension' }).catch(error => {
      console.error('Presence token telemetry failed:', error.message);
    });
    return NextResponse.json({ token, login: user.login }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Live presence token exchange failed:', error.message);
    return NextResponse.json({ error: 'Unable to authenticate live presence' }, { status: 502 });
  }
}