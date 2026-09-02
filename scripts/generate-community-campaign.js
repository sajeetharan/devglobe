import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { getCosmosContainer } from '../lib/cosmos.js';
import { buildCommunityCampaignBundle, COMMUNITY_CAMPAIGN_TYPES } from '../lib/community-campaign.js';

function argument(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
}

const login = argument('login')?.toLowerCase();
const type = argument('type') || 'developer_spotlight';
const outputPath = argument('output');
if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login || '')) throw new Error('--login must be a valid GitHub login');
if (!COMMUNITY_CAMPAIGN_TYPES.includes(type)) throw new Error(`--type must be one of: ${COMMUNITY_CAMPAIGN_TYPES.join(', ')}`);

async function loadDeveloper() {
  const container = getCosmosContainer(process.env.COSMOS_CONTAINER || 'developers');
  if (container) {
    const { resources } = await container.items.query({
      query: `SELECT TOP 1 c.login, c.name, c.location, c.country, c.countryRank, c.globalRank, c.topLanguage, c.claimed
        FROM c WHERE StringEquals(c.login, @login, true)
          AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
      parameters: [{ name: '@login', value: login }],
    }).fetchAll();
    return resources[0];
  }

  const sourceUrl = process.env.DEVELOPER_SNAPSHOT_URL?.trim();
  if (!sourceUrl) throw new Error('Cosmos DB or DEVELOPER_SNAPSHOT_URL is required');
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Developer snapshot returned ${response.status}`);
  const payload = await response.json();
  const developers = Array.isArray(payload) ? payload : payload.developers || [];
  return developers.find(developer => developer.login?.toLowerCase() === login);
}

const developer = await loadDeveloper();
if (!developer) throw new Error(`Public developer profile not found: ${login}`);
if (developer.claimed !== true) throw new Error('Community campaign stories require a claimed developer profile');

const bundle = {
  generatedAt: new Date().toISOString(),
  ...buildCommunityCampaignBundle({ siteUrl: 'https://www.devglobe.dev', developer, type }),
};
const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
if (outputPath) {
  await writeFile(outputPath, serialized, 'utf8');
  console.log(`Generated review-only ${type} campaign at ${outputPath}.`);
} else {
  console.log(serialized);
}