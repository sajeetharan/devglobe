import test from 'node:test';
import assert from 'node:assert/strict';
import { submitNomination } from '../lib/nominate.js';

async function withCosmosEnvironment(run) {
  const originalEndpoint = process.env.COSMOS_ENDPOINT;
  const originalKey = process.env.COSMOS_KEY;
  process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
  process.env.COSMOS_KEY = 'test-key';

  try {
    await run();
  } finally {
    if (originalEndpoint === undefined) delete process.env.COSMOS_ENDPOINT;
    else process.env.COSMOS_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.COSMOS_KEY;
    else process.env.COSMOS_KEY = originalKey;
  }
}

test('requires explicit email consent before nomination network calls', async () => {
  await withCosmosEnvironment(async () => {
    const result = await submitNomination({
      username: 'octocat',
      email: 'dev@example.com',
      emailConsent: false,
    });

    assert.equal(result.status, 400);
    assert.match(result.body.error, /consent/i);
  });
});

test('rejects invalid nomination email before network calls', async () => {
  await withCosmosEnvironment(async () => {
    const result = await submitNomination({
      username: 'octocat',
      email: 'not-an-email',
      emailConsent: true,
    });

    assert.equal(result.status, 400);
    assert.match(result.body.error, /valid email/i);
  });
});