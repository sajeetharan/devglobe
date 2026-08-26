import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionPreviewError, buildMissionPreview, normalizePreviewLogin, previewPreferences } from '../lib/mission-preview.js';
import { createMissionPreviewHandler } from '../app/api/mission-preview/route.js';

const NOW = new Date('2026-08-26T10:00:00.000Z');

function developerContainer(profile = { login: 'octocat', name: 'The Octocat', avatarUrl: 'avatar', topLanguage: 'JavaScript', claimed: true }) {
  return { items: { query: () => ({ fetchAll: async () => ({ resources: profile ? [profile] : [] }) }) } };
}

function stateContainer() {
  return {
    item: () => ({ read: async () => { throw Object.assign(new Error('missing'), { code: 404 }); } }),
    items: { upsert: async () => {} },
  };
}

function candidate() {
  return {
    issue: {
      id: 123,
      title: 'Improve README setup instructions',
      state: 'open',
      html_url: 'https://github.com/org/repo/issues/123',
      updated_at: '2026-08-25T12:00:00.000Z',
      labels: [{ name: 'good first issue' }, { name: 'documentation' }],
      assignees: [],
    },
    repository: {
      full_name: 'org/repo',
      language: 'JavaScript',
      private: false,
      archived: false,
      disabled: false,
      has_issues: true,
      stargazers_count: 50,
    },
    hasContributionGuide: true,
  };
}

test('normalizes valid GitHub logins and rejects malformed input', () => {
  assert.equal(normalizePreviewLogin(' @OctoCat '), 'octocat');
  assert.throws(() => normalizePreviewLogin('-invalid'), MissionPreviewError);
  assert.throws(() => normalizePreviewLogin(''), MissionPreviewError);
});

test('uses profile languages and safe defaults for sparse profiles', () => {
  assert.deepEqual(previewPreferences({ topLanguage: 'JavaScript' }), {
    interests: [],
    languages: ['javascript'],
    difficulty: 'beginner',
    campaign: 'all',
    availableMinutes: 30,
  });
  assert.deepEqual(previewPreferences({}), {
    interests: [],
    languages: [],
    difficulty: 'beginner',
    campaign: 'all',
    availableMinutes: 30,
  });
});

test('builds a read-only preview without mission lifecycle state', () => {
  const opportunity = { id: '123', title: 'Improve README', labels: ['documentation'], estimatedMinutes: 15 };
  const preview = buildMissionPreview(opportunity);

  assert.equal(preview.type, 'Improve documentation');
  assert.equal(preview.durationMinutes, 15);
  assert.equal(preview.opportunity, opportunity);
  assert.equal(Object.hasOwn(preview, 'status'), false);
  assert.equal(Object.hasOwn(preview, 'id'), false);
});

test('returns one public read-only mission without claimed profile fields', async () => {
  const handler = createMissionPreviewHandler({
    getDeveloperContainer: () => developerContainer(),
    getStateContainer: () => stateContainer(),
    reservePreview: async () => 0,
    reserveRefresh: async () => 0,
    fetchCandidates: async () => [candidate()],
    now: () => NOW,
  });
  const response = await handler(new Request('http://localhost/api/mission-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'OctoCat' }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body.profile).sort(), ['avatarUrl', 'login', 'name']);
  assert.equal(body.mission.durationMinutes, 15);
  assert.equal(Object.hasOwn(body.mission, 'status'), false);
});

test('stops before GitHub matching when preview quota is exhausted', async () => {
  let fetches = 0;
  const handler = createMissionPreviewHandler({
    getDeveloperContainer: () => developerContainer(),
    getStateContainer: () => stateContainer(),
    reservePreview: async () => 42,
    fetchCandidates: async () => { fetches += 1; return []; },
  });
  const response = await handler(new Request('http://localhost/api/mission-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'octocat' }),
  }));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  assert.equal(fetches, 0);
});