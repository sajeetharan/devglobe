export const CONTRIBUTION_INTERESTS = [
  'accessibility',
  'bug-fixes',
  'developer-tooling',
  'documentation',
  'features',
  'testing',
];
export const CONTRIBUTION_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const CONTRIBUTION_CAMPAIGNS = ['all', 'hacktoberfest-2026'];
export const CONTRIBUTION_TIME_BUDGETS = [15, 30, 60];
export const CONTRIBUTION_FRESHNESS_THRESHOLDS = [0, 40, 60, 80];
export const CONTRIBUTION_LANGUAGES = [
  'c', 'c#', 'c++', 'css', 'go', 'html', 'java', 'javascript', 'kotlin',
  'php', 'python', 'ruby', 'rust', 'swift', 'typescript',
];
const STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;
const SPAM_PATTERN = /\b(airdrop|casino|crypto promotion|paid task|token giveaway)\b/i;
const INTEREST_TERMS = {
  accessibility: ['accessibility', 'a11y', 'wcag'],
  'bug-fixes': ['bug', 'fix', 'defect'],
  'developer-tooling': ['tooling', 'developer experience', 'dx', 'cli'],
  documentation: ['documentation', 'docs'],
  features: ['enhancement', 'feature'],
  testing: ['test', 'testing', 'coverage'],
};
const DIFFICULTY_TERMS = {
  beginner: ['good first issue', 'beginner', 'easy', 'first-timers-only'],
  intermediate: ['help wanted', 'intermediate'],
  advanced: ['advanced', 'challenging', 'expert'],
};
const CAMPAIGN_LABELS = {
  'hacktoberfest-2026': 'hacktoberfest',
};

export class ContributionPreferenceError extends Error {}

function normalizedList(value, allowed, field, limit = 6) {
  if (!Array.isArray(value)) throw new ContributionPreferenceError(`${field} must be an array`);
  const values = [...new Set(value.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))].slice(0, limit);
  if (allowed && values.some(item => !allowed.includes(item))) throw new ContributionPreferenceError(`Invalid ${field}`);
  return values;
}

export function normalizeContributionPreferences(input, fallbackLanguages = []) {
  const interests = normalizedList(input?.interests || [], CONTRIBUTION_INTERESTS, 'interests');
  const hasExplicitLanguages = Boolean(input?.languages?.length);
  const languages = normalizedList(hasExplicitLanguages ? input.languages : fallbackLanguages, null, 'languages', 5)
    .filter(language => {
      if (CONTRIBUTION_LANGUAGES.includes(language)) return true;
      if (hasExplicitLanguages) throw new ContributionPreferenceError('Invalid languages');
      return false;
    });
  const difficulty = String(input?.difficulty || 'beginner').toLowerCase();
  if (!CONTRIBUTION_DIFFICULTIES.includes(difficulty)) throw new ContributionPreferenceError('Invalid difficulty');
  const campaign = String(input?.campaign || 'all').toLowerCase();
  if (!CONTRIBUTION_CAMPAIGNS.includes(campaign)) throw new ContributionPreferenceError('Invalid campaign');
  const availableMinutes = Number(input?.availableMinutes ?? 30);
  if (!CONTRIBUTION_TIME_BUDGETS.includes(availableMinutes)) throw new ContributionPreferenceError('Invalid available time');
  const minimumFreshnessScore = Number(input?.minimumFreshnessScore ?? 40);
  if (!CONTRIBUTION_FRESHNESS_THRESHOLDS.includes(minimumFreshnessScore)) {
    throw new ContributionPreferenceError('Invalid freshness threshold');
  }
  return { interests, languages, difficulty, campaign, availableMinutes, minimumFreshnessScore };
}

export function contributionCampaignLabel(campaign) {
  return CAMPAIGN_LABELS[campaign] || null;
}

function issueLabels(issue) {
  return (issue.labels || []).map(label => String(label?.name || label).trim().toLowerCase()).filter(Boolean);
}

function includesTerm(values, terms) {
  return terms.some(term => values.some(value => value.includes(term)));
}

export function estimateContributionMinutes(issue) {
  const searchable = [issue?.title, ...issueLabels(issue)].map(value => String(value || '').toLowerCase());
  if (includesTerm(searchable, ['documentation', 'docs', 'readme', 'typo', 'reproduce', 'reproduction'])) return 15;
  if (includesTerm(searchable, ['feature', 'enhancement'])) return 60;
  return 30;
}

