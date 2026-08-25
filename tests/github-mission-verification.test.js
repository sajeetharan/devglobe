import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MissionVerificationUnavailableError,
  parseMissionIssueUrl,
  verifyGitHubMissionCompletion,
} from '../lib/github-mission-verification.js';

const mission = {
  acceptedAt: '2026-08-25T08:00:00.000Z',
  opportunity: { url: 'https://github.com/devglobe/app/issues/42' },
};

function githubFetch({ author = 'octocat', mergedAt = '2026-08-25T09:00:00.000Z', timelineStatus = 200 } = {}) {
  return async url => {
    if (url.includes('/timeline')) {
      return Response.json([{
        event: 'cross-referenced',
        source: { issue: { user: { login: author }, pull_request: { url: 'https://api.github.com/repos/devglobe/app/pulls/7' } } },
      }], { status: timelineStatus });
    }
    return Response.json({
      number: 7,
      html_url: 'https://github.com/devglobe/app/pull/7',
      user: { login: author },
      merged_at: mergedAt,
    });
  };
}

test('parses only canonical public GitHub issue URLs', () => {
  assert.deepEqual(parseMissionIssueUrl(mission.opportunity.url), { owner: 'devglobe', repository: 'app', issueNumber: '42' });
  assert.equal(parseMissionIssueUrl('https://example.com/devglobe/app/issues/42'), null);
  assert.equal(parseMissionIssueUrl('https://github.com/devglobe/app/pull/7'), null);
});

test('verifies a linked pull request authored by the developer and merged after acceptance', async () => {
  const result = await verifyGitHubMissionCompletion(mission, 'OctoCat', { fetchImpl: githubFetch() });

  assert.deepEqual(result, {
    completed: true,
    evidence: {
      type: 'merged_pull_request',
      url: 'https://github.com/devglobe/app/pull/7',
      number: 7,
      mergedAt: '2026-08-25T09:00:00.000Z',
    },
  });
});

test('rejects another author and work merged before mission acceptance', async () => {
  assert.equal((await verifyGitHubMissionCompletion(mission, 'octocat', { fetchImpl: githubFetch({ author: 'someone-else' }) })).completed, false);
  assert.equal((await verifyGitHubMissionCompletion(mission, 'octocat', { fetchImpl: githubFetch({ mergedAt: '2026-08-25T07:00:00.000Z' }) })).completed, false);
  assert.equal((await verifyGitHubMissionCompletion(mission, 'octocat', { fetchImpl: githubFetch({ mergedAt: null }) })).completed, false);
  assert.equal((await verifyGitHubMissionCompletion({ ...mission, acceptedAt: 'invalid' }, 'octocat', { fetchImpl: githubFetch() })).completed, false);
});

test('reports GitHub rate limits as unavailable verification', async () => {
  await assert.rejects(
    verifyGitHubMissionCompletion(mission, 'octocat', { fetchImpl: githubFetch({ timelineStatus: 429 }) }),
    MissionVerificationUnavailableError,
  );
});

test('does not treat an issue without a linked pull request as completed', async () => {
  const result = await verifyGitHubMissionCompletion(mission, 'octocat', {
    fetchImpl: async () => Response.json([{ event: 'closed', actor: { login: 'maintainer' } }]),
  });

  assert.equal(result.completed, false);
});