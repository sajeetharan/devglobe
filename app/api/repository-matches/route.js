import { NextResponse } from 'next/server.js';
import { apiError } from '../../../lib/api-error.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import {
  normalizeRepositoryMatchLimit,
  parseRepositoryReference,
  rankDevelopersForRepository,
  repositoryCandidateQuery,
} from '../../../lib/repository-matching.js';

const PUBLIC_FILTER = "(NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')";
const CANDIDATE_LIMIT = 100;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

async function fetchRepository(fetchImpl, reference) {
  const response = await fetchImpl(`https://api.github.com/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repository)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevGlobe/1.0',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub repository lookup returned ${response.status}`);
  const repository = await response.json();
  if (repository.private) return null;
  const contributorsResponse = await fetchImpl(`${repository.contributors_url || `https://api.github.com/repos/${reference.fullName}/contributors`}?per_page=100&anon=0`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevGlobe/1.0',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  const contributorsPayload = contributorsResponse.ok ? await contributorsResponse.json() : [];
  return {
    owner: repository.owner?.login || reference.owner,
    name: repository.name || reference.repository,
    fullName: repository.full_name || reference.fullName,
    url: repository.html_url || `https://github.com/${reference.fullName}`,
    description: repository.description || null,
    language: repository.language || null,
    topics: Array.isArray(repository.topics) ? repository.topics.slice(0, 10) : [],
    stars: Number(repository.stargazers_count || 0),
    contributors: Array.isArray(contributorsPayload) ? contributorsPayload
      .filter(contributor => contributor?.login)
      .slice(0, 100)
      .map(contributor => ({ login: contributor.login, contributions: Number(contributor.contributions || 0) })) : [],
  };
}

export function createRepositoryMatchesHandler({
  getContainer = getCosmosContainer,
  fetchImpl = fetch,
  cache = new Map(),
  now = () => Date.now(),
} = {}) {
  return async function getRepositoryMatches(request) {
    const { searchParams } = new URL(request.url);
    const reference = parseRepositoryReference(searchParams.get('repository'));
    if (!reference) {
      return apiError(400, 'invalid_repository', 'A valid public GitHub owner/repository is required.', 'Use repository=owner/repository.');
    }
    const container = getContainer();
    if (!container) return apiError(503, 'repository_matching_unavailable', 'Repository matching is unavailable.', 'Retry later.');

    try {
      const cacheKey = reference.fullName.toLowerCase();
      const cached = cache.get(cacheKey);
      let repository = cached?.expiresAt > now() ? cached.repository : await fetchRepository(fetchImpl, reference);
      if (!cached || cached.expiresAt <= now()) {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { repository, expiresAt: now() + CACHE_TTL_MS });
      }
      if (!repository) return apiError(404, 'repository_not_found', 'Public GitHub repository not found.', 'Check the owner and repository name.');
      const { conditions, parameters } = repositoryCandidateQuery(repository);
      const { resources } = await container.items.query({
        query: `SELECT TOP ${CANDIDATE_LIMIT}
          c.login, c.name, c.location, c.bio, c.topLanguage, c.languages, c.topRepos,
          c.score, c.totalStars, c.totalCommits, c.followers, c.soReputation,
          c.specialTags, c.metricsUpdatedAt, c.aiProfile
          FROM c
          WHERE ${PUBLIC_FILTER} AND (${conditions.join(' OR ')})
          ORDER BY c.score DESC`,
        parameters,
      }).fetchAll();
      const results = rankDevelopersForRepository(repository, resources, normalizeRepositoryMatchLimit(searchParams.get('top')));
      const { contributors, ...publicRepository } = repository;
      return NextResponse.json({
        repository: { ...publicRepository, contributorCount: contributors.length },
        count: results.length,
        results,
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
      });
    } catch (error) {
      console.error('Repository matching failed:', error.message);
      return apiError(503, 'repository_matching_unavailable', 'Repository matching is temporarily unavailable.', 'Retry later.');
    }
  };
}

export const GET = createRepositoryMatchesHandler();