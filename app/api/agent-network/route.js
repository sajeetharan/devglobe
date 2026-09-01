import { NextResponse } from 'next/server';
import { buildAgentNetworkSnapshot, buildAgentRelationshipGraph, projectAgentReadiness } from '../../../lib/agent-network.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';

export async function GET() {
  const developers = getCosmosContainer();
  const introductions = getCosmosContainer(process.env.COSMOS_INTRODUCTIONS_CONTAINER || 'agent-introductions');

  if (!developers || !introductions) {
    return NextResponse.json(buildAgentNetworkSnapshot({}), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const [developerResult, introductionResult] = await Promise.all([
      developers.items.query({
        query: `SELECT c.id, c.login, c.name, c.avatarUrl, c.lat, c.lng, c.score, c.claimed, c.location, c.aiProfile,
          c.repositoryAgentSignals.toolIds AS repositoryAgentTools
          FROM c
          WHERE (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')
            AND (
              (c.claimed = true
                AND IS_DEFINED(c.aiProfile)
                AND c.aiProfile.visibility = 'public'
                AND c.aiProfile.acceptsAgentRequests = true
                AND c.aiProfile.contactPolicy = 'verified-agents')
              OR (IS_ARRAY(c.repositoryAgentSignals.toolIds) AND ARRAY_LENGTH(c.repositoryAgentSignals.toolIds) > 0)
            )`,
      }).fetchAll(),
      introductions.items.query({
        query: 'SELECT c.status, COUNT(1) AS count FROM c GROUP BY c.status',
      }).fetchAll(),
    ]);

    const introductionCounts = Object.fromEntries(
      introductionResult.resources.map(result => [result.status, result.count])
    );
    const snapshot = buildAgentNetworkSnapshot({
      developers: developerResult.resources,
      introductionCounts,
    });
    const graph = buildAgentRelationshipGraph(developerResult.resources.map(projectAgentReadiness));

    return NextResponse.json({ ...snapshot, graph }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('Agent Network metrics error:', error.message);
    return NextResponse.json({ error: 'Failed to load Agent Network metrics' }, { status: 500 });
  }
}
