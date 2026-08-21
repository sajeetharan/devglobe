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
  return { interests, languages, difficulty, campaign };
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

export function rankContributionOpportunities(candidates, preferences, dismissedIds = [], now = new Date()) {
  const dismissed = new Set(dismissedIds.map(String));
  const languages = new Set(preferences.languages.map(language => language.toLowerCase()));
  const campaignLabel = contributionCampaignLabel(preferences.campaign);
  return candidates
    .filter(candidate => !dismissed.has(String(candidate.issue?.id)))
    .filter(candidate => isContributionReadyIssue(candidate, now))
    .filter(candidate => !campaignLabel || issueLabels(candidate.issue).includes(campaignLabel))
    .filter(candidate => includesTerm(issueLabels(candidate.issue), DIFFICULTY_TERMS[preferences.difficulty]))
    .map(candidate => {
      const labels = issueLabels(candidate.issue);
      const searchable = [candidate.issue.title.toLowerCase(), ...labels];
      const reasons = [];
      let score = 0;
      const language = String(candidate.repository.language || '').toLowerCase();
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
        reasons: reasons.slice(0, 3),
        score,
      };
    })
    .filter(opportunity => opportunity.score > 0)
    .sort((left, right) => right.score - left.score
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || left.id.localeCompare(right.id))
    .slice(0, 8)
    .map(({ score, ...opportunity }) => opportunity);
}