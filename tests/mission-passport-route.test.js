import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyMissionGetHandler, createDailyMissionPostHandler } from '../app/api/daily-mission/route.js';
import { MissionVerificationUnavailableError } from '../lib/github-mission-verification.js';

const NOW = new Date('2026-10-05T08:00:00Z');
const accepted = {
  id: 'octocat:2026-10-04:42', day: '2026-10-04', status: 'accepted', issueId: '42',
  acceptedAt: '2026-10-04T08:00:00Z', opportunity: { id: '42', title: 'Improve setup documentation', url: 'https://github.com/org/repo/issues/42' },
};

function fixture(mission = accepted) {
  let state = { dailyMission: structuredClone(mission), completedMissions: [] };
  return {
    get state() { return state; },
    dependencies: {
      loadOwner: async () => ({ container: {}, stateContainer: {}, developer: { login: 'octocat', languages: [{ name: 'TypeScript' }], contributionOpportunity: state } }),
      patchMissionState: async (_container, _developer, update) => { state = update(state); return state; },
      now: () => NOW,
      refreshReplies: async (_container, _developer, current) => ({ state: current, replies: [] }),
      recordAcceptance: async () => {},
    },
  };
}

function post(body, origin = 'http://localhost') {
  return new Request('http://localhost/api/daily-mission', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
}

test('GET preserves previous-day accepted mission instead of fetching a new one', async () => {
  const f = fixture();
  const handler = createDailyMissionGetHandler({ ...f.dependencies, fetchCandidates: async () => { throw new Error('Must not replace accepted mission'); } });
  const response = await handler(new Request('http://localhost/api/daily-mission?savedIssueUrl=https://github.com/org/repo/issues/99'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mission.id, accepted.id);
  assert.equal(data.savedRestoreAttempted, true);
  assert.equal(data.restoredSaved, false);
});

test('saved issue is revalidated and never accepted using browser-supplied details', async () => {
  const f = fixture(null);
  let requestedUrl;
  const candidate = {
    issue: { id: 42, title: 'Improve setup documentation', state: 'open', html_url: accepted.opportunity.url, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), labels: [{ name: 'good first issue' }], assignees: [] },
    repository: { full_name: 'org/repo', language: 'TypeScript' }, hasContributionGuide: true,
    lastMaintainerActivityAt: NOW.toISOString(), recentlyMergedPullRequests: 3,
  };
  const handler = createDailyMissionGetHandler({
    ...f.dependencies, reserveRefresh: async () => 0,
    fetchCandidates: async (_preferences, options) => { requestedUrl = options.issueUrl; return [candidate]; },
  });
  const response = await handler(new Request(`http://localhost/api/daily-mission?savedIssueUrl=${encodeURIComponent(accepted.opportunity.url)}`));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(requestedUrl, accepted.opportunity.url);
  assert.equal(data.restoredSaved, true);
  assert.equal(data.mission.status, 'offered');
  assert.equal(data.mission.title, undefined);
  assert.equal(data.mission.opportunity.title, candidate.issue.title);
  candidate.issue.assignees = [{ login: 'maintainer' }];
  assert.equal((await handler(new Request(`http://localhost/api/daily-mission?savedIssueUrl=${encodeURIComponent(accepted.opportunity.url)}`))).status, 422);
  const rejected = fixture(null);
  const invalid = await createDailyMissionGetHandler({
    ...rejected.dependencies, reserveRefresh: async () => 0, fetchCandidates: async () => [candidate],
  })(new Request(`http://localhost/api/daily-mission?savedIssueUrl=${encodeURIComponent(accepted.opportunity.url)}`));
  assert.equal(invalid.status, 422);
  assert.equal(rejected.state.dailyMission, null);
});

test('saved restoration rejects unsafe URLs and retains shared quota pressure', async () => {
  const f = fixture(null);
  const handler = createDailyMissionGetHandler({
    ...f.dependencies, reserveRefresh: async () => 17,
    fetchCandidates: async () => { throw new Error('Quota must prevent fetch'); },
  });
  assert.equal((await handler(new Request('http://localhost/api/daily-mission?savedIssueUrl=https://evil.test/issue'))).status, 400);
  const response = await handler(new Request(`http://localhost/api/daily-mission?savedIssueUrl=${encodeURIComponent(accepted.opportunity.url)}`));
  assert.equal((await response.json()).retryAfterSeconds, 17);
  assert.equal(f.state.dailyMission, null);
});

test('progress updates persist across days without granting completion', async () => {
  const f = fixture();
  const handler = createDailyMissionPostHandler(f.dependencies);
  for (const action of ['read_guide', 'started', 'blocked']) {
    const response = await handler(post({ action, missionId: accepted.id, blocker: 'setup' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mission.status, 'accepted');
  }
  assert.equal(f.state.completedMissions.length, 0);
  assert.equal(f.state.dailyMission.progress.blocker, 'setup');
});

test('passing a previous-day mission does not reuse previous-day recommendations', async () => {
  const f = fixture();
  f.state.dailyMissionPool = { day: '2026-10-04', opportunities: [{ id: '99', title: 'Old alternative', url: 'https://github.com/org/repo/issues/99' }] };
  const response = await createDailyMissionPostHandler(f.dependencies)(post({ action: 'pass', missionId: accepted.id }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mission, null);
  assert.deepEqual(f.state.dailyMissionHistory.issueIds, ['42']);
});

test('PR submission is verified server-side; forged client evidence is ignored', async () => {
  const f = fixture();
  const handler = createDailyMissionPostHandler({
    ...f.dependencies, verifyProgress: async () => ({ submitted: true, completed: false, evidence: { type: 'submitted_pull_request', url: 'https://github.com/org/repo/pull/7' } }),
  });
  const response = await handler(post({ action: 'verify_progress', missionId: accepted.id, completionEvidence: { url: 'forged' } }));
  assert.equal(response.status, 200);
  assert.equal(f.state.dailyMission.progress.submittedEvidence.url, 'https://github.com/org/repo/pull/7');
  assert.equal(f.state.dailyMission.completionEvidence, undefined);
  assert.equal(f.state.completedMissions.length, 0);
});

test('absent proof and unavailable GitHub checks do not update progress or completion', async () => {
  const f = fixture();
  const absent = createDailyMissionPostHandler({ ...f.dependencies, verifyProgress: async () => ({ submitted: false, completed: false }) });
  assert.equal((await absent(post({ action: 'verify_progress', missionId: accepted.id }))).status, 422);
  const unavailable = createDailyMissionPostHandler({ ...f.dependencies, verifyCompletion: async () => { throw new MissionVerificationUnavailableError('Rate limited'); } });
  assert.equal((await unavailable(post({ action: 'complete', missionId: accepted.id }))).status, 503);
  assert.equal(f.state.dailyMission.progress, undefined);
  assert.equal(f.state.completedMissions.length, 0);
});

test('completion requires merged proof, and stale IDs cannot write verified evidence', async () => {
  const f = fixture();
  const proof = { completed: true, evidence: { type: 'merged_pull_request', url: 'https://github.com/org/repo/pull/7' } };
  const handler = createDailyMissionPostHandler({ ...f.dependencies, verifyCompletion: async () => proof });
  assert.equal((await handler(post({ action: 'complete', missionId: 'stale' }))).status, 409);
  assert.equal((await handler(post({ action: 'complete', missionId: accepted.id }))).status, 200);
  assert.equal(f.state.completedMissions.length, 1);
  assert.equal(f.state.dailyMission.completionEvidence.type, 'merged_pull_request');
  assert.equal((await handler(post({ action: 'complete', missionId: accepted.id }))).status, 409);
  assert.equal(f.state.completedMissions.length, 1);
});

test('acceptance imports only self-reported guest checkpoints', async () => {
  const offered = { ...accepted, id: 'octocat:2026-10-05:42', day: '2026-10-05', status: 'offered', acceptedAt: undefined };
  const f = fixture(offered);
  const response = await createDailyMissionPostHandler(f.dependencies)(post({
    action: 'accept', missionId: offered.id,
    localProgress: { guideRead: true, started: true, submittedEvidence: { url: 'forged' } },
  }));
  assert.equal(response.status, 200);
  assert.equal(f.state.dailyMission.progress.guideReadAt, NOW.toISOString());
  assert.equal(f.state.dailyMission.progress.startedAt, NOW.toISOString());
  assert.equal(f.state.dailyMission.progress.submittedEvidence, undefined);
});

test('mutation origin, authentication and input safeguards remain enforced', async () => {
  const f = fixture();
  const handler = createDailyMissionPostHandler(f.dependencies);
  assert.equal((await handler(post({ action: 'started', missionId: accepted.id }, 'https://evil.test'))).status, 403);
  assert.equal((await handler(post(null))).status, 400);
  const signedOut = createDailyMissionPostHandler({ ...f.dependencies, loadOwner: async () => ({ error: new Response('{}', { status: 401 }) }) });
  assert.equal((await signedOut(post({ action: 'started', missionId: accepted.id }))).status, 401);
});

test('concurrent reacceptance cannot reuse previously fetched proof', async () => {
  const f = fixture();
  const handler = createDailyMissionPostHandler({
    ...f.dependencies,
    verifyCompletion: async () => ({ completed: true, evidence: { type: 'merged_pull_request', url: 'https://github.com/org/repo/pull/7' } }),
    patchMissionState: async (_container, _developer, update) => update({
      dailyMission: { ...accepted, acceptedAt: NOW.toISOString() }, completedMissions: [],
    }),
  });
  assert.equal((await handler(post({ action: 'complete', missionId: accepted.id }))).status, 409);
  assert.equal(f.state.completedMissions.length, 0);
});
