const GITHUB_API = 'https://api.github.com';
const ISSUE_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/i;

export class MissionVerificationUnavailableError extends Error {}

export function parseMissionIssueUrl(value) {
  const match = String(value || '').match(ISSUE_URL_PATTERN);
  if (!match) return null;
  return { owner: match[1], repository: match[2], issueNumber: match[3] };
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devglobe-daily-mission',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readGitHubJson(response) {
  if (response.status === 403 || response.status === 429) {
    throw new MissionVerificationUnavailableError('GitHub verification is rate limited');
  }
  if (!response.ok) throw new MissionVerificationUnavailableError('GitHub verification is unavailable');
  return response.json();
}

export async function findFirstMaintainerReply(mission, login, options = {}) {
  const issue = parseMissionIssueUrl(mission?.opportunity?.url);
  const acceptedAt = Date.parse(mission?.acceptedAt);
  const normalizedLogin = String(login || '').toLowerCase();
  if (!issue || !Number.isFinite(acceptedAt) || !normalizedLogin) return null;
  const fetchImpl = options.fetchImpl || fetch;
  let url = `${GITHUB_API}/repos/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repository)}/issues/${issue.issueNumber}/comments?per_page=100`;
  const comments = [];
  while (url) {
    const response = await fetchImpl(url, { headers: githubHeaders(options.token), cache: 'no-store' });
    comments.push(...await readGitHubJson(response));
    const nextLink = response.headers.get('link')?.split(',')
      .map(link => link.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/))
      .find(match => match?.[2] === 'next');
    url = nextLink?.[1] || null;
  }
  const participantComment = comments
    .filter(comment => comment.user?.login?.toLowerCase() === normalizedLogin)
    .filter(comment => Date.parse(comment.created_at) >= acceptedAt)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))[0];
  if (!participantComment) return null;
  const participantActivityAt = Date.parse(participantComment.created_at);
  const reply = comments
    .filter(comment => ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(comment.author_association))
    .filter(comment => comment.user?.login?.toLowerCase() !== normalizedLogin)
    .filter(comment => Date.parse(comment.created_at) >= participantActivityAt)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))[0];
  if (!reply) return null;
  return {
    url: reply.html_url,
    repliedAt: reply.created_at,
    responseMinutes: Math.max(0, Math.round((Date.parse(reply.created_at) - acceptedAt) / 60000)),
  };
}

export async function verifyGitHubMissionCompletion(mission, login, options = {}) {
  const issue = parseMissionIssueUrl(mission?.opportunity?.url);
  const acceptedAt = Date.parse(mission?.acceptedAt);
  if (!issue || !Number.isFinite(acceptedAt)) return { completed: false, reason: 'Mission has no verifiable accepted issue' };
  const fetchImpl = options.fetchImpl || fetch;
  const headers = githubHeaders(options.token);
  const timelineUrl = `${GITHUB_API}/repos/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repository)}/issues/${issue.issueNumber}/timeline?per_page=100`;
  const timeline = await readGitHubJson(await fetchImpl(timelineUrl, { headers, cache: 'no-store' }));
  const normalizedLogin = String(login || '').toLowerCase();
  const pullRequestUrls = [...new Set(timeline
    .filter(event => event.event === 'cross-referenced')
    .map(event => event.source?.issue)
    .filter(source => source?.pull_request?.url && source.user?.login?.toLowerCase() === normalizedLogin)
    .map(source => source.pull_request.url))];

  for (const pullRequestUrl of pullRequestUrls) {
    const pullRequest = await readGitHubJson(await fetchImpl(pullRequestUrl, { headers, cache: 'no-store' }));
    const mergedAt = Date.parse(pullRequest.merged_at);
    if (pullRequest.user?.login?.toLowerCase() !== normalizedLogin || !Number.isFinite(mergedAt)) continue;
    if (mergedAt < acceptedAt) continue;
    return {
      completed: true,
      evidence: {
        type: 'merged_pull_request',
        url: pullRequest.html_url,
        number: pullRequest.number,
        mergedAt: pullRequest.merged_at,
      },
    };
  }
  return { completed: false, reason: 'No linked pull request by you has been merged since accepting this mission' };
}