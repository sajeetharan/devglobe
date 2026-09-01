import test from 'node:test';
import assert from 'node:assert/strict';
import functionAgentSignals from '../functions/shared/repository-agent-signals.js';
import { createRepositoryAgentSignalsHandler } from '../app/api/repository-agent-signals/route.js';
import {
  detectRepositoryAgentSignals,
  isValidGitHubLogin,
  MAX_AGENT_SIGNAL_PATHS,
  MAX_AGENT_SIGNAL_REPOSITORIES,
} from '../lib/repository-agent-signals.js';

const { scanDeveloperRepositorySignals } = functionAgentSignals;

test('detects agent configuration paths without reading repository content', () => {
  const signals = detectRepositoryAgentSignals([{
    fullName: 'octocat/hello-world',
    paths: [
      'README.md',
      '.github/copilot-instructions.md',
      '.github/agents/reviewer.agent.md',
      'CLAUDE.md',
      '.cursor/rules/project.mdc',
      'packages/api/AGENTS.md',
      'GEMINI.md',
    ],
  }]);

  assert.deepEqual(signals.map(signal => signal.id), [
    'claude-code',
    'cursor',
    'custom-agent',
    'gemini-cli',
    'github-copilot',
  ]);
  assert.equal(signals.find(signal => signal.id === 'github-copilot').repositories[0].paths.length, 2);
  assert.equal(JSON.stringify(signals).includes('content'), false);
});

test('deduplicates evidence and enforces repository and path bounds', () => {
  const repositories = Array.from({ length: MAX_AGENT_SIGNAL_REPOSITORIES + 3 }, (_, index) => ({
    fullName: `owner/repository-${index}`,
    paths: Array.from({ length: MAX_AGENT_SIGNAL_PATHS + 3 }, (__, pathIndex) => `.github/agents/agent-${pathIndex}.agent.md`),
  }));
  const [signal] = detectRepositoryAgentSignals(repositories);

  assert.equal(signal.repositories.length, MAX_AGENT_SIGNAL_REPOSITORIES);
  assert.equal(signal.repositories[0].paths.length, MAX_AGENT_SIGNAL_PATHS);
});

test('validates GitHub logins before making upstream requests', () => {
  assert.equal(isValidGitHubLogin('octocat'), true);
  assert.equal(isValidGitHubLogin('valid-login-2'), true);
  assert.equal(isValidGitHubLogin('-invalid'), false);
  assert.equal(isValidGitHubLogin('owner/repository'), false);
});

test('API scans bounded public owner repositories and caches path evidence', async () => {
  let calls = 0;
  const handler = createRepositoryAgentSignalsHandler({
    cache: new Map(),
    token: 'test-token',
    fetchImpl: async url => {
      calls += 1;
      if (String(url).includes('/users/')) return Response.json([
        { full_name: 'octocat/agents', default_branch: 'main', private: false, fork: false, archived: false },
        { full_name: 'octocat/fork', default_branch: 'main', private: false, fork: true, archived: false },
      ]);
      return Response.json({ tree: [
        { type: 'blob', path: 'CLAUDE.md' },
        { type: 'blob', path: '.github/copilot-instructions.md' },
        { type: 'blob', path: 'src/index.js' },
      ] });
    },
  });
  const request = new Request('https://www.devglobe.dev/api/repository-agent-signals?login=OctoCat');
  const response = await handler(request);
  const body = await response.json();
  await handler(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=604800, stale-while-revalidate=86400');
  assert.equal(body.login, 'octocat');
  assert.equal(body.scannedRepositories, 1);
  assert.deepEqual(body.signals.map(signal => signal.id), ['claude-code', 'github-copilot']);
  assert.equal(calls, 2);
});

test('API rejects malformed usernames before GitHub lookup', async () => {
  let called = false;
  const handler = createRepositoryAgentSignalsHandler({ fetchImpl: async () => { called = true; } });
  const response = await handler(new Request('https://www.devglobe.dev/api/repository-agent-signals?login=owner/repository'));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'invalid_login');
  assert.equal(called, false);
});

test('scheduled scanner stores only filename evidence from eligible owner repositories', async () => {
  const calls = [];
  const result = await scanDeveloperRepositorySignals(async url => {
    calls.push(String(url));
    if (String(url).includes('/users/')) return Response.json([
      { full_name: 'octocat/agents', default_branch: 'main', private: false, fork: false, archived: false },
      { full_name: 'octocat/private', default_branch: 'main', private: true, fork: false, archived: false },
      { full_name: 'octocat/fork', default_branch: 'main', private: false, fork: true, archived: false },
    ]);
    return Response.json({ tree: [
      { type: 'blob', path: '.github/copilot-instructions.md' },
      { type: 'blob', path: 'CLAUDE.md' },
      { type: 'tree', path: '.cursor' },
    ] });
  }, 'octocat', 'test-token');

  assert.equal(result.scannedRepositories, 1);
  assert.deepEqual(result.signals.map(signal => signal.id), ['claude-code', 'github-copilot']);
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(result).includes('content'), false);
});

test('scheduled scanner fails the profile when a repository tree cannot be read', async () => {
  await assert.rejects(
    scanDeveloperRepositorySignals(async url => String(url).includes('/users/')
      ? Response.json([{ full_name: 'octocat/agents', default_branch: 'main', private: false, fork: false, archived: false }])
      : new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }), 'octocat', 'test-token'),
    error => error.status === 403 && error.rateLimitRemaining === 0,
  );
});