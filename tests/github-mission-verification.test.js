import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MissionVerificationUnavailableError,
  findFirstMaintainerReply,
  parseMissionIssueUrl,
  verifyGitHubMissionCompletion,
  verifyGitHubMissionProgress,
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

test('verifies open submitted PRs without recording them as completed', async () => {
  const result = await verifyGitHubMissionProgress(mission, 'octocat', {
    fetchImpl: async url => url.includes('/timeline') ? githubFetch()(url)
      : Response.json({ number: 7, user: { login: 'octocat' }, created_at: '2026-08-25T08:30:00Z', state: 'open', draft: false, merged_at: null }),
  });
  assert.equal(result.completed, false);
  assert.equal(result.submitted, true);
  assert.equal(result.evidence.type, 'submitted_pull_request');
});

test('rejects drafts, old submissions, wrong authors, and private PRs for submission progress', async () => {
  for (const override of [
    { draft: true }, { created_at: '2026-08-24T08:00:00Z' },
    { user: { login: 'someone-else' } }, { base: { repo: { private: true } } }, { state: 'closed' },
  ]) {
    const result = await verifyGitHubMissionProgress(mission, 'octocat', {
      fetchImpl: async url => url.includes('/timeline') ? githubFetch()(url)
        : Response.json({ user: { login: 'octocat' }, created_at: '2026-08-25T08:30:00Z', state: 'open', merged_at: null, ...override }),
    });
    assert.equal(result.submitted, false);
    assert.equal(result.completed, false);
  }
});

test('follows timeline pagination while refusing external evidence requests', async () => {
  const requested = [];
  const result = await verifyGitHubMissionProgress(mission, 'octocat', {
    fetchImpl: async url => {
      requested.push(url);
      if (url.includes('page=2')) return githubFetch()(url);
      if (url.includes('/timeline')) return new Response('[]', { headers: { Link: '<https://api.github.com/repos/devglobe/app/issues/42/timeline?page=2&per_page=100>; rel="next"' } });
      return githubFetch()(url);
    },
  });
  assert.equal(result.completed, true);
  assert.equal(requested.length, 3);
  const external = await verifyGitHubMissionProgress(mission, 'octocat', {
    fetchImpl: async () => Response.json([{ event: 'cross-referenced', source: { issue: { user: { login: 'octocat' }, pull_request: { url: 'https://evil.test/pr' } } } }]),
  });
  assert.equal(external.completed, false);
  await assert.rejects(verifyGitHubMissionProgress(mission, 'octocat', {
    fetchImpl: async () => new Response('[]', { headers: { Link: '<https://evil.test/timeline?page=2&per_page=100>; rel="next"' } }),
  }), MissionVerificationUnavailableError);
});

test('parses only canonical public GitHub issue URLs', () => {
  assert.deepEqual(parseMissionIssueUrl(mission.opportunity.url), { owner: 'devglobe', repository: 'app', issueNumber: '42' });
  assert.equal(parseMissionIssueUrl('https://example.com/devglobe/app/issues/42'), null);
  assert.equal(parseMissionIssueUrl('https://github.com/devglobe/app/pull/7'), null);
});

test('closed unmerged linked PRs show review outcome without completion credit', async () => {
  const result = await verifyGitHubMissionProgress(mission, 'octocat', {
    fetchImpl: async url => url.includes('/timeline') ? githubFetch()(url)
      : Response.json({ number: 7, user: { login: 'octocat' }, created_at: '2026-08-25T08:30:00Z', state: 'closed', merged_at: null }),
  });
  assert.equal(result.completed, false);
  assert.equal(result.submitted, false);
  assert.equal(result.closed, true);
  assert.equal(result.evidence.type, 'closed_pull_request');
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

test('measures the first maintainer reply after mission acceptance', async () => {
  const result = await findFirstMaintainerReply(mission, 'octocat', {
    fetchImpl: async () => Response.json([
      { user: { login: 'octocat' }, author_association: 'NONE', created_at: '2026-08-25T08:05:00.000Z', html_url: 'contributor-comment' },
      { user: { login: 'maintainer' }, author_association: 'MEMBER', created_at: '2026-08-25T08:42:00.000Z', html_url: 'maintainer-comment' },
      { user: { login: 'owner' }, author_association: 'OWNER', created_at: '2026-08-25T09:00:00.000Z', html_url: 'owner-comment' },
    ]),
  });

  assert.deepEqual(result, {
    url: 'maintainer-comment',
    repliedAt: '2026-08-25T08:42:00.000Z',
    responseMinutes: 42,
  });
});

test('ignores maintainer comments posted before the mission started', async () => {
  const result = await findFirstMaintainerReply(mission, 'octocat', {
    fetchImpl: async () => Response.json([
      { user: { login: 'octocat' }, author_association: 'NONE', created_at: '2026-08-25T08:05:00.000Z' },
      { user: { login: 'owner' }, author_association: 'OWNER', created_at: '2026-08-25T07:59:00.000Z', html_url: 'old-comment' },
    ]),
  });

  assert.equal(result, null);
});

test('follows comment pagination to find a later maintainer reply', async () => {
  const result = await findFirstMaintainerReply(mission, 'octocat', {
    fetchImpl: async url => url.includes('page=2')
      ? Response.json([{ user: { login: 'maintainer' }, author_association: 'COLLABORATOR', created_at: '2026-08-25T08:20:00.000Z', html_url: 'page-two-comment' }])
      : new Response(JSON.stringify([{ user: { login: 'octocat' }, author_association: 'NONE', created_at: '2026-08-25T08:10:00.000Z' }]), {
        headers: { Link: '<https://api.github.com/comments?page=2>; rel="next"' },
      }),
  });

  assert.equal(result.url, 'page-two-comment');
  assert.equal(result.responseMinutes, 20);
});

test('does not attribute unrelated maintainer discussion as a participant reply', async () => {
  const result = await findFirstMaintainerReply(mission, 'octocat', {
    fetchImpl: async () => Response.json([
      { user: { login: 'maintainer' }, author_association: 'OWNER', created_at: '2026-08-25T08:20:00.000Z' },
    ]),
  });

  assert.equal(result, null);
});