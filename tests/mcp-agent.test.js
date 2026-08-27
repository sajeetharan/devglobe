import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRequestValidationError,
  authenticateAgent,
  createIntroductionDocument,
  hashAgentToken,
  normalizeIntroductionDecision,
  normalizeIntroductionRequest,
  parseAgentKeys,
} from '../lib/agent-introductions.js';
import { createDevGlobeMcpClient } from '../lib/devglobe-mcp-client.js';

test('authenticates configured agents without exposing token hashes', () => {
  const keys = parseAgentKeys(JSON.stringify([{
    id: 'agent-1',
    name: 'Build Agent',
    owner: 'Example Org',
    tokenHash: hashAgentToken('secret-token'),
  }]));

  assert.deepEqual(authenticateAgent('Bearer secret-token', keys), {
    id: 'agent-1',
    name: 'Build Agent',
    owner: 'Example Org',
  });
  assert.equal(authenticateAgent('Bearer wrong-token', keys), null);
});

test('validates and creates expiring pending introduction requests', () => {
  const input = normalizeIntroductionRequest({
    developerLogin: 'octocat',
    reason: 'We need help maintaining our React component library.',
    project: 'UI Platform',
  });
  const document = createIntroductionDocument(input, {
    id: 'agent-1', name: 'Build Agent', owner: 'Example Org',
  }, new Date('2026-08-13T12:00:00.000Z'));

  assert.equal(document.status, 'pending');
  assert.equal(document.developerLogin, 'octocat');
  assert.equal(document.expiresAt, '2026-08-27T12:00:00.000Z');
  assert.equal('tokenHash' in document.requesterAgent, false);
});

test('rejects invalid introduction content', () => {
  assert.throws(() => normalizeIntroductionRequest({
    developerLogin: 'invalid login', reason: 'too short', project: 'x',
  }), AgentRequestValidationError);
});

test('accepts only terminal developer decisions with UUID request ids', () => {
  assert.deepEqual(normalizeIntroductionDecision({
    id: 'e6fa6dc6-64df-48c4-8597-c70bfe089bec',
    status: 'accepted',
  }), {
    id: 'e6fa6dc6-64df-48c4-8597-c70bfe089bec',
    status: 'accepted',
  });
  assert.throws(() => normalizeIntroductionDecision({ id: 'bad', status: 'pending' }), AgentRequestValidationError);
});

test('MCP client filters hydrated public profiles by agent availability', async () => {
  const responses = new Map([
    ['/api/search', { results: [{ login: 'open-dev' }, { login: 'closed-dev' }] }],
    ['/api/developer?id=open-dev', { login: 'open-dev', aiProfile: { acceptsAgentRequests: true } }],
    ['/api/developer?id=closed-dev', { login: 'closed-dev' }],
  ]);
  const fetchImpl = async url => {
    const parsed = new URL(url);
    const key = parsed.pathname === '/api/search' ? parsed.pathname : `${parsed.pathname}?${parsed.searchParams}`;
    return new Response(JSON.stringify(responses.get(key)), { status: 200 });
  };
  const client = createDevGlobeMcpClient({ baseUrl: 'http://localhost:3000', fetchImpl });

  const results = await client.searchDevelopers({ query: 'React', availableForAgents: true, limit: 10 });
  assert.deepEqual(results.map(result => result.login), ['open-dev']);
});

test('MCP client filters and explains active opportunity matches', async () => {
  const opportunityPreferences = {
    enabled: true,
    types: ['employment', 'contract'],
    roles: ['Staff engineer'],
    locations: ['Colombo'],
    workModes: ['remote'],
    expiresAt: '2026-09-19T12:00:00.000Z',
    source: 'self-declared',
  };
  const responses = new Map([
    ['/api/search', { results: [{ login: 'job-seeker' }, { login: 'oss-only' }] }],
    ['/api/developer?id=job-seeker', { login: 'job-seeker', aiProfile: { acceptsAgentRequests: true, opportunityPreferences } }],
    ['/api/developer?id=oss-only', { login: 'oss-only', aiProfile: { acceptsAgentRequests: true, opportunityPreferences: { ...opportunityPreferences, types: ['open-source'] } } }],
  ]);
  const fetchImpl = async url => {
    const parsed = new URL(url);
    const key = parsed.pathname === '/api/search' ? parsed.pathname : `${parsed.pathname}?${parsed.searchParams}`;
    return new Response(JSON.stringify(responses.get(key)), { status: 200 });
  };
  const client = createDevGlobeMcpClient({ baseUrl: 'http://localhost:3000', fetchImpl });

  const results = await client.searchDevelopers({ query: 'TypeScript', opportunityType: 'employment', limit: 10 });

  assert.deepEqual(results.map(result => result.login), ['job-seeker']);
  assert.deepEqual(results[0].opportunityPreferences, opportunityPreferences);
  assert.ok(results[0].whyMatched.includes('Developer is actively open to employment opportunities'));
});

test('MCP client returns bounded trending developers with profile URLs', async () => {
  let requestedUrl;
  const client = createDevGlobeMcpClient({
    baseUrl: 'https://www.devglobe.dev',
    fetchImpl: async url => {
      requestedUrl = new URL(url);
      return Response.json({
        windowDays: 30,
        gainers: [{ login: 'rising-dev', score: 88, scoreDelta: 4.2 }],
        newEntries: [],
        hasHistory: true,
      });
    },
  });

  const result = await client.getTrendingDevelopers({ days: 30, limit: 5 });

  assert.equal(requestedUrl.pathname, '/api/trending');
  assert.equal(requestedUrl.searchParams.get('days'), '30');
  assert.equal(result.gainers[0].profileUrl, 'https://www.devglobe.dev/developer/rising-dev');
});

test('MCP client returns similar developers without exposing embeddings', async () => {
  let requestedUrl;
  const client = createDevGlobeMcpClient({
    baseUrl: 'https://www.devglobe.dev',
    fetchImpl: async url => {
      requestedUrl = new URL(url);
      return Response.json({
        source: 'octocat',
        count: 1,
        results: [{ login: 'similar-dev', similarity: 'Very similar', reasons: ['Both work primarily in JavaScript'] }],
      });
    },
  });

  const result = await client.findSimilarDevelopers({ login: 'octocat', limit: 5 });

  assert.equal(requestedUrl.pathname, '/api/similar-developers');
  assert.equal(requestedUrl.searchParams.get('login'), 'octocat');
  assert.equal(requestedUrl.searchParams.get('top'), '5');
  assert.equal(result.results[0].profileUrl, 'https://www.devglobe.dev/developer/similar-dev');
  assert.equal('embedding' in result.results[0], false);
});

test('MCP client requires an issued token for introductions', async () => {
  const client = createDevGlobeMcpClient({ baseUrl: 'https://devglobe.dev', fetchImpl: () => {} });
  await assert.rejects(() => client.requestIntroduction({}), /DEVGLOBE_AGENT_TOKEN/);
});

test('MCP client authenticates introduction status requests', async () => {
  let receivedAuthorization;
  const client = createDevGlobeMcpClient({
    baseUrl: 'https://devglobe.dev',
    agentToken: 'issued-token',
    fetchImpl: async (url, options) => {
      receivedAuthorization = options.headers.Authorization;
      return new Response(JSON.stringify({ request: { status: 'pending' } }), { status: 200 });
    },
  });

  const result = await client.getIntroductionStatus({
    id: 'e6fa6dc6-64df-48c4-8597-c70bfe089bec',
    developerLogin: 'octocat',
  });
  assert.equal(receivedAuthorization, 'Bearer issued-token');
  assert.equal(result.request.status, 'pending');
});
