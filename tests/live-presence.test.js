import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_PRESENCE_TTL_SECONDS,
  diffLivePresence,
  isLivePresenceActive,
  normalizeLivePresence,
} from '../lib/live-presence.js';

const now = new Date('2026-09-07T18:00:00.000Z');
const profile = {
  login: 'Octo-Cat',
  name: 'Octo Cat',
  avatarUrl: 'https://avatars.example/octo.png',
  location: 'London, UK',
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

test('rejects presence without valid profile coordinates', () => {
  assert.equal(normalizeLivePresence({ heartbeat: {}, profile: { ...profile, lat: null }, now }), null);
});

test('expires presence after the heartbeat window', () => {
  const presence = { lastHeartbeat: now.toISOString() };
  assert.equal(isLivePresenceActive(presence, now.getTime() + 89_000), true);
  assert.equal(isLivePresenceActive(presence, now.getTime() + 90_000), false);
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