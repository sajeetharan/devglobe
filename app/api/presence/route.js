import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../lib/auth.js';
import { recordCodingHeartbeat } from '../../../lib/coding-stats-store.js';
import { recordExtensionEvent } from '../../../lib/extension-telemetry.js';
import {
  normalizeLivePresence,
  presenceProfileFromIdentity,
  presenceRetryAfter,
  resolvePresenceProfile,
} from '../../../lib/live-presence.js';
import {
  findLivePresence,
  findPresenceProfile,
  removeLivePresence,
  saveLivePresence,
} from '../../../lib/live-presence-store.js';
import { geocodeLocation } from '../../../lib/nominate.js';

async function authenticate(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? await verifySessionToken(token) : null;
  return session?.scope === 'live-presence' && session?.login ? session : null;
}

export async function POST(request) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const [heartbeat, profile, previousPresence] = await Promise.all([
      request.json(),
      findPresenceProfile(session.login),
      findLivePresence(session.login),
    ]);
    const retryAfter = presenceRetryAfter(previousPresence);
    if (retryAfter > 0) {
      return NextResponse.json({ error: 'Heartbeat rate limit exceeded' }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' },
      });
    }

    const baseProfile = presenceProfileFromIdentity(profile, {
      login: session.login,
      name: session.githubName,
      avatarUrl: session.githubAvatarUrl,
      location: session.githubLocation,
    });
    const presenceProfile = await resolvePresenceProfile(baseProfile, {
      fallbackLocation: heartbeat.location || session.githubLocation,
      previousPresence,
      geocode: geocodeLocation,
    });
    const presence = normalizeLivePresence({ heartbeat, profile: presenceProfile });
    if (!presence) {
      return NextResponse.json({
        code: 'location_required',
        error: 'Enter a city and country so DevGlobe can place you on the globe',
      }, { status: 422 });
    }
    await saveLivePresence(presence);
    await recordCodingHeartbeat(previousPresence, presence).catch(error => {
      console.error('Coding stats heartbeat aggregation failed:', error.message);
    });
    await recordExtensionEvent(previousPresence ? 'presence_heartbeat_received' : 'presence_started', session.login, {
      source: 'vscode_extension',
    }).catch(error => {
      console.error('Presence activation telemetry failed:', error.message);
    });
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
    await recordExtensionEvent('presence_stopped', session.login, { source: 'vscode_extension' }).catch(error => {
      console.error('Presence sign-off telemetry failed:', error.message);
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Live presence sign-off failed:', error.message);
    return NextResponse.json({ error: 'Unable to end live presence' }, { status: 500 });
  }
}