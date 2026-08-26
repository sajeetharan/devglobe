import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContributionPreferenceError,
  estimateContributionMinutes,
  isContributionReadyIssue,
  normalizeContributionPreferences,
  rankContributionOpportunities,
} from '../lib/contribution-opportunities.js';
import {
  ContributionOpportunitiesUnavailableError,
  fetchGitHubContributionCandidates,
} from '../lib/github-contribution-opportunities.js';
import { acquireDailyMissionLease, reserveGlobalRecommendationRefresh, reserveMissionPreview } from '../lib/contribution-opportunity-store.js';

const now = new Date('2026-08-21T12:00:00.000Z');

function candidate(overrides = {}) {
  return {
    issue: {
      id: 1,
      title: 'Improve documentation for setup',
      state: 'open',
      html_url: 'https://github.com/org/repo/issues/1',
      updated_at: '2026-08-20T12:00:00.000Z',
      labels: [{ name: 'good first issue' }, { name: 'documentation' }],
      assignees: [],
      ...overrides.issue,
    },
    repository: {
      full_name: 'org/repo',
      language: 'JavaScript',
      private: false,
      archived: false,
      disabled: false,
      has_issues: true,
      stargazers_count: 50,
      ...overrides.repository,
    },
    hasContributionGuide: overrides.hasContributionGuide ?? true,
  };
}

test('normalizes finite interests, languages, and difficulty', () => {
  assert.deepEqual(normalizeContributionPreferences({
    interests: ['Documentation', 'testing', 'testing'],
    languages: [],
    difficulty: 'BEGINNER',
  }, ['JavaScript']), {
    interests: ['documentation', 'testing'],
    languages: ['javascript'],
    difficulty: 'beginner',
    campaign: 'all',
    availableMinutes: 30,
  });
  assert.throws(() => normalizeContributionPreferences({ interests: ['money'], languages: [], difficulty: 'easy' }), ContributionPreferenceError);
  assert.throws(() => normalizeContributionPreferences({ interests: [], languages: ['brainfuck'], difficulty: 'beginner' }), ContributionPreferenceError);
  assert.throws(() => normalizeContributionPreferences({ interests: [], languages: [], difficulty: 'beginner', campaign: 'october' }), ContributionPreferenceError);
  assert.throws(() => normalizeContributionPreferences({ interests: [], languages: [], difficulty: 'beginner', availableMinutes: 45 }), ContributionPreferenceError);
});

test('derives coarse scope and excludes issues above the available time', () => {
  const documentation = candidate({ issue: { id: 1, title: 'Improve README setup instructions' } });
  const feature = candidate({ issue: { id: 2, title: 'Add feature for team exports', labels: [{ name: 'good first issue' }, { name: 'enhancement' }] } });
  const preferences = { interests: [], languages: ['javascript'], difficulty: 'beginner', campaign: 'all', availableMinutes: 15 };

  assert.equal(estimateContributionMinutes(documentation.issue), 15);
  assert.equal(estimateContributionMinutes(feature.issue), 60);
  assert.deepEqual(rankContributionOpportunities([feature, documentation], preferences, [], now).map(item => item.id), ['1']);
});

test('accepts only fresh public unassigned issues with contribution guidance', () => {
  assert.equal(isContributionReadyIssue(candidate(), now), true);
  assert.equal(isContributionReadyIssue(candidate({ hasContributionGuide: false }), now), false);
  assert.equal(isContributionReadyIssue(candidate({ issue: { assignees: [{ login: 'owner' }] } }), now), false);
  assert.equal(isContributionReadyIssue(candidate({ issue: { updated_at: '2025-01-01T00:00:00.000Z' } }), now), false);
  assert.equal(isContributionReadyIssue(candidate({ issue: { pull_request: { url: 'pr' } } }), now), false);
  assert.equal(isContributionReadyIssue(candidate({ repository: { archived: true } }), now), false);
  assert.equal(isContributionReadyIssue(candidate({ issue: { title: 'Crypto promotion token giveaway' } }), now), false);
});

test('ranks relevant issues with reasons, stable order, limits, and dismissals', () => {
  const candidates = [
    candidate({ issue: { id: 2, title: 'Add test coverage for parser', labels: [{ name: 'testing' }, { name: 'help wanted' }] } }),
    candidate({ issue: { id: 1 } }),
    candidate({ issue: { id: 3, title: 'Improve documentation for install' }, repository: { language: 'Python' } }),
  ];
  const preferences = { interests: ['documentation', 'testing'], languages: ['javascript'], difficulty: 'beginner' };
  const results = rankContributionOpportunities(candidates, preferences, ['2'], now);

  assert.deepEqual(results.map(result => result.id), ['1', '3']);
  assert.deepEqual(results[0].reasons, ['Uses JavaScript', 'Matches documentation', 'beginner friendly']);
  assert.ok(results.every(result => !Object.hasOwn(result, 'score')));
});

test('discovers public issues and verifies repository contribution guidance', async () => {
  const requested = [];
  const fetchImpl = async url => {
    requested.push(url);
    if (url.includes('/search/issues')) return new Response(JSON.stringify({ items: [{
      id: 10,
      title: 'Improve parser test coverage',
      state: 'open',
      html_url: 'https://github.com/org/repo/issues/10',
      repository_url: 'https://api.github.com/repos/org/repo',
      updated_at: '2026-08-20T00:00:00.000Z',
      labels: [{ name: 'good first issue' }],
      assignees: [],
    }] }), { status: 200 });
    if (url.endsWith('/community/profile')) return new Response(JSON.stringify({ files: { contributing: { html_url: 'guide' } } }), { status: 200 });
    return new Response(JSON.stringify({ full_name: 'org/repo', language: 'JavaScript', private: false }), { status: 200 });
  };

  const candidates = await fetchGitHubContributionCandidates({ languages: ['JavaScript'], difficulty: 'beginner' }, {
    fetchImpl,
    token: 'token',
    now,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].hasContributionGuide, true);
  assert.ok(requested[0].includes('language%3A%22JavaScript%22'));
  assert.ok(requested[0].includes('label%3A%22good%20first%20issue%22'));
});

