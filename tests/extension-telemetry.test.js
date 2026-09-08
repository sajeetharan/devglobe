import test from 'node:test';
import assert from 'node:assert/strict';
import { recordExtensionEvent } from '../lib/extension-telemetry.js';

test('records extension milestones without storing the raw developer login', async () => {
  let stored;
  const container = {
    items: {
      async create(event) {
        stored = event;
        return { resource: event };
      },
    },
  };

  const recorded = await recordExtensionEvent('presence_started', 'OctoCat', {
    source: 'vscode_extension',
  }, {
    container,
    secret: 'test-secret',
    now: '2026-09-08T12:00:00.000Z',
  });

  assert.equal(recorded, true);
  assert.equal(stored.targetLogin, null);
  assert.equal(stored.partitionKey, 'day:2026-09-08');
  assert.equal(JSON.stringify(stored).toLowerCase().includes('octocat'), false);
  assert.deepEqual(stored.properties, { source: 'vscode_extension' });
});