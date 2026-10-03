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
      created_at: '2026-08-01T12:00:00.000Z',
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
    lastMaintainerActivityAt: '2026-08-20T12:00:00.000Z',
    recentlyMergedPullRequests: 3,
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
    availableMinutes: 30,
    minimumFreshnessScore: 40,
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

test('guest preview bypasses profile lookup and filters actual tasks before the result limit', async () => {
  let preferences;
  let refreshes = 0;
  const code = candidate(20);
  code.issue.title = 'Fix JSON parser bug';
  code.issue.body = 'Edit the parser code.';
  code.issue.labels = [{ name: 'hacktoberfest' }, { name: 'good first issue' }];
  const content = candidate(21);
  content.issue.title = 'Add new Japan Fact';
  content.issue.body = 'No code required. JSON/data file edit.';
  const assigned = candidate(22);
  assigned.issue.assignees = [{ login: 'someone' }];
  const handler = createHacktoberfestMatchesHandler({
    getDeveloperContainer: () => { throw new Error('Guests must not query profiles'); },
    getStateContainer: () => ({}),
    reserveRefresh: async () => { refreshes += 1; return 0; },
    fetchCandidates: async value => { preferences = value; return [code, content, assigned]; },
    now: () => now,
  });
  for (const [task, ids] of [['any', ['20', '21']], ['code', ['20']], ['content', ['21']]]) {
    const response = await handler(new Request(`http://localhost/api/hacktoberfest-matches?mode=guest&language=typescript&task=${task}`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.developer, null);
    assert.equal(body.mode, 'guest');
    assert.deepEqual(body.matches.map(match => match.id).sort(), ids);
    assert.deepEqual(body.preferences, { languages: ['typescript'], task });
  }
  assert.equal(refreshes, 3);
  assert.deepEqual(preferences.languages, ['typescript']);
});

test('guest validation occurs before storage or quota use', async () => {
  const handler = createHacktoberfestMatchesHandler({
    getStateContainer: () => { throw new Error('Invalid requests must not access storage'); },
  });
  for (const query of ['mode=guest', 'mode=guest&language=brainfuck', 'mode=guest&language=typescript&task=anything']) {
    const response = await handler(new Request(`http://localhost/api/hacktoberfest-matches?${query}`));
    assert.equal(response.status, 400);
  }
});

test('task preference is applied before ranking limits and unknown tasks are not guessed', async () => {
  const codeCandidates = Array.from({ length: 9 }, (_, index) => {
    const item = candidate(index + 1);
    item.issue.title = 'Fix parser bug in implementation';
    item.issue.labels = [{ name: 'hacktoberfest' }, { name: 'good first issue' }];
    return item;
  });
  const content = candidate(99);
  content.repository.stargazers_count = 0;
  const unknown = candidate(100);
  unknown.issue.title = 'Discuss an alternative approach';
  unknown.issue.labels = [{ name: 'hacktoberfest' }, { name: 'good first issue' }];
  const handler = createHacktoberfestMatchesHandler({
    getStateContainer: () => ({}),
    reserveRefresh: async () => 0,
    fetchCandidates: async () => [...codeCandidates, content, unknown],
    now: () => now,
  });
  const response = await handler(new Request('http://localhost/api/hacktoberfest-matches?mode=guest&language=typescript&task=content'));
  assert.deepEqual((await response.json()).matches.map(match => match.id), ['99']);
});

test('guest previews retain the global refresh budget and upstream errors', async () => {
  const dependencies = {
    getStateContainer: () => ({}),
    reserveRefresh: async () => 17,
    fetchCandidates: async () => { throw new ContributionOpportunitiesUnavailableError(); },
  };
  const request = new Request('http://localhost/api/hacktoberfest-matches?mode=guest&language=typescript');
  const busy = await createHacktoberfestMatchesHandler(dependencies)(request);
  assert.equal(busy.status, 429);
  assert.equal(busy.headers.get('retry-after'), '17');
  const unavailable = await createHacktoberfestMatchesHandler({ ...dependencies, reserveRefresh: async () => 0 })(request);
  assert.equal(unavailable.status, 503);
});