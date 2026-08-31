import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EngagementValidationError,
  aggregateDailyMissionMetrics,
  aggregateProfileInsights,
  createEngagementEvent,
  isAutomatedUserAgent,
  isVerifiedProfileOwner,
  normalizeEngagementEvent,
  resolveEngagementSession,
} from '../lib/engagement.js';

test('allows only documented engagement properties and never stores search text', () => {
  const event = normalizeEngagementEvent({
    eventName: 'profile_viewed',
    targetLogin: 'OctoCat',
    properties: { source: 'search', query: 'private raw query', email: 'person@example.com' },
  });

  assert.deepEqual(event, {
    eventName: 'profile_viewed',
    targetLogin: 'octocat',
    properties: { source: 'search' },
  });
  assert.throws(() => normalizeEngagementEvent({ eventName: 'unknown' }), EngagementValidationError);
});

test('accepts privacy-safe daily mission funnel events without a target profile', () => {
  for (const eventName of ['activation_started', 'activation_action_selected', 'mission_viewed', 'mission_accepted', 'mission_passed', 'mission_completed', 'mission_unavailable', 'mission_exhausted', 'mission_preview_requested', 'mission_preview_shown', 'mission_preview_signin_selected', 'mission_onboarding_completed']) {
    assert.deepEqual(normalizeEngagementEvent({
      eventName,
      properties: { journey: 'daily_mission', issueTitle: 'private issue text' },
    }), {
      eventName,
      targetLogin: null,
      properties: { journey: 'daily_mission' },
    });
  }
});

test('deduplicates rerenders inside a session window without storing raw sessions', () => {
  const options = { session: 'raw-session', secret: 'test-secret', now: '2026-08-21T10:05:00.000Z' };
  const first = createEngagementEvent({ eventName: 'profile_viewed', targetLogin: 'octocat' }, options);
  const duplicate = createEngagementEvent({ eventName: 'profile_viewed', targetLogin: 'octocat' }, {
    ...options,
    now: '2026-08-21T10:20:00.000Z',
  });
  const nextWindow = createEngagementEvent({ eventName: 'profile_viewed', targetLogin: 'octocat' }, {
    ...options,
    now: '2026-08-21T10:35:00.000Z',
  });

  assert.equal(first.id, duplicate.id);
  assert.notEqual(first.id, nextWindow.id);
  assert.notEqual(first.sessionHash, 'raw-session');
  assert.equal(first.partitionKey, 'octocat');
  assert.equal(first.instrumentationVersion, 2);
});

test('preserves separate route visits in the same browser window', () => {
  const options = { session: 'session', secret: 'secret', now: '2026-08-21T10:05:00.000Z' };
  const homepage = createEngagementEvent({ eventName: 'site_visited', properties: { journey: 'homepage' } }, options);
  const leaderboard = createEngagementEvent({ eventName: 'site_visited', properties: { journey: 'leaderboard' } }, options);

  assert.notEqual(homepage.id, leaderboard.id);
});

test('preserves distinct share channels while deduplicating retries', () => {
  const options = { session: 'session', secret: 'secret', now: '2026-08-21T10:05:00.000Z' };
  const linkedIn = createEngagementEvent({ eventName: 'profile_shared', targetLogin: 'octocat', properties: { channel: 'linkedin' } }, options);
  const retry = createEngagementEvent({ eventName: 'profile_shared', targetLogin: 'octocat', properties: { channel: 'linkedin' } }, options);
  const copied = createEngagementEvent({ eventName: 'profile_shared', targetLogin: 'octocat', properties: { channel: 'copy_link' } }, options);

  assert.equal(linkedIn.id, retry.id);
  assert.notEqual(linkedIn.id, copied.id);
});

test('preserves distinct leaderboard story types on the same share channel', () => {
  const options = { session: 'session', secret: 'secret', now: '2026-08-21T10:05:00.000Z' };
  const spotlight = createEngagementEvent({ eventName: 'profile_shared', targetLogin: 'octocat', properties: { channel: 'copy_link', action: 'developer_spotlight' } }, options);
  const movement = createEngagementEvent({ eventName: 'profile_shared', targetLogin: 'octocat', properties: { channel: 'copy_link', action: 'rank_movement' } }, options);

  assert.notEqual(spotlight.id, movement.id);
});

test('accepts attributed social profile opens without arbitrary campaign data', () => {
  const event = normalizeEngagementEvent({
    eventName: 'social_profile_opened',
    targetLogin: 'OctoCat',
    properties: { source: 'reddit', journey: 'rank_movement', utmContent: 'private-value' },
  });

  assert.deepEqual(event, {
    eventName: 'social_profile_opened',
    targetLogin: 'octocat',
    properties: { source: 'reddit', journey: 'rank_movement' },
  });
});

