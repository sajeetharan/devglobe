import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpOptions, handleRemoteMcpRequest } from '../lib/remote-mcp.js';
import { createMcpCallerHash, recordMcpMetric } from '../lib/mcp-observability.js';

const MCP_HEADERS = {
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
  'Mcp-Protocol-Version': '2025-06-18',
};

function mcpRequest(body, headers = {}) {
  return new Request('http://localhost:3000/mcp', {
    method: 'POST',
    headers: { ...MCP_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
}

async function readMcpResponse(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  return response.json();
}

test('remote MCP initializes and lists DevGlobe tools without a session', async () => {
  const initialization = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test-agent', version: '1.0.0' },
    },
  })));
  assert.equal(initialization.result.serverInfo.name, 'devglobe');
  assert.equal(initialization.result.serverInfo.version, '1.5.0');
  assert.equal(initialization.result.serverInfo.websiteUrl, 'https://www.devglobe.dev');
  assert.match(initialization.result.instructions, /github\.com\/sajeetharan\/devglobe/);
  assert.deepEqual(initialization.result.capabilities.resources, { listChanged: true });

  const listing = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
  })));
  assert.deepEqual(listing.result.tools.map(tool => tool.name), [
    'search_developers',
    'get_developer_profile',
    'find_similar_developers',
    'match_developers_to_repository',
    'get_trending_developers',
    'preview_contribution_mission',
    'request_introduction',
    'get_introduction_status',
  ]);
  assert.equal(listing.result.tools[0].annotations.readOnlyHint, true);
  assert.ok(listing.result.tools[0].outputSchema);
  assert.equal(listing.result.tools[5].annotations.idempotentHint, false);
  assert.equal(listing.result.tools[6].annotations.idempotentHint, false);

  const resources = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 3, method: 'resources/list', params: {},
  })));
  assert.deepEqual(resources.result.resources.map(resource => resource.uri), ['devglobe://project']);

  const project = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'devglobe://project' },
  })));
  const projectInfo = JSON.parse(project.result.contents[0].text);
  assert.equal(projectInfo.repository, 'https://github.com/sajeetharan/devglobe');
  assert.match(projectInfo.support, /star the repository/);

  const prompts = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 5, method: 'prompts/list', params: {},
  })));
  assert.deepEqual(prompts.result.prompts.map(prompt => prompt.name), [
    'find-developers',
    'find-collaborators',
    'find-contribution',
  ]);

  const prompt = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 6, method: 'prompts/get',
    params: { name: 'find-developers', arguments: { criteria: 'TypeScript maintainers', location: 'Canada' } },
  })));
  assert.match(prompt.result.messages[0].content.text, /search_developers/);
  assert.match(prompt.result.messages[0].content.text, /TypeScript maintainers in Canada/);
});

test('remote MCP exposes similar and trending discovery with usage counts', async () => {
  const metrics = [];
  const fetchImpl = async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/similar-developers') {
      return Response.json({
        source: 'octocat',
        count: 1,
        results: [{
          login: 'similar-dev',
          name: 'Similar Dev',
          location: null,
          topLanguage: 'JavaScript',
          score: 80,
          similarity: 'Very similar',
          reasons: ['Both work primarily in JavaScript'],
        }],
      });
    }
    return Response.json({
      windowDays: 30,
      generatedAt: '2026-08-27T12:00:00.000Z',
      gainers: [{
        login: 'rising-dev',
        name: 'Rising Dev',
        topLanguage: 'TypeScript',
        score: 90,
        globalRank: 12,
        scoreDelta: 5,
        rankDelta: 3,
        isNew: false,
        indicator: '↑3',
      }],
      newEntries: [],
      hasHistory: true,
    });
  };

  const similar = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 10, method: 'tools/call',
    params: { name: 'find_similar_developers', arguments: { login: 'octocat', limit: 5 } },
  }), { fetchImpl, metricRecorder: metric => metrics.push(metric) }));
  const trending = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 11, method: 'tools/call',
    params: { name: 'get_trending_developers', arguments: { days: 30, limit: 5 } },
  }), { fetchImpl, metricRecorder: metric => metrics.push(metric) }));

  assert.equal(similar.result.structuredContent.resultCount, 1);
  assert.equal(trending.result.structuredContent.resultCount, 1);
  assert.deepEqual(metrics.map(metric => [metric.tool, metric.resultCount]), [
    ['find_similar_developers', 1],
    ['get_trending_developers', 1],
  ]);
});

