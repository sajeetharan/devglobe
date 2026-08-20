import { NextResponse } from 'next/server';
import { createSessionToken, buildSessionCookie } from '../../../../lib/auth.js';
import { saveActivities } from '../../../../lib/activity-store.js';
import { createPlatformActivity } from '../../../../lib/platform-activity.js';
import { selectGitHubEmail } from '../../../../lib/github-email.js';
import { resolveGitHubCallbackBaseUrl } from '../../../../lib/github-oauth.js';
import { getSiteUrl } from '../../../../lib/site.js';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const baseUrl = resolveGitHubCallbackBaseUrl(
    request.url,
    getSiteUrl(),
    process.env.NODE_ENV === 'production'
  );

  if (!code) {
    return NextResponse.redirect(`${baseUrl}?auth_error=no_code`);
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return NextResponse.redirect(`${baseUrl}?auth_error=not_configured`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      return NextResponse.redirect(`${baseUrl}?auth_error=token_exchange_failed`);
    }

    // Fetch GitHub user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${baseUrl}?auth_error=user_fetch_failed`);
    }

    const ghUser = await userRes.json();
    let githubEmails = [];
    try {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (emailsRes.ok) githubEmails = await emailsRes.json();
    } catch (emailError) {
      console.error('GitHub email lookup failed:', emailError.message);
    }

    // Create session
    const session = {
      login: ghUser.login,
      name: ghUser.name || ghUser.login,
      avatarUrl: ghUser.avatar_url,
      email: selectGitHubEmail(ghUser.email, githubEmails),
    };

    const token = await createSessionToken(session);
    const cookie = buildSessionCookie(token);

    const successUrl = new URL(baseUrl);
    successUrl.searchParams.set('auth', 'success');
    const response = NextResponse.redirect(successUrl);
    response.cookies.set(cookie);
    try {
      await saveActivities([createPlatformActivity({
        type: 'logged_in',
        login: session.login,
        avatarUrl: session.avatarUrl,
      })]);
    } catch (activityError) {
      console.error('Login activity write failed:', activityError.message);
    }
    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(`${baseUrl}?auth_error=unknown`);
  }
}