test('accepts only signed server sessions and replaces forged cookies', () => {
  const created = resolveEngagementSession('', 'secret', () => 'server-id');
  const restored = resolveEngagementSession(created.cookieValue, 'secret', () => 'unused');
  const forged = resolveEngagementSession('attacker.bad-signature', 'secret', () => 'replacement');

  assert.deepEqual(restored, { id: 'server-id', cookieValue: null });
  assert.equal(forged.id, 'replacement');
  assert.notEqual(forged.cookieValue, 'attacker.bad-signature');
});

test('classifies crawlers and empty user agents as automated', () => {
  assert.equal(isAutomatedUserAgent('Mozilla/5.0 Chrome/120'), false);
  assert.equal(isAutomatedUserAgent('Twitterbot/1.0'), true);
  assert.equal(isAutomatedUserAgent(''), true);
});

test('aggregates current and prior periods while suppressing low-volume cohorts', () => {
  const event = (eventName, createdAt, sessionHash) => ({ eventName, createdAt, sessionHash, privacyHash: sessionHash });
  const events = [
    event('profile_viewed', '2026-08-20T12:00:00.000Z', 'a'),
    event('profile_viewed', '2026-08-20T13:00:00.000Z', 'b'),
    event('profile_viewed', '2026-08-20T14:00:00.000Z', 'c'),
    event('profile_viewed', '2026-08-10T12:00:00.000Z', 'd'),
    event('profile_viewed', '2026-08-10T13:00:00.000Z', 'e'),
    event('profile_viewed', '2026-08-10T14:00:00.000Z', 'f'),
    event('card_generated', '2026-08-20T12:00:00.000Z', 'a'),
  ];
  const insights = aggregateProfileInsights(events, { now: '2026-08-21T15:00:00.000Z' });
  const sevenDays = insights.periods.find(period => period.days === 7);

  assert.equal(sevenDays.metrics.profileViews.value, 3);
  assert.equal(sevenDays.metrics.profileViews.previousValue, 3);
  assert.equal(sevenDays.metrics.profileViews.change, 0);
  assert.equal(sevenDays.metrics.cardGenerations.value, null);
  assert.equal(sevenDays.metrics.cardGenerations.uniqueSessions, null);
  assert.equal(sevenDays.metrics.cardGenerations.suppressed, true);
});

test('cookie churn cannot bypass the low-volume privacy threshold', () => {
  const events = ['session-a', 'session-b', 'session-c'].map(sessionHash => ({
    eventName: 'profile_viewed',
    createdAt: '2026-08-20T12:00:00.000Z',
    sessionHash,
    privacyHash: 'same-network-cohort',
  }));
  const insights = aggregateProfileInsights(events, { now: '2026-08-21T15:00:00.000Z' });

  assert.equal(insights.periods[0].metrics.profileViews.value, null);
  assert.equal(insights.periods[0].metrics.profileViews.uniqueSessions, null);
});

test('authorizes only the signed-in owner of a claimed profile', () => {
  assert.equal(isVerifiedProfileOwner({ login: 'OctoCat' }, { login: 'octocat', claimed: true }), true);
  assert.equal(isVerifiedProfileOwner({ login: 'someone-else' }, { login: 'octocat', claimed: true }), false);
  assert.equal(isVerifiedProfileOwner({ login: 'octocat' }, { login: 'octocat', claimed: false }), false);
  assert.equal(isVerifiedProfileOwner(null, { login: 'octocat', claimed: true }), false);
});

test('aggregates mission conversion and seven-day returning sessions', () => {
  const event = (eventName, createdAt, sessionHash) => ({ eventName, createdAt, sessionHash });
  const metrics = aggregateDailyMissionMetrics([
    event('mission_viewed', '2026-08-18T12:00:00.000Z', 'returning'),
    event('mission_accepted', '2026-08-18T12:01:00.000Z', 'returning'),
    event('mission_viewed', '2026-08-20T12:00:00.000Z', 'returning'),
    event('mission_completed', '2026-08-20T12:10:00.000Z', 'returning'),
    event('mission_viewed', '2026-08-21T12:00:00.000Z', 'passing'),
    event('mission_passed', '2026-08-21T12:01:00.000Z', 'passing'),
    event('mission_unavailable', '2026-08-21T13:00:00.000Z', 'unavailable'),
    event('mission_exhausted', '2026-08-21T14:00:00.000Z', 'exhausted'),
    event('mission_viewed', '2026-08-10T12:00:00.000Z', 'outside-window'),
  ], { now: new Date('2026-08-22T00:00:00.000Z'), threshold: 1 });

  assert.deepEqual(metrics, {
    days: 7,
    privacyThreshold: 1,
    suppressed: false,
    uniqueViewers: 2,
    uniqueAcceptors: 1,
    uniquePassers: 1,
    uniqueCompleters: 1,
    acceptanceRate: 0.5,
    passRate: 0.5,
    completionRate: 1,
    availabilityRate: 0.75,
    exhaustedPoolRate: 0.25,
    returningSessions: 1,
    returningUserRate: 0.5,
  });
});

