import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import { rankContributionOpportunities } from '../../../lib/contribution-opportunities.js';
import {
  getContributionOpportunityStateContainer,
  reserveGlobalRecommendationRefresh,
  reserveMissionPreview,
} from '../../../lib/contribution-opportunity-store.js';
import {
  ContributionOpportunitiesUnavailableError,
  fetchGitHubContributionCandidates,
} from '../../../lib/github-contribution-opportunities.js';
import { MissionPreviewError, buildMissionPreview, normalizePreviewLogin, previewPreferences } from '../../../lib/mission-preview.js';
import { verifyMcpPreviewIdentity } from '../../../lib/mcp-preview-identity.js';
import { isAllowedMutationOrigin } from '../../../lib/request-origin.js';

const CACHE_MS = 15 * 60 * 1000;

function retryResponse(retryAfterSeconds) {
  return NextResponse.json(
    { error: 'Mission preview is busy. Try again shortly.', retryAfterSeconds },
    { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(retryAfterSeconds) } },
  );
}

function clientHash(request) {
  const identifier = verifyMcpPreviewIdentity(request.headers.get('x-devglobe-mcp-preview-identity'))
    || request.headers.get('x-azure-clientip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const secret = process.env.ENGAGEMENT_HASH_SECRET || process.env.SESSION_SECRET || 'development-preview-secret';
  return createHmac('sha256', secret).update(`mission-preview:${identifier}`).digest('base64url');
}

async function getPublicProfile(container, login) {
  const { resources } = await container.items.query({
    query: `SELECT TOP 1 c.login, c.name, c.avatarUrl, c.topLanguage, c.languages
      FROM c
      WHERE LOWER(c.login) = @login
        AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
    parameters: [{ name: '@login', value: login }],
  }).fetchAll();
  return resources[0] || null;
}

function poolId(preferences) {
  const key = createHash('sha256').update(JSON.stringify(preferences)).digest('base64url').slice(0, 24);
  return `mission-preview-pool:${key}`;
}

async function readCachedPool(container, id, now) {
  try {
    const { resource } = await container.item(id, id).read();
    return Date.parse(resource?.expiresAt) > now.getTime() && Array.isArray(resource?.opportunities)
      ? resource.opportunities
      : null;
  } catch (error) {
    if (error.code === 404 || error.statusCode === 404) return null;
    throw error;
  }
}

async function writeCachedPool(container, id, opportunities, now) {
  await container.items.upsert({
    id,
    documentType: 'mission-preview-pool',
    expiresAt: new Date(now.getTime() + CACHE_MS).toISOString(),
    opportunities,
    ttl: Math.ceil(CACHE_MS / 1000) * 2,
  });
}

export function createMissionPreviewHandler(dependencies = {}) {
  const getDeveloperContainer = dependencies.getDeveloperContainer || (() => getCosmosContainer());
  const getStateContainer = dependencies.getStateContainer || getContributionOpportunityStateContainer;
  const reservePreview = dependencies.reservePreview || reserveMissionPreview;
  const reserveRefresh = dependencies.reserveRefresh || reserveGlobalRecommendationRefresh;
  const fetchCandidates = dependencies.fetchCandidates || fetchGitHubContributionCandidates;
  const now = dependencies.now || (() => new Date());

  return async function postMissionPreview(request) {
    try {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
    }
    if (!isAllowedMutationOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin request denied' }, { status: 403 });
    }

    const login = normalizePreviewLogin((await request.json()).login);
    const developerContainer = getDeveloperContainer();
    const stateContainer = getStateContainer();
    if (!developerContainer || !stateContainer) {
      return NextResponse.json({ error: 'Mission preview is unavailable' }, { status: 503 });
    }

    const profile = await getPublicProfile(developerContainer, login);
    if (!profile) return NextResponse.json({ error: 'Developer profile not found' }, { status: 404 });

    const previewRetryAfter = await reservePreview(stateContainer, clientHash(request));
    if (previewRetryAfter > 0) return retryResponse(previewRetryAfter);

    const preferences = previewPreferences(profile);
    const requestedAt = now();
    const cacheId = poolId(preferences);
    let opportunities = await readCachedPool(stateContainer, cacheId, requestedAt);
    if (opportunities === null) {
      const globalRetryAfter = await reserveRefresh(stateContainer, requestedAt);
      if (globalRetryAfter > 0) return retryResponse(globalRetryAfter);
      const candidates = await fetchCandidates(preferences, { token: process.env.GITHUB_TOKEN, now: requestedAt });
      opportunities = rankContributionOpportunities(candidates, preferences, [], requestedAt);
      await writeCachedPool(stateContainer, cacheId, opportunities, requestedAt);
    }

    return NextResponse.json({
      profile: { login: profile.login, name: profile.name || profile.login, avatarUrl: profile.avatarUrl || null },
      mission: buildMissionPreview(opportunities[0]),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof MissionPreviewError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 });
    }
    if (error instanceof ContributionOpportunitiesUnavailableError) {
      return NextResponse.json({ error: 'Mission matching is temporarily unavailable' }, { status: 503 });
    }
    console.error('Mission preview failed:', error.message);
    return NextResponse.json({ error: 'Unable to preview a mission' }, { status: 500 });
    }
  }
}

export const POST = createMissionPreviewHandler();
