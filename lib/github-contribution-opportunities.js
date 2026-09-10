import { contributionCampaignLabel } from './contribution-opportunities.js';

const GITHUB_API = 'https://api.github.com';

export class ContributionOpportunitiesUnavailableError extends Error {}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devglobe-contribution-opportunities',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function difficultyLabel(difficulty) {
  if (difficulty === 'beginner') return 'good first issue';
  if (difficulty === 'advanced') return 'advanced';
  return 'help wanted';
}

export async function fetchGitHubContributionCandidates(preferences, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const token = options.token;
  if (!token) throw new ContributionOpportunitiesUnavailableError('GitHub recommendations are not configured');
  const since = new Date((options.now || new Date()).getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const languages = preferences.languages.length ? preferences.languages.slice(0, 1) : [''];
  const campaignLabel = contributionCampaignLabel(preferences.campaign);
  let searches;
  try {
    searches = await Promise.all(languages.map(async language => {
      const query = [
        'is:issue',
        'is:open',
        'no:assignee',
        'archived:false',
        `updated:>=${since}`,
        `label:"${difficultyLabel(preferences.difficulty)}"`,
        campaignLabel ? `label:"${campaignLabel}"` : '',
        language ? `language:"${language}"` : '',
      ].filter(Boolean).join(' ');
      const response = await fetchImpl(`${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=20`, {
        headers: headers(token),
        next: { revalidate: 1800 },
      });
      if (!response.ok) throw new ContributionOpportunitiesUnavailableError('GitHub issue search is unavailable');
      const data = await response.json();
      return data.items || [];
    }));
  } catch (error) {
    if (error instanceof ContributionOpportunitiesUnavailableError) throw error;
    throw new ContributionOpportunitiesUnavailableError('GitHub issue search is unavailable');
  }
  if (searches.every(result => result == null)) {
    throw new ContributionOpportunitiesUnavailableError('GitHub issue search is unavailable');
  }

  const issues = [...new Map(searches.flatMap(result => result || []).map(issue => [String(issue.id), issue])).values()];
  const repositoryNames = [...new Set(issues.map(issue => issue.repository_url?.split('/repos/')[1]).filter(Boolean))].slice(0, 3);
  let repositoryEntries;
  try {
    repositoryEntries = await Promise.all(repositoryNames.map(async name => {
      const [repositoryResponse, communityResponse] = await Promise.all([
        fetchImpl(`${GITHUB_API}/repos/${name}`, { headers: headers(token), next: { revalidate: 3600 } }),
        fetchImpl(`${GITHUB_API}/repos/${name}/community/profile`, { headers: headers(token), next: { revalidate: 3600 } }),
      ]);
      if (!repositoryResponse.ok || !communityResponse.ok) {
        throw new ContributionOpportunitiesUnavailableError('GitHub repository verification is unavailable');
      }
      const [repository, community] = await Promise.all([repositoryResponse.json(), communityResponse.json()]);
      const pullsResponse = await fetchImpl(`${GITHUB_API}/repos/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=20`, {
        headers: headers(token),
        next: { revalidate: 3600 },
      });
      if (!pullsResponse.ok) throw new ContributionOpportunitiesUnavailableError('GitHub repository responsiveness is unavailable');
      const pulls = await pullsResponse.json();
      const recentCutoff = (options.now || new Date()).getTime() - 90 * 24 * 60 * 60 * 1000;
      const recentMergedPullRequests = pulls.filter(pull => Date.parse(pull.merged_at) >= recentCutoff);
      const lastMaintainerActivityAt = pulls
        .map(pull => pull.merged_at)
        .filter(Boolean)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
      return [name, {
        repository,
        hasContributionGuide: Boolean(community.files?.contributing),
        recentMergedPullRequests,
        lastMaintainerActivityAt,
      }];
    }));
  } catch (error) {
    if (error instanceof ContributionOpportunitiesUnavailableError) throw error;
    throw new ContributionOpportunitiesUnavailableError('GitHub repository verification is unavailable');
  }
  const repositories = new Map(repositoryEntries);

  return issues.map(issue => {
    const name = issue.repository_url?.split('/repos/')[1];
    const details = repositories.get(name);
    if (!details) return null;
    const issueLabels = new Set((issue.labels || []).map(label => String(label?.name || label).toLowerCase()));
    const recentlyMergedPullRequests = details.recentMergedPullRequests.filter(pull =>
      (pull.labels || []).some(label => issueLabels.has(String(label?.name || label).toLowerCase()))).length;
    return {
      issue,
      repository: details.repository,
      hasContributionGuide: details.hasContributionGuide,
      lastMaintainerActivityAt: details.lastMaintainerActivityAt,
      recentlyMergedPullRequests,
    };
  }).filter(Boolean);
}