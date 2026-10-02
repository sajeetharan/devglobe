import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { withNumericScore } from '../../../lib/developer-score.js';
import { computeCountryStats } from '../../../lib/country-stats.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const CONTAINER = process.env.COSMOS_CONTAINER || 'developers';
const COUNTRY_STATS_CACHE_MS = 60 * 60 * 1000;
let countryStatsCache;
let countryStatsPromise;

async function getSampleData() {
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function getDevelopersForStats() {
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    return (await getSampleData()).map(withNumericScore);
  }

  try {
    const container = getCosmosContainer(CONTAINER);
    if (!container) return (await getSampleData()).map(withNumericScore);
    const fields = 'c.location, c.score, c.topLanguage';
    const query = `SELECT ${fields} FROM c WHERE (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`;
    const { resources } = await container.items.query(query).fetchAll();
    return resources.map(withNumericScore);
  } catch (err) {
    console.error('Cosmos DB error (country-stats):', err.message);
    return (await getSampleData()).map(withNumericScore);
  }
}

// GET /api/country-stats -> per-country developer count, average score, and
// top languages, for the /countries page (#3). Grouping reuses the same
// normalization the globe/leaderboard country filter already relies on.
export async function GET() {
  try {
    if (!countryStatsCache || countryStatsCache.expiresAt <= Date.now()) {
      countryStatsPromise ||= getDevelopersForStats()
        .then(developers => {
          countryStatsCache = {
            value: {
              countries: computeCountryStats(developers),
              totalDevelopers: developers.filter(developer => developer.location).length,
            },
            expiresAt: Date.now() + COUNTRY_STATS_CACHE_MS,
          };
        })
        .finally(() => {
          countryStatsPromise = null;
        });
      await countryStatsPromise;
    }

    return NextResponse.json(
      countryStatsCache.value,
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' } },
    );
  } catch (err) {
    console.error('Country stats error:', err.message);
    return NextResponse.json({ error: 'Unable to compute country statistics' }, { status: 500 });
  }
}