export function isContributionReadyIssue(candidate, now = new Date()) {
  const { issue, repository, hasContributionGuide } = candidate;
  if (!issue || !repository || !hasContributionGuide) return false;
  if (issue.state !== 'open' || issue.pull_request || issue.locked) return false;
  if (issue.assignee || (issue.assignees?.length || 0) > 0) return false;
  if (repository.private || repository.archived || repository.disabled || repository.has_issues === false) return false;
  const updatedAt = Date.parse(issue.updated_at);
  if (!Number.isFinite(updatedAt) || now.getTime() - updatedAt > STALE_AFTER_MS) return false;
  if (!issue.title || issue.title.trim().length < 10 || SPAM_PATTERN.test(issue.title)) return false;
  return true;
}

function ageInDays(value, now) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now.getTime() - timestamp) / (24 * 60 * 60 * 1000))) : null;
}

export function contributionFreshness(candidate, now = new Date()) {
  const issueAgeDays = ageInDays(candidate.issue?.created_at, now);
  const maintainerActivityDays = ageInDays(candidate.lastMaintainerActivityAt, now);
  const recentlyMergedPullRequests = Math.max(0, Number(candidate.recentlyMergedPullRequests) || 0);
  let score = 0;
  if (maintainerActivityDays !== null) score += maintainerActivityDays <= 14 ? 45 : maintainerActivityDays <= 30 ? 35 : maintainerActivityDays <= 90 ? 20 : 5;
  if (issueAgeDays !== null) score += issueAgeDays <= 30 ? 30 : issueAgeDays <= 90 ? 20 : issueAgeDays <= 180 ? 10 : 0;
  score += recentlyMergedPullRequests >= 3 ? 25 : recentlyMergedPullRequests > 0 ? 15 : 0;
  return {
    score,
    level: score >= 80 ? 'high' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'low',
    issueAgeDays,
    maintainerActivityDays,
    recentlyMergedPullRequests,
  };
}

export function rankContributionOpportunities(candidates, preferences, dismissedIds = [], now = new Date()) {
  const dismissed = new Set(dismissedIds.map(String));
  const languages = new Set(preferences.languages.map(language => language.toLowerCase()));
  const campaignLabel = contributionCampaignLabel(preferences.campaign);
  const availableMinutes = preferences.availableMinutes ?? 30;
  const minimumFreshnessScore = preferences.minimumFreshnessScore ?? 40;
  return candidates
    .filter(candidate => !dismissed.has(String(candidate.issue?.id)))
    .filter(candidate => isContributionReadyIssue(candidate, now))
    .filter(candidate => !campaignLabel || issueLabels(candidate.issue).includes(campaignLabel))
    .filter(candidate => includesTerm(issueLabels(candidate.issue), DIFFICULTY_TERMS[preferences.difficulty]))
    .filter(candidate => estimateContributionMinutes(candidate.issue) <= availableMinutes)
    .map(candidate => {
      const labels = issueLabels(candidate.issue);
      const searchable = [candidate.issue.title.toLowerCase(), ...labels];
      const reasons = [];
      let score = 0;
      const language = String(candidate.repository.language || '').toLowerCase();
      const freshness = contributionFreshness(candidate, now);
      if (language && languages.has(language)) {
        score += 4;
        reasons.push(`Uses ${candidate.repository.language}`);
      }
      for (const interest of preferences.interests) {
        if (includesTerm(searchable, INTEREST_TERMS[interest])) {
          score += 2;
          reasons.push(`Matches ${interest.replaceAll('-', ' ')}`);
        }
      }
      if (includesTerm(labels, DIFFICULTY_TERMS[preferences.difficulty])) {
        score += 3;
        reasons.push(`${preferences.difficulty} friendly`);
      }
      if ((candidate.repository.stargazers_count || 0) >= 10) score += 1;
      return {
        id: String(candidate.issue.id),
        title: candidate.issue.title,
        url: candidate.issue.html_url,
        repository: candidate.repository.full_name,
        language: candidate.repository.language || null,
        labels: labels.slice(0, 5),
        updatedAt: candidate.issue.updated_at,
        estimatedMinutes: estimateContributionMinutes(candidate.issue),
        reasons: reasons.slice(0, 3),
        freshness,
        score,
      };
    })
    .filter(opportunity => opportunity.score > 0 && opportunity.freshness.score >= minimumFreshnessScore)
    .sort((left, right) => right.score - left.score
      || right.freshness.score - left.freshness.score
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || left.id.localeCompare(right.id))
    .slice(0, 8)
    .map(({ score, ...opportunity }) => opportunity);
}