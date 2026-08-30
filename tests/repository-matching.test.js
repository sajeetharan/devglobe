import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositoryMatchesHandler } from '../app/api/repository-matches/route.js';
import {
  parseRepositoryReference,
  rankDevelopersForRepository,
} from '../lib/repository-matching.js';

const repository = {
  owner: 'acme',
  name: 'widgets',
  fullName: 'acme/widgets',
  language: 'TypeScript',
  topics: ['developer-tools'],
  contributors: [{ login: 'alpha', contributions: 7 }],
};

test('validates GitHub repository references', () => {
  assert.deepEqual(parseRepositoryReference('acme/widgets'), { owner: 'acme', repository: 'widgets', fullName: 'acme/widgets' });
  assert.deepEqual(parseRepositoryReference('https://github.com/acme/widgets.git'), { owner: 'acme', repository: 'widgets', fullName: 'acme/widgets' });
  assert.equal(parseRepositoryReference('acme'), null);
  assert.equal(parseRepositoryReference('acme/widgets/extra'), null);
});

test('ranks repository owner and public language/topic matches deterministically', () => {
  const results = rankDevelopersForRepository(repository, [
    { login: 'zeta', topLanguage: 'TypeScript', score: 20, totalCommits: 10 },
    { login: 'acme', topLanguage: 'Go', topRepos: [{ name: 'widgets' }], score: 1 },
    { login: 'alpha', topLanguage: 'TypeScript', score: 20, bio: 'Developer tools maintainer' },
    { login: 'unrelated', topLanguage: 'Python', score: 100 },
  ], 20);

  assert.deepEqual(results.map(result => result.login), ['acme', 'alpha', 'zeta']);
  assert.match(results[0].whyMatched.join(' '), /owner of acme\/widgets/);
  assert.match(results[1].whyMatched.join(' '), /contributor to acme\/widgets \(7 contributions\)/);
  assert.equal('matchStrength' in results[0], false);
  assert.equal(results[0].availableForAgents, false);

  const bounded = rankDevelopersForRepository(repository, Array.from({ length: 25 }, (_, index) => ({
    login: `developer-${String(index).padStart(2, '0')}`,
    topLanguage: 'TypeScript',
  })), 99);
  assert.equal(bounded.length, 20);
});

test('repository matching API returns bounded evidence-backed public results', async () => {
  let queryDefinition;
  let githubCalls = 0;
  const cache = new Map();
  const handler = createRepositoryMatchesHandler({
    cache,
    fetchImpl: async url => {
      githubCalls += 1;
      return String(url).includes('/contributors')
        ? Response.json([{ login: 'contributor', contributions: 12 }])
        : Response.json({
          full_name: 'acme/widgets',
          name: 'widgets',
          owner: { login: 'acme' },
          html_url: 'https://github.com/acme/widgets',
          contributors_url: 'https://api.github.com/repos/acme/widgets/contributors',
          language: 'TypeScript',
          topics: ['developer-tools'],
          stargazers_count: 42,
          private: false,
        });
    },
    getContainer: () => ({
      items: {
        query(definition) {
          queryDefinition = definition;
          return { fetchAll: async () => ({ resources: [{ login: 'acme', topLanguage: 'TypeScript' }] }) };
        },
      },
    }),
  });
  const response = await handler(new Request('https://www.devglobe.dev/api/repository-matches?repository=acme/widgets&top=99'));
  const body = await response.json();
  await handler(new Request('https://www.devglobe.dev/api/repository-matches?repository=acme/widgets'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=900, stale-while-revalidate=3600');
  assert.equal(body.repository.fullName, 'acme/widgets');
  assert.equal(body.repository.contributorCount, 1);
  assert.equal('contributors' in body.repository, false);
  assert.equal(body.count, 1);
  assert.equal(githubCalls, 2);
  assert.match(queryDefinition.query, /SELECT TOP 100/);
  assert.deepEqual(queryDefinition.parameters.map(parameter => parameter.name), ['@owner', '@contributors', '@language', '@topic0']);
});

test('repository matching API distinguishes invalid and missing repositories', async () => {
  const handler = createRepositoryMatchesHandler({
    fetchImpl: async () => new Response('{}', { status: 404 }),
    getContainer: () => ({ items: {} }),
  });
  const invalid = await handler(new Request('https://www.devglobe.dev/api/repository-matches?repository=not-a-repository'));
  const missing = await handler(new Request('https://www.devglobe.dev/api/repository-matches?repository=acme/missing'));

  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'invalid_repository');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'repository_not_found');
});