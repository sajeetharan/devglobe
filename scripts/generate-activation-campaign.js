import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { getCosmosContainer } from '../lib/cosmos.js';
import {
  buildOutreachMessage,
  buildWeeklySpotlight,
  selectActivationCandidates,
} from '../lib/activation-campaign.js';

const limitArg = process.argv.find(argument => argument.startsWith('--limit='));
const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const requestedLimit = Number.parseInt(limitArg?.split('=')[1] || '100', 10);
const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
const container = getCosmosContainer(process.env.COSMOS_CONTAINER || 'developers');

async function loadDevelopers() {
  if (container) {
    const { resources } = await container.items.query({
      query: `SELECT TOP 500 c.login, c.name, c.location, c.topLanguage, c.score,
          c.totalStars, c.totalCommits, c.followers, c.soReputation, c.claimed
        FROM c
        WHERE (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')
          AND (NOT IS_DEFINED(c.claimed) OR c.claimed != true)
        ORDER BY c.score DESC`,
    }).fetchAll();
    return resources;
  }

  const sourceUrl = process.env.DEVELOPER_SNAPSHOT_URL?.trim();
  if (!sourceUrl) throw new Error('Cosmos DB or DEVELOPER_SNAPSHOT_URL is required.');
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Developer snapshot returned ${response.status}.`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.developers || [];
}

const resources = await loadDevelopers();

const candidates = selectActivationCandidates(resources, limit);
const output = {
  generatedAt: new Date().toISOString(),
  delivery: 'manual_review_only',
  candidateCount: candidates.length,
  weeklySpotlight: buildWeeklySpotlight(candidates),
  outreach: candidates.map(developer => ({
    login: developer.login,
    profileUrl: `https://www.devglobe.dev/developer/${encodeURIComponent(developer.login)}`,
    message: buildOutreachMessage(developer),
  })),
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (outputArg) {
  const outputPath = outputArg.slice('--output='.length).trim();
  if (!outputPath) throw new Error('Output path cannot be empty.');
  await writeFile(outputPath, serialized, 'utf8');
  console.log(`Generated ${candidates.length} review-only outreach messages at ${outputPath}.`);
} else {
  console.log(serialized);
}