import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { withNumericScore } from '../../../lib/developer-score.js';
import { addDeveloperRanks } from '../../../lib/ranking.js';
import { listLatestSnapshotsOnOrBeforeDay } from '../../../lib/impact-history-store.js';
import { buildTrending, windowStartDay } from '../../../lib/trending.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const CONTAINER = process.env.COSMOS_CONTAINER || 'developers';
const TRENDING_CACHE_MS = 60 * 60 * 1000;
const TRENDING_QUERY_TIMEOUT_MS = 5000;
const trendingCache = new Map();

async function getSampleData() {
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

// Rank + score the raw developer list the same way /api/developers does,
// so globalRank here lines up with what the rest of the app shows.
function rankDevelopers(rawDevelopers) {
  const scored = rawDevelopers.map(withNumericScore).sort((a, b) => b.score - a.score);
  return addDeveloperRanks(scored);
}

async function loadDevelopers() {
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    return rankDevelopers(await getSampleData());
  }
  try {
    const container = getCosmosContainer(CONTAINER);
    if (!container) return rankDevelopers(await getSampleData());
    const fields = 'c.login, c.name, c.avatarUrl, c.location, c.topLanguage, c.score';
    const { resources } = await container.items.query({
      query: `SELECT ${fields} FROM c WHERE (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved') ORDER BY c.score DESC`,
    }).fetchAll();
    return rankDevelopers(resources);
  } catch (err) {
    console.error('Cosmos DB error (trending):', err.message);
    return rankDevelopers(await getSampleData());
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function computeTrending(windowDays) {
  const developersPromise = withTimeout(loadDevelopers(), TRENDING_QUERY_TIMEOUT_MS, 'Developer query')
    .catch(async error => {
      console.warn('Trending developer query degraded to sample data:', error.message);
      return rankDevelopers(await getSampleData());
    });
  const baselinePromise = withTimeout(
    listLatestSnapshotsOnOrBeforeDay(windowStartDay(windowDays)),
    TRENDING_QUERY_TIMEOUT_MS,
    'Impact history query',
  ).catch(error => {
    console.warn('Trending history unavailable:', error.message);
    return [];
  });
  const [developers, baselineSnapshots] = await Promise.all([developersPromise, baselinePromise]);
  return buildTrending(developers, baselineSnapshots, { windowDays });
}

async function getCachedTrending(windowDays) {
  const cached = trendingCache.get(windowDays);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = computeTrending(windowDays)
    .then(value => {
      trendingCache.set(windowDays, { value, expiresAt: Date.now() + TRENDING_CACHE_MS });
      return value;
    })
    .catch(error => {
      trendingCache.delete(windowDays);
      throw error;
    });
  trendingCache.set(windowDays, { promise });
  return promise;
}

// GET /api/trending -> top score gainers over the last 30 days, computed
// against the most recent impact-history snapshot on or before that date.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const windowDays = Math.min(Math.max(Number.parseInt(searchParams.get('days'), 10) || 30, 1), 90);

  try {
    const trending = await getCachedTrending(windowDays);
    return NextResponse.json(trending, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('Trending error:', err.message);
    return NextResponse.json({ error: 'Unable to load trending developers' }, { status: 500 });
  }
}
