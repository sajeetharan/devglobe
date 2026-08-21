import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import { isAllowedMutationOrigin } from '../../../lib/request-origin.js';
import {
  CONTRIBUTION_CAMPAIGNS,
  CONTRIBUTION_DIFFICULTIES,
  CONTRIBUTION_INTERESTS,
  CONTRIBUTION_LANGUAGES,
  ContributionPreferenceError,
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

const CACHE_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_FETCHES_PER_WINDOW = 2;

class RecommendationRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('Recommendation refresh limit reached');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function options() {
  return {
    campaigns: CONTRIBUTION_CAMPAIGNS,
    interests: CONTRIBUTION_INTERESTS,
    difficulties: CONTRIBUTION_DIFFICULTIES,
    languages: CONTRIBUTION_LANGUAGES,
  };
}

function mutationError(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }
  if (!isAllowedMutationOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin mutation denied' }, { status: 403 });
  }
  return null;
}

async function getOwner(container, login) {
  const { resources } = await container.items.query({
    query: 'SELECT TOP 1 * FROM c WHERE LOWER(c.login) = @login AND c.claimed = true',
    parameters: [{ name: '@login', value: login.toLowerCase() }],
  }).fetchAll();
  return resources[0] || null;
}

async function loadOwner() {
  const session = await getSession();
  if (!session?.login) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const container = getCosmosContainer();
  const stateContainer = getContributionOpportunityStateContainer();
  if (!container || !stateContainer) return { error: NextResponse.json({ error: 'Contribution opportunities are unavailable' }, { status: 503 }) };
  const developer = await getOwner(container, session.login);
  if (!developer) return { error: NextResponse.json({ error: 'Claim your profile first' }, { status: 403 }) };
  return { container, stateContainer, developer };
}

function fallbackLanguages(developer) {
  const languages = (developer.languages || []).map(language => language?.name).filter(Boolean);
  return languages.length ? languages : [developer.topLanguage].filter(Boolean);
}

function settings(developer) {
  return normalizeContributionPreferences(developer.contributionOpportunity?.preferences || {}, fallbackLanguages(developer));
}

async function patchSettings(container, developer, update) {
  let current = developer;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const contributionOpportunity = update(current.contributionOpportunity || {});
    try {
      await container.item(current.id, current.location).patch([
        { op: 'set', path: '/contributionOpportunity', value: contributionOpportunity },
      ], { accessCondition: { type: 'IfMatch', condition: current._etag } });
      return contributionOpportunity;
    } catch (error) {
      if (attempt > 0 || (error.code !== 412 && error.statusCode !== 412)) throw error;
      current = await getOwner(container, current.login);
      if (!current) throw error;
    }
  }
}

export async function GET() {
  try {
    const owner = await loadOwner();
    if (owner.error) return owner.error;
    const preferences = settings(owner.developer);
    const state = owner.developer.contributionOpportunity || {};
    const cacheKey = JSON.stringify(preferences);
    const now = new Date();
    const dismissed = state.dismissedIssueIds || [];
    if (state.cache?.key === cacheKey && Date.parse(state.cache.expiresAt) > now.getTime()) {
      return NextResponse.json({
        preferences,
        options: options(),
        opportunities: state.cache.opportunities.filter(item => !dismissed.includes(item.id)),
        unavailable: false,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    try {
      await patchSettings(owner.container, owner.developer, current => {
        const recentFetches = (current.recommendationFetches || []).filter(timestamp => Date.parse(timestamp) > now.getTime() - RATE_WINDOW_MS);
        if (recentFetches.length >= MAX_FETCHES_PER_WINDOW) {
          const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(recentFetches[0]) + RATE_WINDOW_MS - now.getTime()) / 1000));
          throw new RecommendationRateLimitError(retryAfterSeconds);
        }
        return { ...current, recommendationFetches: [...recentFetches, now.toISOString()] };
      });
    } catch (error) {
      if (!(error instanceof RecommendationRateLimitError)) throw error;
      return NextResponse.json({
        preferences,
        options: options(),
        opportunities: [],
        unavailable: true,
        retryAfterSeconds: error.retryAfterSeconds,
      }, { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(error.retryAfterSeconds) } });
    }
    const globalRetryAfter = await reserveGlobalRecommendationRefresh(owner.stateContainer, now);
    if (globalRetryAfter > 0) {
      return NextResponse.json({
        preferences,
        options: options(),
        opportunities: [],
        unavailable: true,
        retryAfterSeconds: globalRetryAfter,
      }, { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(globalRetryAfter) } });
    }
    let candidates;
    try {
      candidates = await fetchGitHubContributionCandidates(preferences, { token: process.env.GITHUB_TOKEN });
    } catch (error) {
      if (error instanceof ContributionOpportunitiesUnavailableError) {
        return NextResponse.json({
          preferences,
          options: options(),
          opportunities: [],
          unavailable: true,
        }, { headers: { 'Cache-Control': 'private, no-store' } });
      }
      throw error;
    }
    const opportunities = rankContributionOpportunities(candidates, preferences, dismissed, now);
    await patchSettings(owner.container, owner.developer, current => ({
      ...current,
      cache: {
        key: cacheKey,
        expiresAt: new Date(now.getTime() + CACHE_MS).toISOString(),
        opportunities,
      },
    }));
    return NextResponse.json({
      preferences,
      options: options(),
      opportunities,
      unavailable: false,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Contribution opportunities read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load contribution opportunities' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const invalidMutation = mutationError(request);
    if (invalidMutation) return invalidMutation;
    const owner = await loadOwner();
    if (owner.error) return owner.error;
    const body = await request.json();
    const preferences = normalizeContributionPreferences(body.preferences, fallbackLanguages(owner.developer));
    await patchSettings(owner.container, owner.developer, current => ({
      ...current,
      preferences,
      updatedAt: new Date().toISOString(),
    }));
    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof ContributionPreferenceError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message || 'Invalid preferences' }, { status: 400 });
    }
    console.error('Contribution preferences update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update contribution preferences' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const invalidMutation = mutationError(request);
    if (invalidMutation) return invalidMutation;
    const owner = await loadOwner();
    if (owner.error) return owner.error;
    const body = await request.json();
    const issueId = String(body.issueId || '');
    if (!/^\d+$/.test(issueId)) return NextResponse.json({ error: 'Invalid issue ID' }, { status: 400 });
    await patchSettings(owner.container, owner.developer, current => ({
      ...current,
      dismissedIssueIds: [
        issueId,
        ...(current.dismissedIssueIds || []).filter(id => String(id) !== issueId),
      ].slice(0, 100),
      ...(current.cache ? { cache: { ...current.cache, opportunities: current.cache.opportunities.filter(item => item.id !== issueId) } } : {}),
      updatedAt: new Date().toISOString(),
    }));
    return NextResponse.json({ dismissed: true });
  } catch (error) {
    console.error('Contribution opportunity dismissal failed:', error.message);
    return NextResponse.json({ error: 'Unable to dismiss contribution opportunity' }, { status: 500 });
  }
}