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
  return normalizeContributionPreferences({ difficulty: 'beginner', availableMinutes: 30 }, fallbackLanguages);
}

export function buildMissionPreview(opportunity) {
  if (!opportunity) return null;
  return {
    type: missionType(opportunity),
    durationMinutes: opportunity.estimatedMinutes,
    opportunity,
  };
}