test('requires and searches for the Hacktoberfest label in campaign mode', async () => {
  const candidates = [
    candidate({ issue: { id: 1, labels: [{ name: 'good first issue' }] } }),
    candidate({ issue: { id: 2, labels: [{ name: 'good first issue' }, { name: 'Hacktoberfest' }] } }),
  ];
  const preferences = {
    interests: ['documentation'],
    languages: ['javascript'],
    difficulty: 'beginner',
    campaign: 'hacktoberfest-2026',
  };
  const requested = [];
  const fetchImpl = async url => {
    requested.push(url);
    if (url.includes('/search/issues')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  };

  assert.deepEqual(rankContributionOpportunities(candidates, preferences, [], now).map(item => item.id), ['2']);
  await fetchGitHubContributionCandidates(preferences, { fetchImpl, token: 'token', now });
  assert.ok(requested[0].includes('label%3A%22hacktoberfest%22'));
});

test('reports unavailable discovery when GitHub is not configured', async () => {
  await assert.rejects(
    fetchGitHubContributionCandidates({ languages: [], difficulty: 'beginner' }),
    ContributionOpportunitiesUnavailableError
  );
});

test('advanced recommendations require an explicit advanced difficulty label', () => {
  const generic = candidate({ issue: { labels: [{ name: 'help wanted' }] } });
  const advanced = candidate({ issue: { id: 2, labels: [{ name: 'advanced' }] } });
  const preferences = { interests: ['documentation'], languages: ['javascript'], difficulty: 'advanced' };

  assert.deepEqual(rankContributionOpportunities([generic, advanced], preferences, [], now).map(item => item.id), ['2']);
});

test('atomically limits global recommendation refreshes', async () => {
  let resource = null;
  const container = {
    item: () => ({
      read: async () => {
        if (!resource) throw Object.assign(new Error('missing'), { code: 404 });
        return { resource };
      },
      replace: async next => { resource = { ...next, _etag: `v${next.timestamps.length}` }; },
    }),
    items: {
      create: async next => { resource = { ...next, _etag: 'v1' }; },
    },
  };

  for (let index = 0; index < 4; index += 1) {
    assert.equal(await reserveGlobalRecommendationRefresh(container, new Date(now.getTime() + index * 1000)), 0);
  }
  assert.ok(await reserveGlobalRecommendationRefresh(container, new Date(now.getTime() + 4000)) > 0);
  assert.equal(await reserveGlobalRecommendationRefresh(container, new Date(now.getTime() + 61000)), 0);
});

test('reports unavailable discovery when repository verification is rate limited', async () => {
  const fetchImpl = async url => {
    if (url.includes('/search/issues')) return new Response(JSON.stringify({ items: [{
      id: 10,
      repository_url: 'https://api.github.com/repos/org/repo',
    }] }), { status: 200 });
    return new Response('{}', { status: 403 });
  };

  await assert.rejects(
    fetchGitHubContributionCandidates({ languages: ['javascript'], difficulty: 'beginner' }, { fetchImpl, token: 'token', now }),
    ContributionOpportunitiesUnavailableError
  );
});

test('allows only one daily mission generator until its lease expires', async () => {
  let resource = null;
  const container = {
    item: () => ({
      read: async () => {
        if (!resource) throw Object.assign(new Error('missing'), { code: 404 });
        return { resource };
      },
      replace: async (next, options) => {
        if (options.accessCondition.condition !== resource._etag) throw Object.assign(new Error('conflict'), { code: 412 });
        resource = { ...next, _etag: 'v2' };
      },
    }),
    items: {
      create: async next => {
        if (resource) throw Object.assign(new Error('conflict'), { code: 409 });
        resource = { ...next, _etag: 'v1' };
      },
    },
  };

  assert.equal(await acquireDailyMissionLease(container, 'OctoCat', '2026-08-21', now), true);
  assert.equal(await acquireDailyMissionLease(container, 'OctoCat', '2026-08-21', now), false);
  assert.equal(await acquireDailyMissionLease(container, 'OctoCat', '2026-08-21', new Date(now.getTime() + 31000)), true);
});

test('limits previews by opaque client hash with expiring point records', async () => {
  let resource = null;
  const container = {
    item: () => ({
      read: async () => {
        if (!resource) throw Object.assign(new Error('missing'), { code: 404 });
        return { resource };
      },
      replace: async next => { resource = { ...next, _etag: `v${next.timestamps.length}` }; },
    }),
    items: { create: async next => { resource = { ...next, _etag: 'v1' }; } },
  };

  for (let index = 0; index < 3; index += 1) {
    assert.equal(await reserveMissionPreview(container, 'opaque-hash', new Date(now.getTime() + index * 1000)), 0);
  }
  assert.ok(await reserveMissionPreview(container, 'opaque-hash', new Date(now.getTime() + 3000)) > 0);
  assert.equal(resource.documentType, 'mission-preview-quota');
  assert.ok(resource.ttl > 0);
  assert.equal(await reserveMissionPreview(container, 'opaque-hash', new Date(now.getTime() + 301000)), 0);
});