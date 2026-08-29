import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import nextConfig from '../next.config.js';
import { GET as getSkillIndex } from '../app/.well-known/agent-skills/index.json/route.js';
import { GET as getApiCatalog } from '../app/.well-known/api-catalog/route.js';
import { GET as getMcpCard } from '../app/.well-known/mcp/server-card.json/route.js';
import { GET as getProtectedResource } from '../app/.well-known/oauth-protected-resource/route.js';
import { GET as getOpenApi } from '../app/openapi.json/route.js';
import { GET as getAuth } from '../app/auth.md/route.js';
import { GET as getRobots } from '../app/robots.txt/route.js';
import { GET as getUnknownApi } from '../app/api/[...path]/route.js';
import { GET as searchDevelopers } from '../app/api/search/route.js';
import { GET as getDeveloper } from '../app/api/developer/route.js';
import { dynamic as mcpDocsRendering, GET as getMcpDocs } from '../app/docs/mcp-server/route.js';
import { middleware } from '../middleware.js';

test('advertises agent discovery resources from the homepage', async () => {
  const [{ headers }] = await nextConfig.headers();
  const link = headers.find(({ key }) => key === 'Link').value;

  assert.match(link, /rel="api-catalog"/);
  assert.match(link, /openapi\.json.*rel="service-desc"/);
  assert.match(link, /mcp\/server-card\.json/);
  assert.match(link, /agent-skills\/index\.json/);
  assert.match(link, /oauth-protected-resource.*rel="oauth-protected-resource"/);
  assert.match(link, /auth\.md/);
});

test('serves a valid API catalog and OpenAPI description', async () => {
  const catalogResponse = getApiCatalog();
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.headers.get('content-type'), 'application/linkset+json');
  assert.equal(catalog.linkset[0].anchor.endsWith('/mcp'), true);

  const openApiResponse = getOpenApi();
  const openApi = await openApiResponse.json();
  assert.equal(openApiResponse.headers.get('content-type'), 'application/openapi+json');
  assert.equal(openApi.openapi, '3.1.0');
  assert.deepEqual(Object.keys(openApi.paths), ['/api/search', '/api/developer', '/mcp']);
  assert.equal(openApi.components.securitySchemes.agentBearer.scheme, 'bearer');
  assert.deepEqual(openApi['x-scopes-supported'], [
    'developers:read',
    'introductions:read',
    'introductions:write',
  ]);
  assert.equal(openApi.components.schemas.Error.required.includes('hint'), true);
});

test('describes the MCP server tools and authentication boundary', async () => {
  const card = await getMcpCard().json();
  assert.equal(card.transport.type, 'streamable-http');
  assert.equal(card.serverInfo.version, '1.4.0');
  assert.equal(card.repository.url, 'https://github.com/sajeetharan/devglobe');
  assert.deepEqual(card.capabilities.resources.uris, ['devglobe://project']);
  assert.deepEqual(card.capabilities.prompts.names, ['find-developers', 'find-collaborators', 'find-contribution']);
  assert.equal(card.capabilities.tools.names.length, 7);
  assert.deepEqual(card.authentication.publicTools, [
    'search_developers',
    'get_developer_profile',
    'find_similar_developers',
    'get_trending_developers',
    'preview_contribution_mission',
  ]);
  assert.equal(card.authentication.scheme, 'bearer');
  assert.equal(card.authentication.scopes.introductionsWrite, 'introductions:write');

  const auth = await getAuth().text();
  assert.match(auth, /pre-issued agent credentials/);
  assert.match(auth, /does not operate an OAuth authorization server/);
  assert.match(auth, /introductions:write/);
});

test('publishes MCP Registry metadata within schema limits', async () => {
  const registry = JSON.parse(await fs.readFile('server.json', 'utf8'));
  const card = await getMcpCard().json();

  assert.ok(registry.description.length > 0);
  assert.ok(registry.description.length <= 100);
  assert.equal(registry.version, card.serverInfo.version);
  assert.equal(registry.repository.url, card.repository.url);
  assert.deepEqual(registry.remotes, [{
    type: 'streamable-http',
    url: 'https://www.devglobe.dev/mcp',
  }]);
});

