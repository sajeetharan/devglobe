import { CosmosClient } from '@azure/cosmos';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { projectAgentReadiness } from '../../../lib/agent-network.js';

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const DATABASE = process.env.COSMOS_DATABASE || 'devglobe';
const CONTAINER = process.env.COSMOS_CONTAINER || 'developers';

async function getSampleData() {
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function projectAgentReadinessList(developers) {
  return developers.map(projectAgentReadiness);
}

export async function GET() {
  // Fallback to sample data when Cosmos DB is not configured
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    const data = await getSampleData();
    return NextResponse.json(projectAgentReadinessList(data), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    const container = client.database(DATABASE).container(CONTAINER);

    const { resources } = await container.items
      .query("SELECT c.id, c.login, c.name, c.avatarUrl, c.githubUrl, c.location, c.lat, c.lng, c.followers, c.publicRepos, c.totalStars, c.totalForks, c.totalWatchers, c.totalCommits, c.topLanguage, c.soUserId, c.soReputation, c.soAnswers, c.soAcceptRate, c.soBadges, c.specialTags, c.claimed, c.metricsUpdatedAt, c.collaborators, c.aiProfile FROM c WHERE NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved'")
      .fetchAll();

    return NextResponse.json(projectAgentReadinessList(resources), {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('Cosmos DB error:', err.message);
    // Fallback to sample data on connection errors
    const data = await getSampleData();
    return NextResponse.json(projectAgentReadinessList(data), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}