test('suppresses low-volume mission reporting cohorts', () => {
  const metrics = aggregateDailyMissionMetrics([
    { eventName: 'mission_viewed', createdAt: '2026-08-21T12:00:00.000Z', sessionHash: 'only-session' },
  ], { now: new Date('2026-08-22T00:00:00.000Z') });

  assert.equal(metrics.suppressed, true);
  assert.equal(metrics.uniqueViewers, null);
  assert.equal(metrics.returningUserRate, null);
});

test('suppresses each low-volume mission metric and counts recovered availability', () => {
  const event = (eventName, sessionHash) => ({ eventName, sessionHash, createdAt: '2026-08-21T12:00:00.000Z' });
  const metrics = aggregateDailyMissionMetrics([
    event('mission_unavailable', 'recovered'),
    event('mission_viewed', 'recovered'),
    event('mission_viewed', 'viewer-2'),
    event('mission_viewed', 'viewer-3'),
    event('mission_accepted', 'recovered'),
  ], { now: new Date('2026-08-22T00:00:00.000Z') });

  assert.equal(metrics.uniqueViewers, 3);
  assert.equal(metrics.uniqueAcceptors, null);
  assert.equal(metrics.acceptanceRate, null);
  assert.equal(metrics.availabilityRate, 1);
});

test('requires a target profile for completed profile activation events', () => {
  assert.deepEqual(normalizeEngagementEvent({
    eventName: 'profile_claimed',
    targetLogin: 'OctoCat',
    properties: { source: 'linkedin' },
  }), {
    eventName: 'profile_claimed',
    targetLogin: 'octocat',
    properties: { source: 'linkedin' },
  });
  assert.throws(() => normalizeEngagementEvent({ eventName: 'profile_claimed' }), EngagementValidationError);
  assert.throws(() => normalizeEngagementEvent({ eventName: 'personalized_profile_viewed' }), EngagementValidationError);
  assert.throws(() => normalizeEngagementEvent({ eventName: 'activation_completed' }), EngagementValidationError);
  assert.equal(normalizeEngagementEvent({ eventName: 'activation_completed', targetLogin: 'OctoCat' }).targetLogin, 'octocat');
  assert.throws(() => normalizeEngagementEvent({ eventName: 'profile_primary_action_viewed' }), EngagementValidationError);
  assert.deepEqual(normalizeEngagementEvent({
    eventName: 'profile_primary_action_viewed',
    targetLogin: 'OctoCat',
    properties: { action: 'follow_impact', journey: 'profile_primary_action' },
  }), {
    eventName: 'profile_primary_action_viewed',
    targetLogin: 'octocat',
    properties: { action: 'follow_impact', journey: 'profile_primary_action' },
  });
});

test('accepts privacy-safe weekly digest return attribution without a target profile', () => {
  assert.deepEqual(normalizeEngagementEvent({
    eventName: 'weekly_digest_returned',
    properties: {
      action: 'contribution_opportunity',
      journey: 'weekly_digest',
      source: 'weekly_digest',
      utm_term: '2026-W35',
    },
  }), {
    eventName: 'weekly_digest_returned',
    targetLogin: null,
    properties: {
      action: 'contribution_opportunity',
      journey: 'weekly_digest',
      source: 'weekly_digest',
    },
  });
});

test('accepts visitor and search funnel events without storing query text', () => {
  for (const eventName of ['site_visited', 'search_submitted']) {
    const event = normalizeEngagementEvent({
      eventName,
      properties: { action: 'text', journey: 'developer_discovery', source: 'search_button', query: 'private search text' },
    });
    assert.deepEqual(event, {
      eventName,
      targetLogin: null,
      properties: { action: 'text', journey: 'developer_discovery', source: 'search_button' },
    });
  }
});