import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requestMissionJson, missionFailureOutcome } from '../lib/mission-telemetry.js';
import { createEngagementEvent } from '../lib/engagement.js';
import { safeAnalyticsProperties } from '../lib/analytics.js';

function requestOptions(events, fetchImpl, action) {
  return {
    url: action ? '/api/daily-mission' : '/api/mission-preview',
    options: { method: 'POST', body: '{"login":"private-name","missionId":"private-id"}' },
    requestedEvent: action ? 'mission_action_requested' : 'mission_preview_requested',
    failedEvent: action ? 'mission_action_failed' : 'mission_preview_failed',
    properties: action ? { action, journey: 'daily_mission' } : { journey: 'mission_preview' },
    track: (name, properties) => events.push({ name, properties }),
    fetchImpl,
  };
}

test('successful and empty preview responses preserve data and record only the request', async () => {
  for (const mission of [null, { type: 'documentation' }]) {
    const events = [];
    const { response, data } = await requestMissionJson(requestOptions(events,
      async () => Response.json({ mission })));
    assert.equal(response.status, 200);
    assert.deepEqual(data.mission, mission);
    assert.deepEqual(events, [{ name: 'mission_preview_requested', properties: { journey: 'mission_preview' } }]);
  }
});

test('HTTP failures retain response semantics and emit one bounded outcome without raw errors', async () => {
  for (const [status, outcome] of [
    [400, 'invalid_request'], [401, 'signed_out'], [403, 'forbidden'],
    [404, 'profile_missing'], [409, 'conflict'], [422, 'verification_pending'],
    [429, 'rate_limited'], [500, 'unavailable'], [503, 'unavailable'],
  ]) {
    const events = [];
    const { response, data } = await requestMissionJson(requestOptions(events,
      async () => Response.json({ error: 'private error detail' }, { status }), 'accept'));
    assert.equal(response.status, status);
    assert.equal(data.error, 'private error detail');
    assert.deepEqual(events, [
      { name: 'mission_action_requested', properties: { action: 'accept', journey: 'daily_mission' } },
      { name: 'mission_action_failed', properties: { action: 'accept', journey: 'daily_mission', outcome } },
    ]);
    assert.ok(!JSON.stringify(events).includes('private'));
  }
  assert.equal(missionFailureOutcome(418), 'request_failed');
});

test('network and malformed responses emit failures and propagate errors to the UI', async () => {
  for (const [fetchImpl, outcome] of [
    [async () => { throw new Error('network unavailable'); }, 'network_error'],
    [async () => new Response('not json'), 'invalid_response'],
    [async () => Response.json(null), 'invalid_response'],
    [async () => Response.json([]), 'invalid_response'],
    [async () => new Response('busy', { status: 503 }), 'unavailable'],
  ]) {
    const events = [];
    await assert.rejects(requestMissionJson(requestOptions(events, fetchImpl)));
    assert.equal(events.length, 2);
    assert.equal(events[1].properties.outcome, outcome);
  }
});

test('successful mission actions do not emit failures or premature completion', async () => {
  for (const action of ['accept', 'pass', 'complete']) {
    const events = [];
    await requestMissionJson(requestOptions(events,
      async () => Response.json({ mission: { status: 'accepted' } }), action));
    assert.deepEqual(events, [
      { name: 'mission_action_requested', properties: { action, journey: 'daily_mission' } },
    ]);
  }
});

test('durable diagnostics are allow-listed, private, and separated by action and outcome', () => {
  const options = { session: 'session', secret: 'secret', now: '2026-10-03T12:00:00Z' };
  const event = (action, outcome) => createEngagementEvent({
    eventName: 'mission_action_failed',
    properties: { action, outcome, login: 'private', error: 'private', issueId: 'private' },
  }, options);
  const accept = event('accept', 'rate_limited');
  assert.deepEqual(accept.properties, { action: 'accept', outcome: 'rate_limited' });
  assert.notEqual(accept.id, event('complete', 'rate_limited').id);
  assert.notEqual(accept.id, event('accept', 'signed_out').id);
  assert.equal(accept.id, event('accept', 'rate_limited').id);
  assert.deepEqual(event('private-name', 'private-error').properties, { action: 'unknown', outcome: 'request_failed' });
  assert.equal(createEngagementEvent({ eventName: 'mission_preview_failed', properties: { outcome: 'profile_missing' } }, options).properties.outcome, 'profile_missing');
  for (const eventName of ['mission_action_requested', 'mission_action_failed', 'mission_preview_failed']) {
    assert.doesNotThrow(() => createEngagementEvent({ eventName }, options));
  }
  assert.deepEqual(safeAnalyticsProperties({ action: 'accept', outcome: 'signed_out', login: 'private' }), { action: 'accept', outcome: 'signed_out' });
});

test('both mission components and browser event mapping wire the diagnostic helper', async () => {
  const preview = await readFile(new URL('../components/MissionPreview.jsx', import.meta.url), 'utf8');
  const today = await readFile(new URL('../components/TodayMission.jsx', import.meta.url), 'utf8');
  const analytics = await readFile(new URL('../lib/analytics.js', import.meta.url), 'utf8');
  assert.match(preview, /await requestMissionJson/);
  assert.match(preview, /failedEvent: 'mission_preview_failed'/);
  assert.match(today, /await requestMissionJson/);
  assert.match(today, /failedEvent: 'mission_action_failed'/);
  for (const event of ['mission_preview_failed', 'mission_action_requested', 'mission_action_failed']) {
    assert.ok(analytics.includes(`${event}: '${event}'`));
  }
});
