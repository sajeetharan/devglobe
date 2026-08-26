import { CosmosClient } from '@azure/cosmos';
import { NextResponse } from 'next/server.js';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError } from '../../../lib/api-error.js';

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT?.trim().replace(/\/$/, '');
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY?.trim();
const EMBEDDING_DEPLOYMENT = process.env.EMBEDDING_DEPLOYMENT?.trim() || 'text-embedding-3-small';
const OPENAI_CONFIGURED = Boolean(
  OPENAI_ENDPOINT
  && OPENAI_KEY
  && !OPENAI_ENDPOINT.includes('your-resource.openai.azure.com')
);

const DATABASE = process.env.COSMOS_DATABASE || 'devglobe';
const CONTAINER = process.env.COSMOS_CONTAINER || 'developers';

// Excludes pending/rejected self-nominations from every search mode. Legacy
// documents with no `nomination` field (pre-dating the lifecycle) stay public.
const PUBLIC_FILTER = "(NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')";

async function getSampleData() {
  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function searchSampleData(data, q, limit) {
  const lower = q.toLowerCase();
  return data
    .filter(d =>
      (d.login && d.login.toLowerCase().includes(lower)) ||
      (d.name && d.name.toLowerCase().includes(lower)) ||
      (d.location && d.location.toLowerCase().includes(lower)) ||
      (d.topLanguage && d.topLanguage.toLowerCase().includes(lower))
    )
    .slice(0, limit);
}

async function getEmbedding(text) {
  const url = `${OPENAI_ENDPOINT}/openai/deployments/${encodeURIComponent(EMBEDDING_DEPLOYMENT)}/embeddings?api-version=2024-02-01`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': OPENAI_KEY },
    body: JSON.stringify({ input: [text] })
  });
  if (!res.ok) throw new Error(`Azure OpenAI returned ${res.status}`);
  const data = await res.json();
  if (!data.data?.[0]?.embedding) throw new Error('Azure OpenAI returned no embedding');
  return data.data[0].embedding;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const mode = searchParams.get('mode') || 'hybrid';
  const top = searchParams.get('top') || '10';

  if (!q) {
    return apiError(
      400,
      'missing_search_query',
      'Query parameter "q" is required.',
      'Call /api/search?q=<skills-or-location>&mode=text&top=10.',
    );
  }

  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    // Fallback: search sample data locally (text mode only)
    const data = await getSampleData();
    const limit = Math.min(parseInt(top), 50);
    const results = searchSampleData(data, q, limit);
    return NextResponse.json({ query: q, mode: 'text', count: results.length, results });
  }

  try {
    const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    const container = client.database(DATABASE).container(CONTAINER);
    const limit = Math.min(parseInt(top), 50);

    let results;

    if (mode === 'vector') {
      if (!OPENAI_CONFIGURED) {
        return apiError(503, 'vector_search_unavailable', 'Vector search is unavailable.', 'Retry with mode=text.');
      }
      const embedding = await getEmbedding(q);
      const { resources } = await container.items.query({
        query: `
          SELECT TOP ${limit}
            c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
            c.topLanguage, c.score, c.totalStars, c.followers, c.soReputation, c.specialTags,
            VectorDistance(c.embedding, @embedding) AS relevance
          FROM c
          WHERE ${PUBLIC_FILTER}
          ORDER BY VectorDistance(c.embedding, @embedding)
        `,
        parameters: [{ name: '@embedding', value: embedding }]
      }).fetchAll();
      results = resources;

    } else if (mode === 'text') {
      const searchTerm = q.toLowerCase();
      const { resources } = await container.items.query({
        query: `
          SELECT TOP ${limit}
            c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
            c.topLanguage, c.score, c.totalStars, c.followers, c.soReputation, c.specialTags
          FROM c
          WHERE (
             CONTAINS(LOWER(c.login), @q)
             OR CONTAINS(LOWER(c.name), @q)
             OR CONTAINS(LOWER(c.location), @q)
             OR CONTAINS(LOWER(c.bio), @q)
             OR CONTAINS(LOWER(c.topLanguage), @q)
          ) AND ${PUBLIC_FILTER}
          ORDER BY c.score DESC
        `,
        parameters: [{ name: '@q', value: searchTerm }]
      }).fetchAll();
      results = resources;

    } else {
      // Hybrid: client-side RRF fusion of vector + text results
      if (!OPENAI_CONFIGURED) {
        return apiError(503, 'hybrid_search_unavailable', 'Hybrid search is unavailable.', 'Retry with mode=text.');
      }
      const searchTerm = q.toLowerCase();
      const embedding = await getEmbedding(q);

      const [vectorRes, textRes] = await Promise.all([
        container.items.query({
          query: `
            SELECT TOP ${limit}
              c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
              c.topLanguage, c.score, c.totalStars, c.followers, c.soReputation, c.specialTags
            FROM c
            WHERE ${PUBLIC_FILTER}
            ORDER BY VectorDistance(c.embedding, @embedding)
          `,
          parameters: [{ name: '@embedding', value: embedding }]
        }).fetchAll(),
        container.items.query({
          query: `
            SELECT TOP ${limit}
              c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
              c.topLanguage, c.score, c.totalStars, c.followers, c.soReputation, c.specialTags
            FROM c
            WHERE (
               CONTAINS(LOWER(c.login), @q)
               OR CONTAINS(LOWER(c.name), @q)
               OR CONTAINS(LOWER(c.location), @q)
               OR CONTAINS(LOWER(c.bio), @q)
               OR CONTAINS(LOWER(c.topLanguage), @q)
            ) AND ${PUBLIC_FILTER}
            ORDER BY c.score DESC
          `,
          parameters: [{ name: '@q', value: searchTerm }]
        }).fetchAll()
      ]);

      // RRF fusion
      const k = 60;
      const rrf = new Map();
      const allMap = new Map();
      vectorRes.resources.forEach((r, i) => { rrf.set(r.login, (rrf.get(r.login) || 0) + 1 / (k + i + 1)); allMap.set(r.login, r); });
      textRes.resources.forEach((r, i) => { rrf.set(r.login, (rrf.get(r.login) || 0) + 1 / (k + i + 1)); allMap.set(r.login, r); });
      results = [...rrf.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([login]) => allMap.get(login));
    }

    return NextResponse.json({ query: q, mode, count: results.length, results });
  } catch (err) {
    console.error('Search error:', err.message);
    return apiError(500, 'search_failed', 'Search failed.', 'Retry later or use the text search mode.');
  }
}