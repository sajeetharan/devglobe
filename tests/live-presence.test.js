import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_PRESENCE_ACTIVE_SECONDS,
  LIVE_PRESENCE_RECENT_SECONDS,
  LIVE_PRESENCE_TTL_SECONDS,
  diffLivePresence,
  isLivePresenceActive,
  normalizeLivePresence,
  presenceProfileFromIdentity,
  presenceActivityState,
  presenceRetryAfter,
  resolvePresenceProfile,
} from '../lib/live-presence.js';

const now = new Date('2026-09-07T18:00:00.000Z');
const profile = {
  login: 'Octo-Cat',
  name: 'Octo Cat',
  avatarUrl: 'https://avatars.example/octo.png',
  location: 'London, UK',
  profileAvailable: true,
  lat: 51.5072,
  lng: -0.1276,
};

test('normalizes a heartbeat using profile-owned identity and coordinates', () => {
  assert.deepEqual(normalizeLivePresence({
    heartbeat: { activeLanguage: 'TypeScript', editor: 'VS Code', platform: 'Windows' },
    profile,
    now,
  }), {
    id: 'octo-cat',
    type: 'live-presence',
    login: 'octo-cat',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.example/octo.png',
    location: 'London, UK',
    profileAvailable: true,
    lat: 51.5072,
    lng: -0.1276,
    activeLanguage: 'TypeScript',
    editor: 'VS Code',
    platform: 'Windows',
    sessionStartedAt: now.toISOString(),
    lastHeartbeat: now.toISOString(),
    ttl: LIVE_PRESENCE_TTL_SECONDS,
  });
});

test('creates a temporary live profile from verified GitHub identity', () => {
  assert.deepEqual(presenceProfileFromIdentity(null, {
    login: 'Octo-Cat',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.example/octo.png',
    location: 'London, UK',
  }), {
    login: 'octo-cat',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.example/octo.png',
    location: 'London, UK',
    lat: null,
    lng: null,
    profileAvailable: false,
  });
});

test('prefers an existing DevGlobe profile for live identity', () => {
  assert.deepEqual(presenceProfileFromIdentity(profile, {
    login: 'different-user',
  }), {
    ...profile,
    profileAvailable: true,
  });
});

test('rejects presence without valid profile coordinates', () => {
  assert.equal(normalizeLivePresence({ heartbeat: {}, profile: { ...profile, lat: null }, now }), null);
});

test('geocodes a profile location when stored coordinates are missing', async () => {
  const resolved = await resolvePresenceProfile({ ...profile, lat: null, lng: null }, {
    geocode: async location => {
      assert.equal(location, 'London, UK');
      return { lat: 51.5, lng: -0.12 };
    },
  });
  assert.deepEqual(resolved, { ...profile, lat: 51.5, lng: -0.12 });
});

test('uses the authenticated GitHub location when the profile location is unknown', async () => {
  const resolved = await resolvePresenceProfile({
    ...profile,
    location: 'Unknown',
    lat: null,
    lng: null,
  }, {
    fallbackLocation: 'Colombo, Sri Lanka',
    geocode: async location => {
      assert.equal(location, 'Colombo, Sri Lanka');
      return { lat: 6.9271, lng: 79.8612 };
    },
  });
  assert.equal(resolved.location, 'Colombo, Sri Lanka');
  assert.equal(resolved.lat, 6.9271);
  assert.equal(resolved.lng, 79.8612);
});

test('prefers an explicit editor location over an unusable public location', async () => {
  const resolved = await resolvePresenceProfile({
    ...profile,
    location: 'Earth',
    lat: null,
    lng: null,
  }, {
    fallbackLocation: 'Colombo, Sri Lanka',
    geocode: async location => {
      assert.equal(location, 'Colombo, Sri Lanka');
      return { lat: 6.9271, lng: 79.8612 };
    },
  });
  assert.equal(resolved.location, 'Colombo, Sri Lanka');
});

test('reuses previous presence coordinates before calling the geocoder', async () => {
  const resolved = await resolvePresenceProfile({ ...profile, lat: null, lng: null }, {
    previousPresence: { location: 'Saved location', lat: 51.4, lng: -0.1 },
    geocode: async () => {
      throw new Error('geocoder should not be called');
    },
  });
  assert.equal(resolved.lat, 51.4);
  assert.equal(resolved.lng, -0.1);
  assert.equal(resolved.location, 'Saved location');
});

test('re-geocodes when the editor location changes', async () => {
  const resolved = await resolvePresenceProfile({ ...profile, lat: null, lng: null }, {
    fallbackLocation: 'Berlin, Germany',
    previousPresence: { location: 'London, UK', lat: 51.4, lng: -0.1 },
    geocode: async location => {
      assert.equal(location, 'Berlin, Germany');
      return { lat: 52.52, lng: 13.405 };
    },
  });
  assert.equal(resolved.location, 'Berlin, Germany');
  assert.equal(resolved.lat, 52.52);
  assert.equal(resolved.lng, 13.405);
});

test('expires presence after the heartbeat window', () => {
  const presence = { lastHeartbeat: now.toISOString() };
  assert.equal(isLivePresenceActive(presence, now.getTime() + 89_000), true);
  assert.equal(isLivePresenceActive(presence, now.getTime() + 90_000), false);
});

test('classifies live and recently coding presence independently of storage retention', () => {
  const presence = { lastHeartbeat: now.toISOString() };
  assert.equal(LIVE_PRESENCE_ACTIVE_SECONDS, 90);
  assert.equal(LIVE_PRESENCE_RECENT_SECONDS, 900);
  assert.equal(LIVE_PRESENCE_TTL_SECONDS, LIVE_PRESENCE_RECENT_SECONDS);
  assert.equal(presenceActivityState(presence, now.getTime() + 89_000), 'live');
  assert.equal(presenceActivityState(presence, now.getTime() + 90_000), 'recent');
  assert.equal(presenceActivityState(presence, now.getTime() + 899_000), 'recent');
  assert.equal(presenceActivityState(presence, now.getTime() + 900_000), null);
});

test('rate limits heartbeat bursts without delaying the normal interval', () => {
  const presence = { lastHeartbeat: now.toISOString() };
  assert.equal(presenceRetryAfter(presence, now.getTime() + 9_000), 1);
  assert.equal(presenceRetryAfter(presence, now.getTime() + 10_000), 0);
  assert.equal(presenceRetryAfter(null, now.getTime()), 0);
});

test('diffs changed and removed developers for SSE updates', () => {
  const previous = [
    { id: 'octo-cat', lastHeartbeat: '2026-09-07T17:59:00.000Z' },
    { id: 'offline', lastHeartbeat: '2026-09-07T17:59:00.000Z' },
  ];
  const next = [{ id: 'octo-cat', lastHeartbeat: now.toISOString() }];
  assert.deepEqual(diffLivePresence(previous, next), [
    { type: 'upsert', developer: next[0] },
    { type: 'delete', developerId: 'offline' },
  ]);
});

test('diffs a transition from live to recently coding', () => {
  const previous = [{ id: 'octo-cat', lastHeartbeat: now.toISOString(), presenceState: 'live' }];
  const next = [{ id: 'octo-cat', lastHeartbeat: now.toISOString(), presenceState: 'recent' }];
  assert.deepEqual(diffLivePresence(previous, next), [
    { type: 'upsert', developer: next[0] },
  ]);
});