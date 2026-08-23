import { NextResponse } from 'next/server.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import {
  CONTRIBUTION_LANGUAGES,
  normalizeContributionPreferences,
  rankContributionOpportunities,
} from '../../../lib/contribution-opportunities.js';
import {
  ContributionOpportunitiesUnavailableError,
  fetchGitHubContributionCandidates,
} from '../../../lib/github-contribution-opportunities.js';
import {
  getContributionOpportunityStateContainer,
  reserveGlobalRecommendationRefresh,
} from '../../../lib/contribution-opportunity-store.js';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

function profileLanguages(developer) {
  const languages = (developer.languages || []).map(language => language?.name).filter(Boolean);
  return (languages.length ? languages : [developer.topLanguage].filter(Boolean))
    .map(language => String(language).toLowerCase())
    .filter(language => CONTRIBUTION_LANGUAGES.includes(language));
}

async function findDeveloper(container, login) {
  const { resources } = await container.items.query({
    query: `SELECT TOP 1 c.login, c.name, c.avatarUrl, c.topLanguage, c.languages
      FROM c
      WHERE LOWER(c.login) = @login
        AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
    parameters: [{ name: '@login', value: login.toLowerCase() }],
  }).fetchAll();
  return resources[0] || null;
}

export function createHacktoberfestMatchesHandler(dependencies = {}) {
  const getDeveloperContainer = dependencies.getDeveloperContainer || (() => getCosmosContainer());
  const getStateContainer = dependencies.getStateContainer || getContributionOpportunityStateContainer;
  const reserveRefresh = dependencies.reserveRefresh || reserveGlobalRecommendationRefresh;
  const fetchCandidates = dependencies.fetchCandidates || fetchGitHubContributionCandidates;
  const now = dependencies.now || (() => new Date());

  return async function getHacktoberfestMatches(request) {
    const login = new URL(request.url).searchParams.get('login')?.trim() || '';
    if (!LOGIN_PATTERN.test(login)) {
      return NextResponse.json({ error: 'Enter a valid GitHub username' }, { status: 400 });
    }

    try {
      const developerContainer = getDeveloperContainer();
      const stateContainer = getStateContainer();
      if (!developerContainer || !stateContainer) {
        return NextResponse.json({ error: 'Hacktoberfest matching is unavailable' }, { status: 503 });
      }

      const developer = await findDeveloper(developerContainer, login);
      if (!developer) {
        return NextResponse.json({ error: 'Developer not found on DevGlobe' }, { status: 404 });
      }

      const preferences = normalizeContributionPreferences({
        campaign: 'hacktoberfest-2026',
        difficulty: 'beginner',
        interests: [],
        languages: profileLanguages(developer),
      });
      if (preferences.languages.length === 0) {
        return NextResponse.json({ error: 'No supported languages found for this profile' }, { status: 422 });
      }

      const requestedAt = now();
      const retryAfterSeconds = await reserveRefresh(stateContainer, requestedAt);
      if (retryAfterSeconds > 0) {
        return NextResponse.json(
          { error: 'Matching is busy. Try again shortly.', retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        );
      }

      const candidates = await fetchCandidates(preferences, {
        token: process.env.GITHUB_TOKEN,
        now: requestedAt,
      });
      const matches = rankContributionOpportunities(candidates, preferences, [], requestedAt).slice(0, 3);

      return NextResponse.json({
        developer: {
          login: developer.login,
          name: developer.name || developer.login,
          avatarUrl: developer.avatarUrl || null,
          languages: preferences.languages,
        },
        matches,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (error instanceof ContributionOpportunitiesUnavailableError) {
        return NextResponse.json({ error: 'Hacktoberfest matching is temporarily unavailable' }, { status: 503 });
      }
      console.error('Public Hacktoberfest matching failed:', error.message);
      return NextResponse.json({ error: 'Unable to find Hacktoberfest matches' }, { status: 500 });
    }
  };
}

export const GET = createHacktoberfestMatchesHandler();