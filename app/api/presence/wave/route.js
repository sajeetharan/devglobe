import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth.js';
import { waveToDeveloper } from '../../../../lib/live-presence-store.js';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export async function POST(request) {
  const session = await getSession();
  if (!session?.login) {
    return NextResponse.json({ error: 'Sign in with GitHub to wave' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  try {
    const targetLogin = String((await request.json())?.login || '').trim().toLowerCase();
    if (!LOGIN_PATTERN.test(targetLogin)) {
      return NextResponse.json({ error: 'Choose a valid developer' }, { status: 400 });
    }
    const presence = await waveToDeveloper(targetLogin, {
      login: session.login,
      name: session.name,
    });
    return NextResponse.json({
      waved: true,
      waveCount: Array.isArray(presence?.waves) ? presence.waves.length : 0,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error.retryAfter) {
      return NextResponse.json({ error: error.message }, {
        status: 429,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'Retry-After': String(error.retryAfter),
        },
      });
    }
    if (error.code === 404) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message === 'You cannot wave to yourself') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Live presence wave failed:', error.message);
    return NextResponse.json({ error: 'Unable to send wave' }, { status: 500 });
  }
}
