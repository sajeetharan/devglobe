import test from 'node:test';
import assert from 'node:assert/strict';
import repositoryAgentIngest from '../functions/repository-agent-ingest/index.js';

function logger() {
  const entries = [];
  const log = (message, details) => entries.push({ level: 'info', message, details });
  log.warn = (message, details) => entries.push({ level: 'warn', message, details });
  return { log, entries };
}

test('scheduled ingestion patches filename-only repository evidence by location partition', async () => {
  const patches = [];
  const { log, entries } = logger();
  const container = {
    items: {
      query: () => ({ fetchAll: async () => ({ resources: [
        { id: 'octocat', login: 'octocat', location: 'San Francisco, USA' },
      ] }) }),
    },
    item: (id, partitionKey) => ({
      patch: async value => patches.push({ id, partitionKey, value }),
    }),
  };
  const fetchImpl = async url => String(url).includes('/users/')
    ? Response.json([{ full_name: 'octocat/agents', default_branch: 'main', private: false, fork: false, archived: false }])
    : Response.json({ tree: [{ type: 'blob', path: '.github/copilot-instructions.md' }] });

  await repositoryAgentIngest({ log }, {
    container,
    fetchImpl,
    token: 'test-token',
    now: () => new Date('2026-09-01T06:00:00.000Z'),
  });

  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, 'octocat');
  assert.equal(patches[0].partitionKey, 'San Francisco, USA');
  assert.deepEqual(patches[0].value.operations[0].value.toolIds, ['github-copilot']);
  assert.deepEqual(patches[0].value.operations[0].value.signals.map(signal => signal.id), ['github-copilot']);
  assert.equal(patches[0].value.operations[0].value.scannedAt, '2026-09-01T06:00:00.000Z');
  assert.equal(JSON.stringify(patches).includes('content'), false);
  assert.deepEqual(entries.at(-1).details, {
    selected: 1,
    updated: 1,
    detected: 1,
    failed: 0,
    cutoff: '2026-08-25T06:00:00.000Z',
  });
});

test('scheduled ingestion skips safely when the GitHub token is absent', async () => {
  const { log, entries } = logger();
  await repositoryAgentIngest({ log }, {
    container: { items: { query: () => { throw new Error('should not query'); } } },
    token: '',
  });

  assert.match(entries[0].message, /GITHUB_TOKEN/);
});