test('remote MCP advertises discovery metadata and records privacy-safe usage', async () => {
  const metrics = [];
  const request = mcpRequest({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: { name: 'search_developers', arguments: { query: 'private search wording' } },
  });
  const response = await handleRemoteMcpRequest(request, {
    fetchImpl: async url => new URL(url).pathname === '/api/search'
      ? Response.json({ results: [] })
      : Response.json({}),
    metricRecorder: metric => metrics.push(metric),
  });

  assert.match(response.headers.get('link'), /server-card\.json/);
  assert.match(response.headers.get('link'), /agent-skills/);
  assert.deepEqual(metrics[0].method, 'tools/call');
  assert.deepEqual(metrics[0].tool, 'search_developers');
  assert.equal(metrics[0].client, 'other');
  assert.equal(metrics[0].outcome, 'success');
  assert.equal(metrics[0].resultCount, 0);
  assert.doesNotMatch(JSON.stringify(metrics[0]), /private search wording/);
});

test('remote MCP attributes known clients without retaining raw user agents', async () => {
  const metrics = [];
  const response = await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 12, method: 'tools/list', params: {},
  }, { 'User-Agent': 'SmitheryBot/1.0 (+https://smithery.ai)' }), {
    metricRecorder: metric => metrics.push(metric),
  });

  assert.equal(response.status, 200);
  assert.equal(metrics[0].client, 'smithery');
  assert.doesNotMatch(JSON.stringify(metrics[0]), /SmitheryBot|smithery\.ai/);
});

test('MCP caller correlation rotates daily without retaining source identifiers', () => {
  const request = mcpRequest({ jsonrpc: '2.0', id: 14, method: 'tools/list', params: {} }, {
    'User-Agent': 'PrivateClient/1.0',
    'X-Forwarded-For': '192.0.2.10',
  });
  const first = createMcpCallerHash(request, 'test-secret', new Date('2026-08-28T12:00:00Z'));
  const sameDay = createMcpCallerHash(request, 'test-secret', new Date('2026-08-28T23:00:00Z'));
  const nextDay = createMcpCallerHash(request, 'test-secret', new Date('2026-08-29T00:00:00Z'));

  assert.equal(first, sameDay);
  assert.notEqual(first, nextDay);
  assert.doesNotMatch(first, /PrivateClient|192\.0\.2\.10/);
});

test('MCP logs retain only allow-listed error codes', () => {
  const logs = [];
  recordMcpMetric({ method: 'tools/call', client: 'other', outcome: 'error', durationMs: 5, errorCode: 'not_found' }, message => logs.push(JSON.parse(message)));
  recordMcpMetric({ method: 'tools/call', client: 'other', outcome: 'error', durationMs: 5, errorCode: 'private_detail' }, message => logs.push(JSON.parse(message)));

  assert.equal(logs[0].errorCode, 'not_found');
  assert.equal('errorCode' in logs[1], false);
});

test('MCP logs retain only the allow-listed project resource', async () => {
  const metrics = [];
  await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 15, method: 'resources/read', params: { uri: 'devglobe://project' },
  }), { metricRecorder: metric => metrics.push(metric) });
  await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 16, method: 'resources/read', params: { uri: 'private://resource' },
  }), { metricRecorder: metric => metrics.push(metric) });

  assert.equal(metrics[0].method, 'resources/read');
  assert.equal(metrics[0].resource, 'devglobe://project');
  assert.equal(metrics[1].method, 'resources/read');
  assert.equal(metrics[1].resource, null);
});

