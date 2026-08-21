import { NextResponse } from 'next/server.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import {
  hasUsableEmbedding,
  normalizeSimilarityLimit,
  normalizeSimilarDevelopers,
} from '../../../lib/profile-similarity.js';

const PUBLIC_FILTER = "(NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')";
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

async function getSource(container, login) {
  const { resources } = await container.items.query({
    query: `SELECT TOP 1 c.id, c.login, c.location, c.topLanguage, c.topRepos, c.embedding
      FROM c
      WHERE LOWER(c.login) = @login AND ${PUBLIC_FILTER}`,
    parameters: [{ name: '@login', value: login.toLowerCase() }],
  }).fetchAll();
  return resources[0] || null;
}

export function createSimilarDevelopersHandler(getContainer = getCosmosContainer) {
  return async function getSimilarDevelopers(request) {
  const { searchParams } = new URL(request.url);
  const login = String(searchParams.get('login') || '').trim();
  if (!LOGIN_PATTERN.test(login)) {
    return NextResponse.json({ error: 'A valid developer login is required' }, { status: 400 });
  }
  const container = getContainer();
  if (!container) return NextResponse.json({ error: 'Profile similarity is unavailable' }, { status: 503 });

  try {
    const source = await getSource(container, login);
    if (!source) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
    if (!hasUsableEmbedding(source)) {
      return NextResponse.json({ error: 'This profile does not have a similarity index yet', missingEmbedding: true }, { status: 422 });
    }
    const limit = normalizeSimilarityLimit(searchParams.get('top'));
    const candidateLimit = 40;
    const { resources } = await container.items.query({
      query: `SELECT TOP ${candidateLimit}
        c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
        c.topLanguage, c.topRepos, c.score,
        VectorDistance(c.embedding, @embedding) AS distance
        FROM c
        WHERE ${PUBLIC_FILTER}
          AND LOWER(c.login) != @login
          AND IS_ARRAY(c.embedding)
        ORDER BY VectorDistance(c.embedding, @embedding)`,
      parameters: [
        { name: '@embedding', value: source.embedding },
        { name: '@login', value: source.login.toLowerCase() },
      ],
    }).fetchAll();
    const results = normalizeSimilarDevelopers(source, resources, limit);
    return NextResponse.json({ source: source.login, count: results.length, results }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('Profile similarity failed:', error.message);
    return NextResponse.json({ error: 'Profile similarity is unavailable' }, { status: 503 });
  }
  };
}

export const GET = createSimilarDevelopersHandler();