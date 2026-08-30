import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntroductionInboxHandlers } from '../app/api/introductions/route.js';
import { appendIntroductionAudit } from '../lib/agent-introductions.js';

const REQUEST_ID = 'e6fa6dc6-64df-48c4-8597-c70bfe089bec';
const NOW = new Date('2026-08-30T12:00:00.000Z');

function introduction(overrides = {}) {
  return {
    id: REQUEST_ID,
    developerLogin: 'octocat',
    requesterAgent: { id: 'agent-1', name: 'Build Agent', owner: 'Example Org' },
    project: 'Public project',
    reason: 'Help maintain a public component library.',
    status: 'pending',
    createdAt: '2026-08-29T12:00:00.000Z',
    expiresAt: '2026-09-12T12:00:00.000Z',
    ...overrides,
  };
}

test('collaboration inbox requires authentication before reading storage', async () => {
  let accessed = false;
  const { GET } = createIntroductionInboxHandlers({
    getAuthenticatedSession: async () => null,
    getIntroductionContainer: () => { accessed = true; },
  });
  const response = await GET();
  assert.equal(response.status, 401);
  assert.equal(accessed, false);
});

test('collaboration inbox scopes list queries to the authenticated developer', async () => {
  let definition;
  let options;
  const { GET } = createIntroductionInboxHandlers({
    getAuthenticatedSession: async () => ({ login: 'octocat' }),
    getIntroductionContainer: () => ({ items: { query(queryDefinition, queryOptions) {
      definition = queryDefinition;
      options = queryOptions;
      return { fetchAll: async () => ({ resources: [introduction()] }) };
    } } }),
  });
  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(definition.parameters[0].value, 'octocat');
  assert.deepEqual(options, { partitionKey: 'octocat' });
  assert.equal(body.requests.length, 1);
  assert.equal(JSON.stringify(body).includes('token'), false);
});

test('developer decisions append an immutable audit event', async () => {
  const original = introduction();
  let replaced;
  const { PATCH } = createIntroductionInboxHandlers({
    getAuthenticatedSession: async () => ({ login: 'octocat' }),
    getIntroductionContainer: () => ({ item(id, partitionKey) {
      assert.equal(id, REQUEST_ID);
      assert.equal(partitionKey, 'octocat');
      return {
        read: async () => ({ resource: original }),
        replace: async value => { replaced = value; },
      };
    } }),
    now: () => NOW,
  });
  const response = await PATCH(new Request('https://www.devglobe.dev/api/introductions', {
    method: 'PATCH',
    body: JSON.stringify({ id: REQUEST_ID, status: 'accepted' }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(replaced.status, 'accepted');
  assert.deepEqual(replaced.auditTrail, [
    { status: 'pending', at: original.createdAt, actor: 'requester-agent' },
    { status: 'accepted', at: NOW.toISOString(), actor: 'developer' },
  ]);
  assert.deepEqual(body.request.auditTrail, replaced.auditTrail);
});

test('developer cannot decide another developer request', async () => {
  let replaced = false;
  const { PATCH } = createIntroductionInboxHandlers({
    getAuthenticatedSession: async () => ({ login: 'octocat' }),
    getIntroductionContainer: () => ({ item: () => ({
      read: async () => ({ resource: introduction({ developerLogin: 'someone-else' }) }),
      replace: async () => { replaced = true; },
    }) }),
    now: () => NOW,
  });
  const response = await PATCH(new Request('https://www.devglobe.dev/api/introductions', {
    method: 'PATCH',
    body: JSON.stringify({ id: REQUEST_ID, status: 'declined' }),
  }));
  assert.equal(response.status, 404);
  assert.equal(replaced, false);
});

test('audit trails remain bounded', () => {
  const auditTrail = Array.from({ length: 25 }, (_, index) => ({ status: 'pending', at: String(index), actor: 'developer' }));
  const updated = appendIntroductionAudit({ createdAt: 'created', auditTrail }, 'declined', NOW.toISOString());
  assert.equal(updated.length, 20);
  assert.equal(updated.at(-1).status, 'declined');
});