test('MCP classifies malformed and unknown requests with bounded error codes', async () => {
  const metrics = [];
  await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 17, method: 'tools/call', params: {},
  }), { metricRecorder: metric => metrics.push(metric) });
  await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 18, method: 'unknown/method', params: {},
  }), { metricRecorder: metric => metrics.push(metric) });

  assert.equal(metrics[0].errorCode, 'invalid_request');
  assert.equal(metrics[1].errorCode, 'not_found');
});

test('MCP logs only allow-listed prompt names', async () => {
  const metrics = [];
  await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 19, method: 'prompts/get',
    params: { name: 'find-contribution', arguments: { login: 'sajeetharan' } },
  }), { metricRecorder: metric => metrics.push(metric) });
  await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 20, method: 'prompts/get', params: { name: 'private-prompt' },
  }), { metricRecorder: metric => metrics.push(metric) });

  assert.equal(metrics[0].prompt, 'find-contribution');
  assert.equal(metrics[1].prompt, null);
});

test('remote MCP performs anonymous public developer discovery', async () => {
  const fetchImpl = async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/search') {
      return Response.json({ results: [{ login: 'open-dev' }] });
    }
    return Response.json({
      login: 'open-dev',
      location: 'Colombo, Sri Lanka',
      topLanguage: 'JavaScript',
      aiProfile: { acceptsAgentRequests: true },
    });
  };
  const response = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_developers',
      arguments: { query: 'React', availableForAgents: true },
    },
  }), { fetchImpl }));
  const developers = JSON.parse(response.result.content[0].text);
  assert.deepEqual(developers.map(developer => developer.login), ['open-dev']);
  assert.equal(response.result.structuredContent.resultCount, 1);
  assert.equal(response.result.structuredContent.results[0].profileUrl, 'http://localhost:3000/developer/open-dev');
  assert.match(response.result.structuredContent.results[0].whyMatched[0], /React/);
  assert.equal(response.result.structuredContent.results[0].availableForAgents, true);
});

test('remote MCP uses the configured public API instead of fetching its own origin', async () => {
  const requestedOrigins = [];
  const fetchImpl = async url => {
    const parsed = new URL(url);
    requestedOrigins.push(parsed.origin);
    return parsed.pathname === '/api/search'
      ? Response.json({ results: [{ login: 'open-dev' }] })
      : Response.json({ login: 'open-dev' });
  };

  await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'search_developers', arguments: { query: 'React', limit: 1 } },
  }), {
    fetchImpl,
    apiBaseUrl: 'https://devglobe-public-api.azurewebsites.net',
  }));

  assert.deepEqual(requestedOrigins, [
    'https://devglobe-public-api.azurewebsites.net',
    'https://devglobe-public-api.azurewebsites.net',
  ]);
});

test('remote MCP uses the internal app origin for same-app discovery tools', async () => {
  let requestedUrl;
  const response = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 13, method: 'tools/call',
    params: { name: 'get_trending_developers', arguments: { days: 30, limit: 5 } },
  }), {
    appApiBaseUrl: 'http://localhost:3000',
    fetchImpl: async url => {
      requestedUrl = new URL(url);
      return Response.json({ windowDays: 30, gainers: [], newEntries: [], hasHistory: true });
    },
  }));

  assert.equal(response.result.isError, undefined);
  assert.equal(requestedUrl.origin, 'http://localhost:3000');
  assert.equal(requestedUrl.pathname, '/api/trending');
});

test('remote MCP forwards bearer credentials for introduction tools', async () => {
  let authorization;
  let requestBody;
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).href, 'http://localhost:3000/api/agent/introductions');
    authorization = options.headers.Authorization;
    requestBody = JSON.parse(options.body);
    return Response.json({ request: { id: 'request-id', status: 'pending' } }, { status: 201 });
  };
  const response = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'request_introduction',
      arguments: {
        developerLogin: 'open-dev',
        reason: 'We need a maintainer for our open source React project.',
        project: 'Example UI',
      },
    },
  }, { Authorization: 'Bearer issued-agent-token' }), {
    fetchImpl,
    apiBaseUrl: 'https://devglobe-public-api.azurewebsites.net',
  }));
  assert.equal(response.result.isError, undefined);
  assert.equal(authorization, 'Bearer issued-agent-token');
  assert.equal(requestBody.developerLogin, 'open-dev');
});

