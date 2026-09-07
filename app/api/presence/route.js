import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../lib/auth.js';
import { normalizeLivePresence } from '../../../lib/live-presence.js';
import {
  findPresenceProfile,
  removeLivePresence,
  saveLivePresence,
} from '../../../lib/live-presence-store.js';

async function authenticate(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? await verifySessionToken(token) : null;
  return session?.scope === 'live-presence' && session?.login ? session : null;
}

export async function POST(request) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const [heartbeat, profile] = await Promise.all([
      request.json(),
      findPresenceProfile(session.login),
    ]);
    if (!profile) return NextResponse.json({ error: 'DevGlobe profile not found' }, { status: 404 });

    const presence = normalizeLivePresence({ heartbeat, profile });
    if (!presence) {
      return NextResponse.json({ error: 'A geocoded DevGlobe profile is required' }, { status: 422 });
    }
    await saveLivePresence(presence);
    return NextResponse.json({ online: true, expiresIn: presence.ttl }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Live presence heartbeat failed:', error.message);
    return NextResponse.json({ error: 'Unable to update live presence' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await removeLivePresence(session.login);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Live presence sign-off failed:', error.message);
    return NextResponse.json({ error: 'Unable to end live presence' }, { status: 500 });
  }
}