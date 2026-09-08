const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CODING_ACTIVITY_WINDOW_MS,
  agentSetupUrl,
  codingStatsUrl,
  editorName,
  identityCardUrl,
  isCodingActivityRecent,
  liveGlobeUrl,
  mcpConfiguration,
  normalizeLogin,
  normalizeResults,
  presenceTokenUrl,
  presenceUrl,
  profileUrl,
  resolveBaseUrl,
  searchUrl,
} = require('../src/devglobe');

test('detects compatible VS Code editor families', () => {
  assert.equal(editorName('Visual Studio Code'), 'VS Code');
  assert.equal(editorName('Visual Studio Code - Insiders'), 'VS Code Insiders');
  assert.equal(editorName('Cursor'), 'Cursor');
  assert.equal(editorName('Windsurf'), 'Windsurf');
  assert.equal(editorName('VSCodium'), 'VSCodium');
});

test('treats editor activity as current for one minute', () => {
  assert.equal(CODING_ACTIVITY_WINDOW_MS, 60_000);
  assert.equal(isCodingActivityRecent(1_000, 61_000), true);
  assert.equal(isCodingActivityRecent(1_000, 61_001), false);
  assert.equal(isCodingActivityRecent(0, 1_000), true);
  assert.equal(isCodingActivityRecent(Number.NaN, 1_000), false);
});

test('validates production and local base URLs', () => {
  assert.equal(resolveBaseUrl('https://www.devglobe.dev/'), 'https://www.devglobe.dev');
  assert.equal(resolveBaseUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.throws(() => resolveBaseUrl('http://example.com'), /HTTPS/);
  assert.throws(() => resolveBaseUrl('https://user@example.com'), /without credentials/);
});

test('builds attributed profile, card, setup, activation, and search URLs', () => {
  const profile = new URL(profileUrl('https://www.devglobe.dev', 'sajeetharan'));
  assert.equal(profile.pathname, '/developer/sajeetharan');
  assert.equal(profile.searchParams.get('utm_source'), 'vscode_extension');
  assert.equal(profile.searchParams.get('utm_medium'), 'marketplace');

  assert.equal(new URL(identityCardUrl('https://www.devglobe.dev', '@sajeetharan')).pathname, '/share/sajeetharan');
  assert.equal(new URL(agentSetupUrl('https://www.devglobe.dev')).pathname, '/agents');
  assert.equal(new URL(codingStatsUrl('https://www.devglobe.dev')).pathname, '/coding-stats');
  const liveGlobe = new URL(liveGlobeUrl('https://www.devglobe.dev'));
  assert.equal(liveGlobe.pathname, '/space');
  assert.equal(liveGlobe.searchParams.get('utm_source'), 'vscode_extension');

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