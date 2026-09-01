import { promises as fs } from 'fs';
import path from 'path';
import { getCosmosContainer } from './cosmos.js';
import { addDeveloperRanks } from './ranking.js';
import { scoreAll } from './scoring.js';

const BADGE_FIELDS = 'c.login, c.score, c.globalRank, c.globalTotal, c.country, c.countryRank, c.countryTotal, c.city, c.cityRank, c.cityTotal, c.totalStars, c.topLanguage, c.claimed';

async function getFromCosmos(login) {
  const container = getCosmosContainer();
  if (!container) return null;

  try {
    const { resources } = await container.items.query({
      query: `SELECT TOP 1 ${BADGE_FIELDS}
        FROM c
        WHERE (c.login = @login OR c.id = @login)
          AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
      parameters: [{ name: '@login', value: login }],
    }).fetchAll();
    return resources[0] || null;
  } catch (error) {
    console.error('Badge: Cosmos error', error.message);
    return null;
  }
}

async function getFromSampleData(login) {
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const developers = addDeveloperRanks(scoreAll(data));
  return developers.find(d => d.login.toLowerCase() === login.toLowerCase()) || null;
}

/** Public, badge-safe view of a developer: only fields already exposed via /api/developer. */
export async function getBadgeDeveloper(login) {
  const fromCosmos = await getFromCosmos(login);
  if (fromCosmos) return fromCosmos;
  return getFromSampleData(login);
}
