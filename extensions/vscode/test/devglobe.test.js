const assert = require('node:assert/strict');
const test = require('node:test');
const {
  agentSetupUrl,
  identityCardUrl,
  mcpConfiguration,
  normalizeLogin,
  normalizeResults,
  presenceTokenUrl,
  presenceUrl,
  profileUrl,
  resolveBaseUrl,
  searchUrl,
} = require('../src/devglobe');

test('validates production and local base URLs', () => {
  assert.equal(resolveBaseUrl('https://www.devglobe.dev/'), 'https://www.devglobe.dev');
  assert.equal(resolveBaseUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.throws(() => resolveBaseUrl('http://example.com'), /HTTPS/);
  assert.throws(() => resolveBaseUrl('https://user@example.com'), /without credentials/);
});

test('builds attributed profile, card, setup, and search URLs', () => {
  const profile = new URL(profileUrl('https://www.devglobe.dev', 'sajeetharan'));
  assert.equal(profile.pathname, '/developer/sajeetharan');
  assert.equal(profile.searchParams.get('utm_source'), 'vscode_extension');
  assert.equal(profile.searchParams.get('utm_medium'), 'marketplace');

  assert.equal(new URL(identityCardUrl('https://www.devglobe.dev', '@sajeetharan')).pathname, '/share/sajeetharan');
  assert.equal(new URL(agentSetupUrl('https://www.devglobe.dev')).pathname, '/agents');

  const search = new URL(searchUrl('https://www.devglobe.dev', 'TypeScript Canada'));
  assert.equal(search.pathname, '/api/search');
  assert.equal(search.searchParams.get('q'), 'TypeScript Canada');
  assert.equal(search.searchParams.get('mode'), 'text');
  assert.equal(search.searchParams.get('top'), '10');
});

test('creates a VS Code Streamable HTTP MCP configuration', () => {
  assert.deepEqual(JSON.parse(mcpConfiguration('https://www.devglobe.dev')), {
    servers: {
      devglobe: {
        type: 'http',
        url: 'https://www.devglobe.dev/mcp',
      },
    },
  });
});

test('normalizes public search results and drops invalid records', () => {
  assert.deepEqual(normalizeResults({ results: [
    { login: 'octocat', name: 'The Octocat', location: 'Internet', topLanguage: 'Ruby', score: '91' },
    { login: 'not valid!' },
    null,
  ] }), [{
    login: 'octocat',
    name: 'The Octocat',
    location: 'Internet',
    language: 'Ruby',
    score: 91,
  }]);
  assert.throws(() => normalizeResults({}), /unexpected search response/);
  assert.throws(() => normalizeLogin('not valid!'), /valid GitHub login/);
});

test('builds same-origin live presence endpoints without attribution parameters', () => {
  assert.equal(presenceTokenUrl('https://www.devglobe.dev'), 'https://www.devglobe.dev/api/presence/token');
  assert.equal(presenceUrl('http://localhost:3000'), 'http://localhost:3000/api/presence');
});