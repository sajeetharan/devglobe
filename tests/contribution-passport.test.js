import test from 'node:test';
import assert from 'node:assert/strict';
import {
  savedContribution, parseSavedContribution, contributionReminder, reminderPreset,
} from '../lib/contribution-passport.js';
import { activeDailyMission, applyMissionAction, applyMissionProgress } from '../lib/daily-mission.js';
import { createEngagementEvent } from '../lib/engagement.js';

const now = new Date('2026-10-04T18:00:00Z');
const opportunity = {
  id: '42', title: 'Improve documentation', url: 'https://github.com/org/repo/issues/42',
  contributionGuideUrl: 'https://github.com/org/repo/blob/main/CONTRIBUTING.md',
  body: 'must not persist', login: 'must not persist',
};
const accepted = {
  id: 'octocat:2026-10-01:42', day: '2026-10-01', issueId: '42', status: 'accepted',
  acceptedAt: '2026-10-01T08:00:00Z', opportunity,
};

test('saves bounded public summaries and restores self-reported progress', () => {
  const saved = savedContribution(opportunity, now.getTime());
  assert.equal(saved.version, 1);
  assert.equal(saved.repository, 'org/repo');
  assert.equal(saved.contributionGuideUrl, opportunity.contributionGuideUrl);
  assert.equal(Object.hasOwn(saved, 'body'), false);
  assert.equal(Object.hasOwn(saved, 'login'), false);
  const restored = parseSavedContribution(JSON.stringify({ ...saved, guideRead: true, started: true }), now.getTime());
  assert.equal(restored.guideRead, true);
  assert.equal(restored.started, true);
  assert.equal(savedContribution({ ...opportunity, title: 'x'.repeat(1000) }).title.length, 240);
});

test('invalid, expired, future and unsafe saves fail explicitly', () => {
  assert.equal(parseSavedContribution(null), null);
  assert.throws(() => parseSavedContribution('{bad'), SyntaxError);
  for (const savedAt of [now.getTime() + 1, now.getTime() - 31 * 86400000]) {
    assert.throws(() => parseSavedContribution(JSON.stringify({ ...savedContribution(opportunity), savedAt }), now.getTime()), /expired or is invalid/);
  }
  for (const url of ['javascript:alert(1)', 'https://evil.test/org/repo/issues/42', 'https://github.com/org/repo/pull/42']) {
    assert.throws(() => savedContribution({ ...opportunity, url }), /invalid issue details/);
  }
  assert.equal(savedContribution({ ...opportunity, contributionGuideUrl: 'javascript:alert(1)' }).contributionGuideUrl, null);
});

test('accepted missions survive midnight and can complete or pass later', () => {
  assert.equal(activeDailyMission(accepted, now), accepted);
  assert.equal(activeDailyMission({ ...accepted, status: 'offered' }, now), null);
  assert.equal(applyMissionAction(accepted, 'complete', now).status, 'completed');
  assert.equal(applyMissionAction(accepted, 'pass', now).status, 'passed');
  assert.throws(() => applyMissionAction(accepted, 'accept', now), /cannot be accepted/);
});

test('self-reported checkpoints cannot mark completion or manufacture submitted evidence', () => {
  const guide = applyMissionProgress(accepted, 'read_guide', { missionId: accepted.id, now });
  const started = applyMissionProgress(guide, 'started', { missionId: accepted.id, now });
  assert.equal(started.progress.startedAt, now.toISOString());
  assert.equal(started.status, 'accepted');
  assert.equal(started.completionEvidence, undefined);
  assert.throws(() => applyMissionProgress(accepted, 'verify_progress', { missionId: accepted.id, now }), /No submitted pull request/);
  assert.throws(() => applyMissionProgress({ ...accepted, status: 'offered' }, 'started', { missionId: accepted.id }), /Accept/);
  assert.throws(() => applyMissionProgress(accepted, 'started', { missionId: 'stale' }), /Mission changed/);
});

test('finite blocker and verified PR progress remain separate from completion', () => {
  const blocked = applyMissionProgress(accepted, 'blocked', { missionId: accepted.id, blocker: 'setup', now });
  assert.equal(blocked.progress.blocker, 'setup');
  assert.throws(() => applyMissionProgress(accepted, 'blocked', { missionId: accepted.id, blocker: 'private text' }), /Invalid mission blocker/);
  assert.equal(applyMissionProgress(blocked, 'started', { missionId: accepted.id, now }).progress.blocker, undefined);
  const submitted = applyMissionProgress(blocked, 'verify_progress', {
    missionId: accepted.id, now, verification: { submitted: true, evidence: { type: 'submitted_pull_request', url: 'https://github.com/org/repo/pull/7' } },
  });
  assert.equal(submitted.status, 'accepted');
  assert.equal(submitted.progress.submittedEvidence.verifiedAt, now.toISOString());
  assert.equal(submitted.progress.blocker, undefined);
});

test('calendar reminder uses UTC times, escaped text, valid folding, and opt-in alarm', () => {
  const calendar = contributionReminder({ ...opportunity, title: 'Comma, semicolon; backslash\\\nBEGIN:EVIL ' + 'x'.repeat(120) }, new Date('2026-10-05T18:00:00Z'), now);
  assert.match(calendar, /DTSTART:20261005T180000Z/);
  assert.match(calendar, /DTEND:20261005T181500Z/);
  assert.match(calendar, /TRIGGER:-PT10M/);
  assert.match(calendar, /Comma\\, semicolon\\; backslash\\\\\\nBEGIN:EVIL/);
  assert.equal(calendar.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(calendar.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75));
  assert.ok(calendar.replace(/\r\n /g, '').includes('Resume: https://www.devglobe.dev/?feature=today'));
  for (const when of [now, 'bad', new Date(now.getTime() + 367 * 86400000)]) {
    assert.throws(() => contributionReminder(opportunity, when, now), /Choose a reminder/);
  }
  assert.throws(() => contributionReminder({ url: 'javascript:alert(1)' }, new Date('2026-10-05T18:00:00Z'), now), /Invalid/);
});

test('reminder presets remain future local times, including Saturday', () => {
  assert.ok(reminderPreset('tomorrow', now) > now);
  assert.equal(reminderPreset('weekend', now).getDay(), 6);
  assert.equal(reminderPreset('weekend', now).getHours(), 9);
  const saturday = new Date(2026, 9, 10, 10);
  assert.ok(reminderPreset('weekend', saturday) > saturday);
  assert.throws(() => reminderPreset('none'), /supported reminder/);
});

test('passport telemetry stores only finite progress and blocker categories', () => {
  const options = { session: 'session', secret: 'secret', now };
  for (const eventName of ['mission_saved', 'mission_resumed', 'mission_pr_submitted', 'mission_progress_updated', 'mission_blocked', 'mission_reminder_downloaded']) {
    const event = createEngagementEvent({ eventName, properties: { action: 'private notes', issueUrl: opportunity.url, email: 'private' } }, options);
    assert.equal(event.properties.issueUrl, undefined);
    assert.equal(event.properties.email, undefined);
    if (['mission_progress_updated', 'mission_blocked', 'mission_reminder_downloaded'].includes(eventName)) assert.equal(event.properties.action, 'unknown');
  }
  const progress = action => createEngagementEvent({ eventName: 'mission_progress_updated', properties: { action } }, options);
  assert.notEqual(progress('read_guide').id, progress('started').id);
});
