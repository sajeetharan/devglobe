import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../lib/auth.js';
import { recordCodingHeartbeat } from '../../../lib/coding-stats-store.js';
import { recordExtensionEvent } from '../../../lib/extension-telemetry.js';
import {
  buildPresenceRecap,
  isSamePresenceSession,
  normalizeLivePresence,
  normalizeWaves,
  presenceProfileFromIdentity,
  presenceMetadataRetryAfter,
  presenceReplacementRetryAfter,
  presenceRetryAfter,
  resolvePresenceProfile,
} from '../../../lib/live-presence.js';
import {
  findLivePresence,
  findPresenceProfile,
  listLivePresence,
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
    const metadataOnly = heartbeat.metadataOnly === true;
    const sameSession = isSamePresenceSession(previousPresence, heartbeat);
    const retryAfter = metadataOnly
      ? presenceMetadataRetryAfter(previousPresence)
      : sameSession
        ? presenceRetryAfter(previousPresence)
        : presenceReplacementRetryAfter(previousPresence);
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
    const presence = normalizeLivePresence({
      heartbeat,
      profile: presenceProfile,
      previousPresence,
    });
    if (!presence) {
      return NextResponse.json({
        code: 'location_required',
        error: 'Enter a city and country so DevGlobe can place you on the globe',
      }, { status: 422 });
    }
    const savedPresence = await saveLivePresence(presence, { allowRapidUpdate: metadataOnly });
    if (!metadataOnly) {
      await recordCodingHeartbeat(previousPresence, presence).catch(error => {
        console.error('Coding stats heartbeat aggregation failed:', error.message);
      });
    }
    await recordExtensionEvent(previousPresence ? 'presence_heartbeat_received' : 'presence_started', session.login, {
      source: 'vscode_extension',
    }).catch(error => {
      console.error('Presence activation telemetry failed:', error.message);
    });
    const lastWaveSeenAt = Date.parse(heartbeat.lastWaveSeenAt || '');
    const waves = normalizeWaves(savedPresence.waves)
      .filter(wave => !Number.isFinite(lastWaveSeenAt) || Date.parse(wave.sentAt) > lastWaveSeenAt);
    return NextResponse.json({ online: true, expiresIn: presence.ttl, waves }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error.code === 'stale-session') {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    }
    if (error.code === 'heartbeat-rate-limit') {
      return NextResponse.json({ error: error.message }, {
        status: 429,
        headers: { 'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store' },
      });
    }
    console.error('Live presence heartbeat failed:', error.message);
    return NextResponse.json({ error: 'Unable to update live presence' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const [presence, peers] = await Promise.all([
      findLivePresence(session.login),
      listLivePresence(),
    ]);
    const body = await request.json().catch(() => ({}));
    if (presence?.sessionId && presence.sessionId !== body.sessionId) {
      return NextResponse.json({ recap: null, replacedByNewerSession: true }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const removed = await removeLivePresence(session.login, body.sessionId);
    if (!removed) {
      return NextResponse.json({ recap: null, replacedByNewerSession: true }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    await recordExtensionEvent('presence_stopped', session.login, { source: 'vscode_extension' }).catch(error => {
      console.error('Presence sign-off telemetry failed:', error.message);
    });
    return NextResponse.json({
      recap: presence ? buildPresenceRecap(presence, peers) : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Live presence sign-off failed:', error.message);
    return NextResponse.json({ error: 'Unable to end live presence' }, { status: 500 });
  }
}