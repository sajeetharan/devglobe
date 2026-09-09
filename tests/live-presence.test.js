import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWave,
  buildPresenceRecap,
  deduplicateLivePresence,
  LIVE_PRESENCE_ACTIVE_SECONDS,
  LIVE_PRESENCE_RECENT_SECONDS,
  LIVE_PRESENCE_TTL_SECONDS,
  diffLivePresence,
  isLivePresenceActive,
  normalizeLivePresence,
  normalizeWaveCooldowns,
  isOlderPresenceSession,
  isSamePresenceSession,
  presenceProfileFromIdentity,
  presenceActivityState,
  presenceMetadataRetryAfter,
  presenceReplacementRetryAfter,
  presenceRetryAfter,
  resolvePresenceProfile,
} from '../lib/live-presence.js';
import { removeLivePresence, saveLivePresence } from '../lib/live-presence-store.js';

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
    codingStatus: '',
    codingAgent: '',
    codingModel: '',
    sessionId: '',
    sessionStartedAt: now.toISOString(),
    lastHeartbeat: now.toISOString(),
    lastMetadataAt: '',
    waves: [],
    waveCooldowns: [],
    ttl: LIVE_PRESENCE_TTL_SECONDS,
  });
});

test('normalizes optional coding and focus context', () => {
  const presence = normalizeLivePresence({
    heartbeat: {
      activeLanguage: 'TypeScript',
      codingStatus: 'debugging',
      codingAgent: 'GitHub Copilot',
      codingModel: 'GPT',
      focusStartedAt: now.toISOString(),
      focusEndsAt: new Date(now.getTime() + 25 * 60_000).toISOString(),
      sessionId: 'editor-session-1',
    },
    profile,
    now,
  });
  assert.equal(presence.codingStatus, 'debugging');
  assert.equal(presence.codingAgent, 'GitHub Copilot');
  assert.equal(presence.codingModel, 'GPT');
  assert.equal(presence.sessionId, 'editor-session-1');
  assert.equal(presence.focusStartedAt, now.toISOString());
  assert.equal(presence.focusEndsAt, new Date(now.getTime() + 25 * 60_000).toISOString());
});

test('requires an explicitly named agent before publishing a model', () => {
  const presence = normalizeLivePresence({
    heartbeat: { codingModel: 'private model' },
    profile,
    now,
  });
  assert.equal(presence.codingAgent, '');
  assert.equal(presence.codingModel, '');
});

test('bounds agent identity to single-line public labels', () => {
  const presence = normalizeLivePresence({
    heartbeat: {
      codingAgent: `Custom\nAgent ${'x'.repeat(60)}`,
      codingModel: `Model\n${'y'.repeat(90)}`,
    },
    profile,
    now,
  });
  assert.equal(presence.codingAgent.includes('\n'), false);
  assert.equal(presence.codingAgent.length, 50);
  assert.equal(presence.codingModel.includes('\n'), false);
  assert.equal(presence.codingModel.length, 80);
});

