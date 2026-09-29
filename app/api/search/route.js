import { NextResponse } from 'next/server.js';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError } from '../../../lib/api-error.js';
import {
  rankDeveloperSearchResults,
  searchTermAlternatives,
  tokenizeDeveloperSearchQuery,
} from '../../../lib/developer-search.js';
import { attachSearchMatches } from '../../../lib/search-match.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';

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
  const search = rankDeveloperSearchResults(data, q, limit);
  return {
    ...search,
    results: search.results.map(developer => ({ id: developer.id || developer.login, ...developer })),
  };
}

function buildTextSearch(terms, limit, matchAll = true) {
  const parameters = [];
  const predicates = terms.map((term, termIndex) => {
    const alternatives = searchTermAlternatives(term);
    const alternativePredicates = alternatives.map((alternative, alternativeIndex) => {
      const parameterName = `@q${termIndex}_${alternativeIndex}`;
      parameters.push({ name: parameterName, value: alternative });
      return `(
        CONTAINS(LOWER(c.login), ${parameterName})
        OR CONTAINS(LOWER(c.name), ${parameterName})
        OR CONTAINS(LOWER(c.location), ${parameterName})
        OR CONTAINS(LOWER(c.bio), ${parameterName})
        OR CONTAINS(LOWER(c.topLanguage), ${parameterName})
        OR EXISTS(SELECT VALUE tag FROM tag IN c.specialTags WHERE CONTAINS(LOWER(tag), ${parameterName}))
      )`;
    });
    return `(${alternativePredicates.join(' OR ')})`;
  });

  return {
    query: `
      SELECT TOP ${limit}
        c.id, c.login, c.name, c.avatarUrl, c.location, c.lat, c.lng,
        c.topLanguage, c.score, c.totalStars, c.followers, c.soReputation, c.specialTags
      FROM c
      WHERE ${predicates.join(matchAll ? ' AND ' : ' OR ')} AND ${PUBLIC_FILTER}
      ORDER BY c.score DESC
    `,
    parameters,
  };
}

async function runTextSearch(container, terms, limit) {
  const strict = await container.items.query(buildTextSearch(terms, limit)).fetchAll();
  if (strict.resources.length || terms.length < 2) return { results: strict.resources, matchMode: 'all' };
  const candidateLimit = Math.min(Math.max(limit * 5, 50), 200);
  const broadened = await container.items.query(buildTextSearch(terms, candidateLimit, false)).fetchAll();
  const ranked = rankDeveloperSearchResults(broadened.resources, terms.join(' '), limit);
  return { results: ranked.results, matchMode: ranked.matchMode };
}

async function runVectorSearch(container, query, limit) {
  const embedding = await getEmbedding(query);
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
    parameters: [{ name: '@embedding', value: embedding }],
  }).fetchAll();
  return resources;
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
  const requestedMode = searchParams.get('mode') || 'hybrid';
  const mode = ['text', 'vector', 'hybrid'].includes(requestedMode) ? requestedMode : 'hybrid';
  const top = searchParams.get('top') || '10';

  if (!q) {
    return apiError(
      400,
      'missing_search_query',
      'Query parameter "q" is required.',
      'Call /api/search?q=<skills-or-location>&mode=text&top=10.',
    );
  }

  const interpretedTerms = tokenizeDeveloperSearchQuery(q);
  const parsedTop = Number.parseInt(top, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedTop) ? parsedTop : 10, 1), 50);

  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    const data = await getSampleData();
    const search = searchSampleData(data, q, limit);
    const results = attachSearchMatches(search.results, q, 'text');
    return NextResponse.json({
      query: q,
      requestedMode: mode,
      mode: 'text',
      fallback: mode === 'text' ? null : 'semantic_unavailable',
      interpretedTerms,
      matchMode: search.matchMode,
      count: results.length,
      results,
    });
  }

  try {
    const container = getCosmosContainer(CONTAINER);
    if (!container) throw new Error('Cosmos DB is not configured');
    let results;
    let resolvedMode = mode;
    let fallback = null;
    let matchMode = 'all';

    if (mode === 'vector') {
      try {
        if (!OPENAI_CONFIGURED) throw new Error('Semantic search is not configured');
        results = await runVectorSearch(container, q, limit);
      } catch (error) {
        console.warn('Vector search fell back to text:', error.message);
        const textSearch = await runTextSearch(container, interpretedTerms, limit);
        results = textSearch.results;
        matchMode = textSearch.matchMode;
        resolvedMode = 'text';
        fallback = 'semantic_unavailable';
      }
    } else if (mode === 'text') {
      const textSearch = await runTextSearch(container, interpretedTerms, limit);
      results = textSearch.results;
      matchMode = textSearch.matchMode;
    } else {
      try {
        if (!OPENAI_CONFIGURED) throw new Error('Semantic search is not configured');
        const [vectorResults, textSearch] = await Promise.all([
          runVectorSearch(container, q, limit),
          runTextSearch(container, interpretedTerms, limit),
        ]);
        const textResults = textSearch.results;
        matchMode = textSearch.matchMode;
        const k = 60;
        const rrf = new Map();
        const allMap = new Map();
        vectorResults.forEach((result, index) => {
          rrf.set(result.login, (rrf.get(result.login) || 0) + 1 / (k + index + 1));
          allMap.set(result.login, { ...allMap.get(result.login), ...result, _searchVectorRank: index });
        });
        textResults.forEach((result, index) => {
          rrf.set(result.login, (rrf.get(result.login) || 0) + 1 / (k + index + 1));
          allMap.set(result.login, { ...allMap.get(result.login), ...result, _searchTextRank: index });
        });
        results = [...rrf.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([login]) => allMap.get(login));
      } catch (error) {
        console.warn('Hybrid search fell back to text:', error.message);
        const textSearch = await runTextSearch(container, interpretedTerms, limit);
        results = textSearch.results;
        matchMode = textSearch.matchMode;
        resolvedMode = 'text';
        fallback = 'semantic_unavailable';
      }
    }

    results = attachSearchMatches(results, q, resolvedMode);
    return NextResponse.json({
      query: q,
      requestedMode: mode,
      mode: resolvedMode,
      fallback,
      interpretedTerms,
      matchMode,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    return apiError(500, 'search_failed', 'Search failed.', 'Retry later or use the text search mode.');
  }
}