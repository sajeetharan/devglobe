import { NextResponse } from 'next/server.js';
import { apiError } from '../../../lib/api-error.js';
import {
  detectRepositoryAgentSignals,
  isValidGitHubLogin,
  MAX_AGENT_SIGNAL_REPOSITORIES,
} from '../../../lib/repository-agent-signals.js';

const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 250;

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devglobe-agent-signal-detector',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchRepositorySignals(fetchImpl, login, token) {
  const response = await fetchImpl(`${GITHUB_API}/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&direction=desc&per_page=30`, {
    headers: githubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub repository lookup returned ${response.status}`);
  const payload = await response.json();
  const repositories = (Array.isArray(payload) ? payload : [])
    .filter(repository => !repository.private && !repository.fork && !repository.archived && repository.default_branch)
    .slice(0, MAX_AGENT_SIGNAL_REPOSITORIES);

  const trees = await Promise.all(repositories.map(async repository => {
    const treeResponse = await fetchImpl(`${GITHUB_API}/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, {
      headers: githubHeaders(token),
    });
    if (!treeResponse.ok) return null;
    const tree = await treeResponse.json();
    return {
      fullName: repository.full_name,
      paths: Array.isArray(tree.tree)
        ? tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path)
        : [],
    };
  }));
  const scanned = trees.filter(Boolean);

  return {
    login: login.toLowerCase(),
    scannedRepositories: scanned.length,
    signals: detectRepositoryAgentSignals(scanned),
  };
}

export function createRepositoryAgentSignalsHandler({
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
  cache = new Map(),
  now = () => Date.now(),
} = {}) {
  return async function getRepositoryAgentSignals(request) {
    const login = new URL(request.url).searchParams.get('login')?.trim();
    if (!isValidGitHubLogin(login)) {
      return apiError(400, 'invalid_login', 'A valid GitHub username is required.', 'Use login=octocat.');
    }

    const cacheKey = login.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached?.expiresAt > now()) return NextResponse.json(cached.result, {
      headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
    });

    try {
      const result = await fetchRepositorySignals(fetchImpl, login, token);
      if (!result) return apiError(404, 'github_user_not_found', 'GitHub user not found.', 'Check the username.');
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { result, expiresAt: now() + CACHE_TTL_MS });
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
      });
    } catch (error) {
      console.error('Repository agent signal detection failed:', error.message);
      return apiError(503, 'agent_signal_detection_unavailable', 'Repository agent detection is temporarily unavailable.', 'Retry later.');
    }
  };
}

export const GET = createRepositoryAgentSignalsHandler();