test('drops unknown statuses and expired focus sessions', () => {
  const presence = normalizeLivePresence({
    heartbeat: {
      codingStatus: 'having lunch',
      focusStartedAt: new Date(now.getTime() - 30 * 60_000).toISOString(),
      focusEndsAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    },
    profile,
    now,
  });
  assert.equal(presence.codingStatus, '');
  assert.equal(presence.focusStartedAt, undefined);
  assert.equal(presence.focusEndsAt, undefined);
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

test('rate limits metadata writes independently from coding heartbeats', () => {
  const presence = { lastMetadataAt: now.toISOString() };
  assert.equal(presenceMetadataRetryAfter(presence, now.getTime() + 1_000), 1);
  assert.equal(presenceMetadataRetryAfter(presence, now.getTime() + 2_000), 0);
});

test('bounds rapid session replacement writes per developer', () => {
  const presence = { lastHeartbeat: now.toISOString() };
  assert.equal(presenceReplacementRetryAfter(presence, now.getTime() + 1_000), 1);
  assert.equal(presenceReplacementRetryAfter(presence, now.getTime() + 2_000), 0);
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

test('deduplicates legacy markers by normalized login and newest heartbeat', () => {
  const developers = deduplicateLivePresence([
    { id: 'legacy-one', login: 'Octo-Cat', lastHeartbeat: '2026-09-07T17:50:00.000Z' },
    { id: 'legacy-two', login: 'octo-cat', lastHeartbeat: now.toISOString() },
  ]);
  assert.deepEqual(developers, [{
    id: 'octo-cat',
    login: 'octo-cat',
    lastHeartbeat: now.toISOString(),
  }]);
});

test('prevents an older editor session from replacing a newer one', () => {
  assert.equal(isOlderPresenceSession(
    { sessionId: 'new', sessionStartedAt: now.toISOString() },
    { sessionId: 'old', sessionStartedAt: new Date(now.getTime() - 1000).toISOString() },
  ), true);
  assert.equal(isOlderPresenceSession(
    { sessionId: 'old', sessionStartedAt: new Date(now.getTime() - 1000).toISOString() },
    { sessionId: 'new', sessionStartedAt: now.toISOString() },
  ), false);
});

test('fences legacy sessions by their session start time', () => {
  const older = { sessionStartedAt: new Date(now.getTime() - 1000).toISOString() };
  const newer = { sessionStartedAt: now.toISOString() };
  assert.equal(isSamePresenceSession(older, { ...older }), true);
  assert.equal(isOlderPresenceSession(newer, older), true);
  assert.equal(isOlderPresenceSession(older, newer), false);
  assert.equal(isSamePresenceSession({ ...newer, sessionId: 'modern' }, newer), false);
});

test('adds a rate-limited wave without accepting self-waves', () => {
  const waved = addWave({ login: 'octo-cat', waves: [] }, {
    login: 'helper',
    name: 'Helpful Developer',
  }, now);
  assert.deepEqual(waved.waves, [{
    fromLogin: 'helper',
    fromName: 'Helpful Developer',
    sentAt: now.toISOString(),
  }]);
  assert.deepEqual(waved.waveCooldowns, [{
    fromLogin: 'helper',
    sentAt: now.toISOString(),
  }]);
  assert.throws(() => addWave(waved, { login: 'helper' }, now), /already waved/);
  assert.throws(() => addWave(waved, { login: 'octo-cat' }, now), /cannot wave to yourself/);
});

test('retains active wave cooldowns independently of the visible wave list', () => {
  const cooldowns = normalizeWaveCooldowns([
    { fromLogin: 'recent', sentAt: new Date(now.getTime() - 9 * 60_000).toISOString() },
    { fromLogin: 'expired', sentAt: new Date(now.getTime() - 11 * 60_000).toISOString() },
  ], now);
  assert.deepEqual(cooldowns, [{
    fromLogin: 'recent',
    sentAt: new Date(now.getTime() - 9 * 60_000).toISOString(),
  }]);
});

test('starts a replacement editor session without inheriting old waves', () => {
  const presence = normalizeLivePresence({
    heartbeat: { sessionId: 'new', sessionStartedAt: now.toISOString() },
    previousPresence: {
      sessionId: 'old',
      waves: [{ fromLogin: 'helper', sentAt: now.toISOString() }],
      waveCooldowns: [{ fromLogin: 'helper', sentAt: now.toISOString() }],
    },
    profile,
    now,
  });
  assert.deepEqual(presence.waves, []);
  assert.deepEqual(presence.waveCooldowns, []);
});

test('builds an end-of-session companionship recap', () => {
  const recap = buildPresenceRecap({
    login: 'octo-cat',
    sessionStartedAt: new Date(now.getTime() - 47 * 60_000).toISOString(),
    waves: [{ fromLogin: 'helper', sentAt: now.toISOString() }],
  }, [
    { login: 'octo-cat', location: 'London, UK' },
    { login: 'helper', location: 'Berlin, Germany' },
    { login: 'friend', location: 'Munich, Germany' },
  ], now);
  assert.deepEqual(recap, {
    durationMinutes: 47,
    developerCount: 2,
    countryCount: 1,
    waveCount: 1,
  });
});

test('does not delete a replacement session after an ETag conflict', async () => {
  let document = {
    id: 'octo-cat',
    login: 'octo-cat',
    sessionId: 'old',
    _etag: 'v1',
  };
  let deleteAttempts = 0;
  const container = {
    item: () => ({
      read: async () => ({ resource: document }),
      delete: async ({ accessCondition }) => {
        deleteAttempts += 1;
        assert.equal(accessCondition.condition, document._etag);
        document = { ...document, sessionId: 'new', _etag: 'v2' };
        throw Object.assign(new Error('conflict'), { code: 412 });
      },
    }),
  };

  assert.equal(await removeLivePresence('octo-cat', 'old', container), false);
  assert.equal(deleteAttempts, 1);
  assert.equal(document.sessionId, 'new');
});

test('rejects a parallel heartbeat from the same session after a write conflict', async () => {
  const timestamp = new Date().toISOString();
  let document = {
    id: 'octo-cat',
    login: 'octo-cat',
    sessionId: 'same',
    sessionStartedAt: timestamp,
    lastHeartbeat: new Date(Date.now() - 20_000).toISOString(),
    _etag: 'v1',
  };
  let replacements = 0;
  const container = {
    items: { create: async next => ({ resource: next }) },
    item: () => ({
      read: async () => ({ resource: document }),
      replace: async () => {
        replacements += 1;
        document = { ...document, lastHeartbeat: timestamp, _etag: 'v2' };
        throw Object.assign(new Error('conflict'), { code: 412 });
      },
    }),
  };

  await assert.rejects(
    saveLivePresence({ ...document, lastHeartbeat: timestamp }, { container }),
    error => error.code === 'heartbeat-rate-limit',
  );
  assert.equal(replacements, 1);
});

test('lets a newer replacement session win after a write conflict', async () => {
  const startedAt = new Date().toISOString();
  let document = {
    id: 'octo-cat',
    login: 'octo-cat',
    sessionId: 'oldest',
    sessionStartedAt: new Date(Date.now() - 20_000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 20_000).toISOString(),
    _etag: 'v1',
  };
  let replacements = 0;
  const container = {
    items: { create: async next => ({ resource: next }) },
    item: () => ({
      read: async () => ({ resource: document }),
      replace: async (next) => {
        replacements += 1;
        if (replacements === 1) {
          document = {
            ...document,
            sessionId: 'older',
            sessionStartedAt: new Date(Date.now() - 10_000).toISOString(),
            lastHeartbeat: new Date(Date.now() - 3_000).toISOString(),
            _etag: 'v2',
          };
          throw Object.assign(new Error('conflict'), { code: 412 });
        }
        document = { ...next, _etag: 'v3' };
        return { resource: document };
      },
    }),
  };

  const saved = await saveLivePresence({
    ...document,
    sessionId: 'new',
    sessionStartedAt: startedAt,
    lastHeartbeat: startedAt,
  }, { container });
  assert.equal(saved.sessionId, 'new');
  assert.equal(replacements, 2);
});