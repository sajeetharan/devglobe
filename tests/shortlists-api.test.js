import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortlistHandlers } from '../app/api/shortlists/route.js';
import { createSharedShortlistHandler } from '../app/api/shortlists/shared/route.js';
import { hashShortlistShareToken } from '../lib/shortlists.js';

const ID = '26ec6492-8057-40b1-b53c-9fb6d14fffa7';
const TOKEN = 'trusted-read-only-token-123456789';

function request(method, body) {
  return new Request('https://www.devglobe.dev/api/shortlists', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test('shortlist owner routes reject unauthenticated access before storage', async () => {
  let accessed = false;
  const handlers = createShortlistHandlers({
    getAuthenticatedSession: async () => null,
    loadWatchlist: async () => { accessed = true; },
    mutate: async () => { accessed = true; },
  });
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.POST(request('POST', { name: 'Private' }))).status, 401);
  assert.equal(accessed, false);
});

test('shortlist mutations are always scoped to the authenticated login', async () => {
  let mutatedLogin;
  const handlers = createShortlistHandlers({
    getAuthenticatedSession: async () => ({ login: 'octocat' }),
    mutate: async (login, mutation) => {
      mutatedLogin = login;
      const result = mutation([]);
      return { watchlist: { shortlists: result.shortlists }, result };
    },
  });
  const response = await handlers.POST(request('POST', { name: 'Maintainers', owner: 'someone-else' }));
  assert.equal(response.status, 201);
  assert.equal(mutatedLogin, 'octocat');
});

test('owner projection exposes shared state but never token hashes', async () => {
  const handlers = createShortlistHandlers({
    getAuthenticatedSession: async () => ({ login: 'octocat' }),
    loadWatchlist: async login => ({ login, shortlists: [{ id: ID, name: 'Private', entries: [], share: { tokenHash: 'secret' } }] }),
  });
  const response = await handlers.GET();
  const body = await response.json();
  assert.equal(body.shortlists[0].shared, true);
  assert.equal(JSON.stringify(body).includes('tokenHash'), false);
  assert.equal(JSON.stringify(body).includes('secret'), false);
});

test('shared reads require the matching owner and token and remain read-only projections', async () => {
  const GET = createSharedShortlistHandler({
    loadWatchlist: async owner => ({ login: owner, follows: { developers: ['private-follow'] }, shortlists: [{
      id: ID,
      name: 'Trusted review',
      entries: [{ login: 'torvalds', note: 'Kernel work', addedAt: '2026-08-30T12:00:00.000Z' }],
      share: { tokenHash: hashShortlistShareToken(TOKEN), createdAt: '2026-08-30T12:00:00.000Z' },
    }] }),
  });
  const response = await GET(new Request(`https://www.devglobe.dev/api/shortlists/shared?owner=OctoCat&token=${TOKEN}`));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.owner, 'octocat');
  assert.equal(body.shortlist.entries[0].login, 'torvalds');
  assert.equal(JSON.stringify(body).includes('private-follow'), false);
  assert.equal(JSON.stringify(body).includes('tokenHash'), false);
  assert.equal((await GET(new Request('https://www.devglobe.dev/api/shortlists/shared?owner=octocat&token=wrong-but-long-enough-token'))).status, 404);
});