import test from 'node:test';
import assert from 'node:assert/strict';
import { createHacktoberfestMatchesHandler } from '../app/api/hacktoberfest-matches/route.js';
import { ContributionOpportunitiesUnavailableError } from '../lib/github-contribution-opportunities.js';

const now = new Date('2026-08-22T12:00:00.000Z');

function developerContainer(resources = [{
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://github.com/octocat.png',
  languages: [{ name: 'TypeScript' }, { name: 'JavaScript' }],
}]) {
  return {
    items: {
      query: () => ({ fetchAll: async () => ({ resources }) }),
    },
  };
}

function candidate(id) {
  return {
    issue: {
      id,
      title: `Improve TypeScript documentation example ${id}`,
      state: 'open',
      html_url: `https://github.com/org/repo/issues/${id}`,
      updated_at: '2026-08-21T12:00:00.000Z',
      labels: [{ name: 'hacktoberfest' }, { name: 'good first issue' }, { name: 'documentation' }],
      assignees: [],
    },
    repository: {
      full_name: 'org/repo',
      language: 'TypeScript',
      private: false,
      archived: false,
      disabled: false,
      has_issues: true,
      stargazers_count: 100,
    },
    hasContributionGuide: true,
  };
}

test('public matcher validates GitHub usernames before querying', async () => {
  const handler = createHacktoberfestMatchesHandler();
  const response = await handler(new Request('http://localhost/api/hacktoberfest-matches?login=not valid'));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Enter a valid GitHub username');
});

test('public matcher derives profile languages and returns three Hacktoberfest matches', async () => {
  let receivedPreferences;
  const handler = createHacktoberfestMatchesHandler({
    getDeveloperContainer: () => developerContainer(),
    getStateContainer: () => ({}),
    reserveRefresh: async () => 0,
    fetchCandidates: async preferences => {
      receivedPreferences = preferences;
      return [candidate(1), candidate(2), candidate(3), candidate(4)];
    },
    now: () => now,
  });
  const response = await handler(new Request('http://localhost/api/hacktoberfest-matches?login=OctoCat'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedPreferences, {
    campaign: 'hacktoberfest-2026',
    difficulty: 'beginner',
    interests: [],
    languages: ['typescript', 'javascript'],
  });
  assert.equal(body.developer.login, 'octocat');
  assert.equal(body.matches.length, 3);
  assert.ok(body.matches.every(match => match.labels.includes('hacktoberfest')));
});

test('public matcher reports unknown profiles without consuming refresh quota', async () => {
  let refreshes = 0;
  const handler = createHacktoberfestMatchesHandler({
    getDeveloperContainer: () => developerContainer([]),
    getStateContainer: () => ({}),
    reserveRefresh: async () => { refreshes += 1; return 0; },
  });
  const response = await handler(new Request('http://localhost/api/hacktoberfest-matches?login=missing'));

  assert.equal(response.status, 404);
  assert.equal(refreshes, 0);
});

test('public matcher preserves shared quota and discovery failures', async () => {
  const busyHandler = createHacktoberfestMatchesHandler({
    getDeveloperContainer: () => developerContainer(),
    getStateContainer: () => ({}),
    reserveRefresh: async () => 17,
  });
  const busyResponse = await busyHandler(new Request('http://localhost/api/hacktoberfest-matches?login=octocat'));
  assert.equal(busyResponse.status, 429);
  assert.equal(busyResponse.headers.get('retry-after'), '17');

  const unavailableHandler = createHacktoberfestMatchesHandler({
    getDeveloperContainer: () => developerContainer(),
    getStateContainer: () => ({}),
    reserveRefresh: async () => 0,
    fetchCandidates: async () => { throw new ContributionOpportunitiesUnavailableError(); },
  });
  const unavailableResponse = await unavailableHandler(new Request('http://localhost/api/hacktoberfest-matches?login=octocat'));
  assert.equal(unavailableResponse.status, 503);
});