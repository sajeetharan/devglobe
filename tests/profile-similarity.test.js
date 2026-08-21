import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasUsableEmbedding,
  normalizeSimilarityLimit,
  normalizeSimilarDevelopers,
} from '../lib/profile-similarity.js';
import { createSimilarDevelopersHandler } from '../app/api/similar-developers/route.js';

const embedding = Array(1536).fill(0.1);

const source = {
  login: 'octocat',
  topLanguage: 'JavaScript',
  location: 'San Francisco',
  topRepos: [{ name: 'devglobe' }],
};

test('detects missing and malformed profile embeddings', () => {
  assert.equal(hasUsableEmbedding({ embedding }), true);
  assert.equal(hasUsableEmbedding({ embedding: [0.1, 0.2] }), false);
  assert.equal(hasUsableEmbedding({ embedding: [] }), false);
  assert.equal(hasUsableEmbedding({}), false);
  assert.equal(hasUsableEmbedding({ embedding: [0.1, Number.NaN] }), false);
});

test('bounds result limits', () => {
  assert.equal(normalizeSimilarityLimit('5'), 5);
  assert.equal(normalizeSimilarityLimit('100'), 20);
  assert.equal(normalizeSimilarityLimit('invalid'), 10);
  assert.equal(normalizeSimilarityLimit('0'), 10);
});

test('excludes self and returns stable distance then login ordering', () => {
  const results = normalizeSimilarDevelopers(source, [
    { id: 'self', login: 'OCTOCAT', distance: 0 },
    { id: 'z', login: 'zed', distance: 0.2, topLanguage: 'Python' },
    { id: 'a', login: 'alpha', distance: 0.2, topLanguage: 'JavaScript' },
    { id: 'b', login: 'beta', distance: 0.1, location: 'San Francisco' },
  ], 2);

  assert.deepEqual(results.map(result => result.login), ['beta', 'alpha']);
  assert.deepEqual(results[0].reasons, ['Both list San Francisco']);
  assert.deepEqual(results[1].reasons, ['Both work primarily in JavaScript']);
  assert.ok(results.every(result => !Object.hasOwn(result, 'distance')));
});

test('uses bounded rank bands instead of uncalibrated percentages', () => {
  const resources = Array.from({ length: 10 }, (_, index) => ({
    id: String(index), login: `dev-${index}`, distance: index / 100,
  }));
  const results = normalizeSimilarDevelopers(source, resources, 10);

  assert.deepEqual(results.map(result => result.similarity), [
    'Very similar', 'Very similar', 'Very similar',
    'Similar', 'Similar', 'Similar', 'Similar', 'Similar',
    'Related', 'Related',
  ]);
});

test('API rejects missing embeddings before vector search', async () => {
  const queries = [];
  const handler = createSimilarDevelopersHandler(() => ({
    items: {
      query(specification) {
        queries.push(specification);
        return { fetchAll: async () => ({ resources: [{ login: 'octocat' }] }) };
      },
    },
  }));
  const response = await handler(new Request('http://localhost/api/similar-developers?login=octocat'));

  assert.equal(response.status, 422);
  assert.equal((await response.json()).missingEmbedding, true);
  assert.equal(queries.length, 1);
});

test('API excludes the source, bounds results, and returns stable public ordering', async () => {
  const queries = [];
  const handler = createSimilarDevelopersHandler(() => ({
    items: {
      query(specification) {
        queries.push(specification);
        const resources = queries.length === 1
          ? [{ login: 'octocat', topLanguage: 'JavaScript', embedding }]
          : [
            { id: 'self', login: 'octocat', distance: 0 },
            { id: 'z', login: 'zed', distance: 0.2 },
            { id: 'a', login: 'alpha', distance: 0.2 },
            { id: 'b', login: 'beta', distance: 0.1 },
          ];
        return { fetchAll: async () => ({ resources }) };
      },
    },
  }));
  const response = await handler(new Request('http://localhost/api/similar-developers?login=octocat&top=2'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.results.map(result => result.login), ['beta', 'alpha']);
  assert.ok(body.results.every(result => !Object.hasOwn(result, 'distance') && !Object.hasOwn(result, 'embedding')));
  assert.match(queries[1].query, /LOWER\(c\.login\) != @login/);
  assert.match(queries[1].query, /SELECT TOP 40/);
});