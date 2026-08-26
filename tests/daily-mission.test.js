import test from 'node:test';
import assert from 'node:assert/strict';
import { DailyMissionError, addCompletedMission, applyMissionAction, cachedMissionPool, missionDay, selectDailyMission } from '../lib/daily-mission.js';

const NOW = new Date('2026-08-25T08:30:00.000Z');
const opportunities = [
  { id: '101', title: 'Improve README setup instructions', labels: ['documentation'], repository: 'devglobe/app' },
  { id: '102', title: 'Reproduce login redirect bug', labels: ['bug'], repository: 'devglobe/app' },
];

test('selects one 15-minute mission for the UTC day and skips passed issues', () => {
  assert.equal(missionDay(NOW), '2026-08-25');
  const mission = selectDailyMission(opportunities, { login: 'OctoCat', now: NOW, excludedIssueIds: ['101'] });

  assert.equal(mission.id, 'octocat:2026-08-25:102');
  assert.equal(mission.type, 'Reproduce a bug');
  assert.equal(mission.durationMinutes, 15);
  assert.equal(mission.status, 'offered');
});

test('uses the ranked opportunity scope when available', () => {
  const mission = selectDailyMission([{ ...opportunities[0], estimatedMinutes: 30 }], { login: 'octocat', now: NOW });

  assert.equal(mission.durationMinutes, 30);
});

test('moves a mission through accept and complete states', () => {
  const offered = selectDailyMission(opportunities, { login: 'octocat', now: NOW });
  const accepted = applyMissionAction(offered, 'accept', NOW);
  const completed = applyMissionAction(accepted, 'complete', NOW);

  assert.equal(accepted.status, 'accepted');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, NOW.toISOString());
});

test('keeps completed mission history newest first, deduplicated, and bounded', () => {
  const completed = applyMissionAction(applyMissionAction(selectDailyMission(opportunities, { login: 'octocat', now: NOW }), 'accept', NOW), 'complete', NOW);
  const previous = Array.from({ length: 25 }, (_, index) => ({ id: `older-${index}`, status: 'completed' }));
  const history = addCompletedMission(previous, completed);

  assert.equal(history.length, 25);
  assert.equal(history[0].id, completed.id);
  assert.equal(addCompletedMission(history, completed).filter(mission => mission.id === completed.id).length, 1);
});

test('allows a pass but rejects invalid or stale transitions', () => {
  const offered = selectDailyMission(opportunities, { login: 'octocat', now: NOW });
  assert.equal(applyMissionAction(offered, 'pass', NOW).status, 'passed');
  assert.throws(() => applyMissionAction(offered, 'complete', NOW), DailyMissionError);
  assert.throws(() => applyMissionAction(offered, 'accept', new Date('2026-08-26T00:01:00.000Z')), DailyMissionError);
  assert.throws(() => applyMissionAction(offered, 'accept', NOW, 'another-mission'), /Mission changed/);
});

test('reuses only a matching unexpired recommendation cache, including an empty pool', () => {
  const preferences = { interests: [], languages: ['javascript'], difficulty: 'beginner', campaign: 'all' };
  const state = { cache: { key: JSON.stringify(preferences), expiresAt: '2026-08-25T09:00:00.000Z', opportunities: [] } };

  assert.deepEqual(cachedMissionPool(state, preferences, NOW), []);
  assert.equal(cachedMissionPool(state, { ...preferences, difficulty: 'advanced' }, NOW), null);
  assert.equal(cachedMissionPool({ cache: { ...state.cache, expiresAt: '2026-08-25T08:00:00.000Z' } }, preferences, NOW), null);
  assert.equal(cachedMissionPool({ cache: { ...state.cache, expiresAt: 'not-a-date' } }, preferences, NOW), null);
});