test('remote MCP rejects untrusted browser origins and handles preflight', async () => {
  const denied = await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 5, method: 'tools/list', params: {},
  }, { Origin: 'https://malicious.example' }));
  assert.equal(denied.status, 403);

  const preflight = handleMcpOptions(new Request('http://localhost:3000/mcp', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('stateless remote MCP rejects standalone GET and DELETE sessions', async () => {
  for (const method of ['GET', 'DELETE']) {
    const response = await handleRemoteMcpRequest(new Request('http://localhost:3000/mcp', {
      method,
      headers: { Accept: 'application/json, text/event-stream' },
    }));
    assert.equal(response.status, 405);
  }
});

test('remote MCP previews a mission with per-caller quota identity', async () => {
  const metrics = [];
  let previewRequest;
  const fetchImpl = async (url, options) => {
    previewRequest = { url: new URL(url), options };
    return Response.json({
      profile: { login: 'octocat', name: 'The Octocat', avatarUrl: null },
      mission: {
        type: 'Improve documentation',
        durationMinutes: 15,
        opportunity: {
          id: '123',
          title: 'Improve setup instructions',
          url: 'https://github.com/org/repo/issues/123',
          repository: 'org/repo',
          language: 'JavaScript',
          labels: ['documentation', 'good first issue'],
          updatedAt: '2026-08-26T12:00:00.000Z',
          estimatedMinutes: 15,
          reasons: ['Uses JavaScript', 'beginner friendly'],
        },
      },
    });
  };

  const response = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 13, method: 'tools/call',
    params: { name: 'preview_contribution_mission', arguments: { login: 'octocat' } },
  }, { 'X-Azure-ClientIP': '203.0.113.10' }), {
    fetchImpl,
    metricRecorder: metric => metrics.push(metric),
  }));

  assert.equal(previewRequest.url.pathname, '/api/mission-preview');
  assert.match(previewRequest.options.headers['X-DevGlobe-Mcp-Preview-Identity'], /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(JSON.stringify(previewRequest.options), /203\.0\.113\.10/);
  assert.equal(response.result.structuredContent.resultCount, 1);
  assert.match(response.result.structuredContent.reservationDisclaimer, /does not reserve/);
  assert.equal(metrics[0].tool, 'preview_contribution_mission');
  assert.equal(metrics[0].resultCount, 1);
});

test('remote MCP matches developers to a public repository with bounded telemetry', async () => {
  const metrics = [];
  const response = await readMcpResponse(await handleRemoteMcpRequest(mcpRequest({
    jsonrpc: '2.0', id: 21, method: 'tools/call',
    params: { name: 'match_developers_to_repository', arguments: { repository: 'acme/widgets', limit: 5 } },
  }), {
    fetchImpl: async url => {
      assert.equal(new URL(url).pathname, '/api/repository-matches');
      return Response.json({
        repository: { owner: 'acme', name: 'widgets', fullName: 'acme/widgets', url: 'https://github.com/acme/widgets', description: null, language: 'TypeScript', topics: [], stars: 42, contributorCount: 1 },
        count: 1,
        results: [{ login: 'octocat', name: 'Octocat', whyMatched: ['Public language profile includes TypeScript'], publicEvidence: [], dataFreshness: { updatedAt: null, status: 'unknown' }, availableForAgents: false }],
      });
    },
    metricRecorder: metric => metrics.push(metric),
  }));

  assert.equal(response.result.structuredContent.resultCount, 1);
  assert.equal(response.result.structuredContent.results[0].profileUrl, 'http://localhost:3000/developer/octocat');
  assert.equal(metrics[0].tool, 'match_developers_to_repository');
  assert.doesNotMatch(JSON.stringify(metrics[0]), /acme|widgets/);
});