import { promises as fs } from 'fs';
import path from 'path';
import { getCosmosContainer } from './cosmos.js';
import { addDeveloperRanks } from './ranking.js';
import { scoreAll } from './scoring.js';

const CARD_FIELDS = 'c.login, c.name, c.location, c.topLanguage, c.score, c.globalRank, c.globalTotal, c.country, c.countryRank, c.totalStars, c.totalCommits, c.followers';

async function getFromCosmos(login) {
  const container = getCosmosContainer();
  if (!container) return null;
  try {
    const { resources } = await container.items.query({
      query: `SELECT TOP 1 ${CARD_FIELDS}
        FROM c
        WHERE (c.login = @login OR c.id = @login)
          AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
      parameters: [{ name: '@login', value: login }],
    }).fetchAll();
    return resources[0] || null;
  } catch (error) {
    console.error('Profile card: Cosmos error', error.message);
    return null;
  }
}

async function getFromSampleData(login) {
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  const developers = addDeveloperRanks(scoreAll(JSON.parse(raw)));
  return developers.find(d => d.login.toLowerCase() === login.toLowerCase()) || null;
}

export async function getProfileCardDeveloper(login) {
  const fromCosmos = await getFromCosmos(login);
  if (fromCosmos) return fromCosmos;
  return getFromSampleData(login);
}

/** Build the ordered [label, value] detail rows shown on the card. */
export function buildCardDetails(developer, login) {
  const rows = [];
  const number = value => (Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : null);

  if (developer?.name) rows.push(['Name', developer.name]);
  if (developer?.location) rows.push(['Location', developer.location]);
  if (developer?.topLanguage) rows.push(['Language', developer.topLanguage]);
  if (number(developer?.score) !== null) rows.push(['Score', `${number(developer.score)}/100`]);
  if (developer?.globalRank) rows.push(['Global rank', `#${number(developer.globalRank)}`]);
  if (developer?.countryRank && developer?.country) rows.push([developer.country, `#${number(developer.countryRank)}`]);
  if (number(developer?.totalStars) !== null) rows.push(['Stars', number(developer.totalStars)]);
  if (number(developer?.totalCommits) !== null) rows.push(['Commits', number(developer.totalCommits)]);
  if (number(developer?.followers) !== null) rows.push(['Followers', number(developer.followers)]);

  if (!rows.length) rows.push(['GitHub', `@${login}`]);
  return rows;
}
