import { parseMissionIssueUrl } from './github-issue-url.js';

const GITHUB_API = 'https://api.github.com';
export { parseMissionIssueUrl };

export class MissionVerificationUnavailableError extends Error {}

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
  const result = await verifyGitHubMissionProgress(mission, login, options);
  if (result.completed) return { completed: true, evidence: result.evidence };
  return { completed: false, reason: result.reason || 'No linked pull request by you has been merged since accepting this mission' };
}

export async function verifyGitHubMissionProgress(mission, login, options = {}) {
  const issue = parseMissionIssueUrl(mission?.opportunity?.url);
  const acceptedAt = Date.parse(mission?.acceptedAt);
  if (!issue || !Number.isFinite(acceptedAt)) return { completed: false, reason: 'Mission has no verifiable accepted issue' };
  const fetchImpl = options.fetchImpl || fetch;
  const headers = githubHeaders(options.token);
  const timelineUrl = `${GITHUB_API}/repos/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repository)}/issues/${issue.issueNumber}/timeline?per_page=100`;
  const timelineLocation = new URL(timelineUrl);
  const timeline = [];
  let nextUrl = timelineUrl;
  for (let page = 0; nextUrl && page < 10; page += 1) {
    const response = await fetchImpl(nextUrl, { headers, cache: 'no-store' });
    timeline.push(...await readGitHubJson(response));
    const nextLink = response.headers.get('link')?.split(',')
      .map(link => link.trim().match(/^<([^>]+)>;\s*rel="next"$/))
      .find(Boolean);
    nextUrl = nextLink?.[1] || null;
    if (nextUrl) {
      let next;
      try { next = new URL(nextUrl); }
      catch { throw new MissionVerificationUnavailableError('Unexpected GitHub timeline pagination'); }
      if (next.origin !== timelineLocation.origin || next.pathname !== timelineLocation.pathname
        || next.username || next.password || next.hash
        || next.searchParams.get('per_page') !== '100'
        || next.searchParams.get('page') !== String(page + 2)
        || [...next.searchParams.keys()].length !== 2) {
        throw new MissionVerificationUnavailableError('Unexpected GitHub timeline pagination');
      }
    }
  }
  if (nextUrl) throw new MissionVerificationUnavailableError('GitHub timeline is too large to verify now');
  const normalizedLogin = String(login || '').toLowerCase();
  const pullRequestUrls = [...new Set(timeline
    .filter(event => event.event === 'cross-referenced')
    .map(event => event.source?.issue)
    .filter(source => source?.pull_request?.url && source.user?.login?.toLowerCase() === normalizedLogin)
    .map(source => source.pull_request.url)
    .filter(url => /^https:\/\/api\.github\.com\/repos\/[a-z\d-]+\/[a-z\d._-]+\/pulls\/\d+$/i.test(url)))];

  let submittedEvidence = null;
  let closedEvidence = null;
  for (const pullRequestUrl of pullRequestUrls) {
    const pullRequest = await readGitHubJson(await fetchImpl(pullRequestUrl, { headers, cache: 'no-store' }));
    const mergedAt = Date.parse(pullRequest.merged_at);
    if (pullRequest.user?.login?.toLowerCase() !== normalizedLogin || pullRequest.base?.repo?.private === true) continue;
    const urlMatch = pullRequestUrl.match(/\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/);
    const publicUrl = `https://github.com/${urlMatch[1]}/${urlMatch[2]}/pull/${urlMatch[3]}`;
    if (Number.isFinite(mergedAt) && mergedAt >= acceptedAt) return {
      completed: true,
      evidence: {
        type: 'merged_pull_request',
        url: publicUrl,
        number: pullRequest.number,
        mergedAt: pullRequest.merged_at,
      },
    };
    const createdAt = Date.parse(pullRequest.created_at);
    if (Number.isFinite(createdAt) && createdAt >= acceptedAt && !pullRequest.draft && pullRequest.state === 'open') {
      submittedEvidence = {
        type: 'submitted_pull_request', url: publicUrl, number: pullRequest.number,
        submittedAt: pullRequest.created_at,
      };
    }
    if (Number.isFinite(createdAt) && createdAt >= acceptedAt && pullRequest.state === 'closed' && !Number.isFinite(mergedAt)) {
      closedEvidence = {
        type: 'closed_pull_request', url: publicUrl, number: pullRequest.number,
        submittedAt: pullRequest.created_at,
      };
    }
  }
  return {
    completed: false, submitted: Boolean(submittedEvidence), closed: Boolean(!submittedEvidence && closedEvidence),
    evidence: submittedEvidence || closedEvidence,
    reason: 'No linked pull request by you has been merged since accepting this mission',
  };
}