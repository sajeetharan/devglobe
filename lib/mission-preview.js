import { normalizeContributionPreferences } from './contribution-opportunities.js';
import { missionType } from './daily-mission.js';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export class MissionPreviewError extends Error {}

export function normalizePreviewLogin(value) {
  const login = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!LOGIN_PATTERN.test(login)) throw new MissionPreviewError('Enter a valid GitHub username');
  return login;
}

export function previewPreferences(profile) {
  const profileLanguages = (profile?.languages || []).map(language => language?.name).filter(Boolean);
  const fallbackLanguages = profileLanguages.length ? profileLanguages : [profile?.topLanguage].filter(Boolean);
  return normalizeContributionPreferences({ difficulty: 'beginner', availableMinutes: 30, minimumFreshnessScore: 40 }, fallbackLanguages);
}

function missionMatchEvidence(opportunity, profile) {
  const evidence = [];
  const profileLanguages = new Set([
    profile?.topLanguage,
    ...(profile?.languages || []).map(language => language?.name),
  ].filter(Boolean).map(language => language.toLowerCase()));

  if (opportunity.language && profileLanguages.has(opportunity.language.toLowerCase())) {
    evidence.push({ label: 'Language', value: `${opportunity.language} in your public profile` });
  }

  const contributionCount = Number(profile?.totalCommits);
  if (Number.isFinite(contributionCount) && contributionCount > 0) {
    evidence.push({
      label: 'Recent contributions',
      value: `${contributionCount.toLocaleString('en-US')} in the latest public snapshot`,
    });
  }

  const difficultyLabel = (opportunity.labels || []).find(label => [
    'good first issue', 'first-timers-only', 'beginner', 'easy',
    'help wanted', 'intermediate', 'advanced', 'challenging', 'expert',
  ].includes(label.toLowerCase()));
  if (difficultyLabel) {
    evidence.push({ label: 'Issue difficulty', value: difficultyLabel });
  }

  return evidence;
}

export function buildMissionPreview(opportunity, profile = {}) {
  if (!opportunity) return null;
  return {
    type: missionType(opportunity),
    durationMinutes: opportunity.estimatedMinutes,
    opportunity,
    matchEvidence: missionMatchEvidence(opportunity, profile),
  };
}