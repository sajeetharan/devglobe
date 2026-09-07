import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfileCompletion } from '../lib/profile-completion.js';

test('keeps every owner step incomplete before a profile is claimed', () => {
  const result = calculateProfileCompletion({
    developer: {
      metricsUpdatedAt: '2026-08-21T00:00:00.000Z',
      topRepos: [{ name: 'devglobe' }],
      aiProfile: { tools: [{ id: 'copilot' }], updatedAt: '2026-08-21T00:00:00.000Z' },
    },
    cardGenerated: true,
    now: new Date('2026-09-01T00:00:00.000Z'),
  });

  assert.equal(result.completed, 0);
  assert.equal(result.percent, 0);
  assert.ok(result.steps.every(step => step.complete === false));
});

test('recalculates server-derived steps when a claim transition completes', () => {
  const developer = {
    claimed: true,
    metricsUpdatedAt: '2026-08-21T00:00:00.000Z',
    topRepos: [{ name: 'devglobe' }],
    aiProfile: {
      tools: [{ id: 'copilot', usage: 'regular' }],
      acceptsAgentRequests: false,
      opportunityPreferences: { enabled: true },
      updatedAt: '2026-08-21T00:00:00.000Z',
    },
  };
  const result = calculateProfileCompletion({ developer, cardGenerated: false, now: new Date('2026-09-01T00:00:00.000Z') });

  assert.equal(result.completed, 6);
  assert.equal(result.percent, 86);
  assert.equal(result.steps.find(step => step.id === 'card').complete, false);
});

test('marks the checklist complete only after recorded card generation', () => {
  const developer = {
    claimed: true,
    metricsUpdatedAt: '2026-08-21T00:00:00.000Z',
    topRepos: [{ name: 'devglobe' }],
    aiProfile: {
      tools: [{ id: 'copilot', usage: 'regular' }],
      acceptsAgentRequests: true,
      opportunityPreferences: { enabled: false },
      updatedAt: '2026-08-21T00:00:00.000Z',
    },
  };

  const result = calculateProfileCompletion({ developer, cardGenerated: true, now: new Date('2026-09-01T00:00:00.000Z') });

  assert.equal(result.completed, result.total);
  assert.equal(result.percent, 100);
  assert.equal(result.complete, true);
});

test('asks owners to refresh stale readiness choices without changing consent', () => {
  const result = calculateProfileCompletion({
    developer: {
      claimed: true,
      metricsUpdatedAt: '2026-08-21T00:00:00.000Z',
      topRepos: [{ name: 'devglobe' }],
      aiProfile: {
        tools: [{ id: 'copilot', usage: 'regular' }],
        acceptsAgentRequests: false,
        opportunityPreferences: { enabled: false },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    now: new Date('2026-09-01T00:00:00.000Z'),
  });

  assert.equal(result.profileFresh, false);
  assert.equal(result.steps.find(step => step.id === 'tools').complete, false);
  assert.equal(result.steps.find(step => step.id === 'opportunities').complete, false);
  assert.equal(result.steps.find(step => step.id === 'agentContact').complete, false);
});