test('publishes RFC 9728 protected-resource scopes without claiming an authorization server', async () => {
  const response = getProtectedResource();
  const metadata = await response.json();

  assert.equal(metadata.resource.endsWith('/mcp'), true);
  assert.deepEqual(metadata.scopes_supported, [
    'developers:read',
    'introductions:read',
    'introductions:write',
  ]);
  assert.deepEqual(metadata.bearer_methods_supported, ['header']);
  assert.equal('authorization_servers' in metadata, false);
});

test('homepage source contains meaningful server-rendered content for no-JavaScript clients', async () => {
  const source = await fs.readFile('app/page.jsx', 'utf8');
  const summary = source.match(/<section className="agent-readable-summary"[\s\S]*?<\/section>/)?.[0] || '';
  const text = summary.replace(/<[^>]+>/g, ' ').replace(/[{}\n]+/g, ' ').replace(/\s+/g, ' ').trim();

  assert.match(summary, /<h1[^>]*>/);
  assert.ok(text.length >= 500, `Expected at least 500 characters, received ${text.length}`);
  assert.match(text, /public API or stateless MCP endpoint/);
});

test('not-found page provides markdown-style recovery links', async () => {
  const source = await fs.readFile('app/not-found.jsx', 'utf8');
  assert.match(source, /404: Resource not found/);
  assert.match(source, /# Where to look next/);
  assert.match(source, /\/sitemap\.xml/);
  assert.match(source, /\/llms\.txt/);
  assert.match(source, /\/openapi\.json/);
});

test('unknown and invalid public API requests return structured JSON errors', async () => {
  const responses = [
    getUnknownApi(new Request('https://www.devglobe.dev/api/does-not-exist')),
    await searchDevelopers(new Request('https://www.devglobe.dev/api/search')),
    await getDeveloper(new Request('https://www.devglobe.dev/api/developer')),
  ];

  for (const response of responses) {
    const body = await response.json();
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(typeof body.error, 'string');
    assert.equal(typeof body.code, 'string');
    assert.equal(typeof body.hint, 'string');
  }
  assert.equal(responses[0].status, 404);
  assert.equal(responses[1].status, 400);
  assert.equal(responses[2].status, 400);
});

test('publishes an Agent Skills digest matching the served artifact', async () => {
  const skill = await fs.readFile('.agents/skills/devglobe/SKILL.md', 'utf8');
  const expected = `sha256:${createHash('sha256').update(skill).digest('hex')}`;
  const response = await getSkillIndex();
  const index = await response.json();

  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.equal(index.skills[0].name, 'devglobe');
  assert.equal(index.skills[0].digest, expected);
});

test('publishes Content Signals in robots.txt', async () => {
  const response = getRobots();
  const robots = await response.text();
  assert.match(robots, /Content-Signal: ai-train=no, search=yes, ai-input=yes/);
});

test('negotiates a Markdown homepage with token metadata', async () => {
  const response = middleware(new Request('https://www.devglobe.dev/', {
    headers: { Accept: 'text/markdown' },
  }));

  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.ok(Number(response.headers.get('x-markdown-tokens')) > 0);
  assert.match(await response.text(), /# DevGlobe/);
});

test('includes MCP documentation in standalone and Docker build inputs', async () => {
  assert.equal(mcpDocsRendering, 'force-static');
  assert.deepEqual(nextConfig.outputFileTracingIncludes['/docs/mcp-server'], ['./docs/mcp-server.md']);

  const dockerIgnore = await fs.readFile('.dockerignore', 'utf8');
  assert.match(dockerIgnore, /^!docs\/mcp-server\.md$/m);

  const response = await getMcpDocs();
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.match(await response.text(), /^# DevGlobe MCP Server/m);
});