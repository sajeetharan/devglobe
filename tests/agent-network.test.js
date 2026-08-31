import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentRelationshipGraph,
  buildAgentNetworkSnapshot,
  getIntroductionLifecycle,
  isAgentReadyDeveloper,
  projectAgentReadiness,
} from '../lib/agent-network.js';

function developer(login, country, tools = ['github-copilot']) {
  return {
    login,
    claimed: true,
    location: `City, ${country}`,
    aiProfile: {
      tools: tools.map(id => ({ id, usage: 'daily', source: 'self-declared' })),
      acceptsAgentRequests: true,
      visibility: 'public',
      contactPolicy: 'verified-agents',
      updatedAt: '2026-08-13T12:00:00.000Z',
    },
  };
}

test('marks only claimed public opt-ins as agent ready', () => {
  assert.equal(isAgentReadyDeveloper(developer('ready', 'USA')), true);

  const privateDeveloper = developer('private', 'USA');
  privateDeveloper.aiProfile.visibility = 'private';
  assert.equal(isAgentReadyDeveloper(privateDeveloper), false);

  const closedDeveloper = developer('closed', 'USA');
  closedDeveloper.aiProfile.acceptsAgentRequests = false;
  assert.equal(isAgentReadyDeveloper(closedDeveloper), false);
});

test('projects readiness without exposing AI profile settings', () => {
  const projected = projectAgentReadiness(developer('ready', 'USA'));
  assert.equal(projected.agentReady, true);
  assert.deepEqual(projected.agentTools, ['github-copilot']);
  assert.equal('aiProfile' in projected, false);

  const privateDeveloper = developer('private', 'USA');
  privateDeveloper.aiProfile.visibility = 'private';
  assert.deepEqual(projectAgentReadiness(privateDeveloper).agentTools, []);
});

test('builds bounded public tool-to-developer relationships', () => {
  const developers = Array.from({ length: 4 }, (_, index) => ({
    ...projectAgentReadiness(developer(`person-${index}`, 'USA', ['github-copilot', 'claude-code'])),
    lat: 40 + index,
    lng: -70 - index,
  }));
  const graph = buildAgentRelationshipGraph(developers, 2);

  assert.deepEqual(graph.nodes.map(node => node.id), ['github-copilot', 'claude-code']);
  assert.deepEqual(graph.developers.map(node => node.login), ['person-0', 'person-1']);
  assert.equal(graph.links.length, 4);
  assert.equal(graph.links.filter(link => link.toolId === 'github-copilot').length, 2);
  assert.match(graph.links[0].label, /publicly listed/);
});

test('projects reportable aggregate Agent Network metrics', () => {
  const snapshot = buildAgentNetworkSnapshot({
    developers: [
      developer('one', 'USA'),
      developer('two', 'Canada'),
      developer('three', 'France'),
    ],
    introductionCounts: { pending: 4, accepted: 3 },
  });

  assert.deepEqual(snapshot.metrics.openDevelopers, { value: 3, suppressed: false });
  assert.deepEqual(snapshot.metrics.countries, { value: 3, suppressed: false });
  assert.deepEqual(snapshot.tools, [{ id: 'github-copilot', name: 'GitHub Copilot', count: 3 }]);
});

test('suppresses small cohorts and excludes private or unclaimed profiles', () => {
  const privateDeveloper = developer('private', 'USA');
  privateDeveloper.aiProfile.visibility = 'private';
  const unclaimedDeveloper = developer('unclaimed', 'Canada');
  unclaimedDeveloper.claimed = false;

  const snapshot = buildAgentNetworkSnapshot({
    developers: [developer('one', 'USA'), privateDeveloper, unclaimedDeveloper],
    introductionCounts: { pending: 2, accepted: 1 },
  });

  assert.deepEqual(snapshot.metrics.openDevelopers, { value: null, suppressed: true });
  assert.deepEqual(snapshot.metrics.pendingRequests, { value: null, suppressed: true });
  assert.deepEqual(snapshot.tools, []);
});

test('derives pending, accepted, and expired lifecycle stages', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');
  assert.deepEqual(getIntroductionLifecycle('pending', '2026-08-20T12:00:00.000Z', now).map(stage => stage.state), ['complete', 'current', 'upcoming']);
  assert.equal(getIntroductionLifecycle('accepted', '2026-08-20T12:00:00.000Z', now)[2].label, 'Accepted');
  assert.equal(getIntroductionLifecycle('pending', '2026-08-12T12:00:00.000Z', now)[2].label, 'Expired');
});
