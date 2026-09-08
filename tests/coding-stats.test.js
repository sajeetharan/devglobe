import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodingAchievements, buildCodingDelta, buildCodingStats, mergeCodingDay } from '../lib/coding-stats.js';

const first = {
  login: 'octocat',
  activeLanguage: 'TypeScript',
  editor: 'VS Code',
  sessionStartedAt: '2026-09-08T10:00:00.000Z',
  lastHeartbeat: '2026-09-08T10:00:00.000Z',
};

test('counts only bounded heartbeats from the same coding session', () => {
  const current = { ...first, lastHeartbeat: '2026-09-08T10:00:30.000Z' };
  assert.deepEqual(buildCodingDelta(first, current), {
    login: 'octocat',
    day: '2026-09-08',
    seconds: 30,
    language: 'TypeScript',
    editor: 'VS Code',
    updatedAt: current.lastHeartbeat,
  });
  assert.equal(buildCodingDelta(first, { ...current, sessionStartedAt: 'other' }), null);
  assert.equal(buildCodingDelta(first, { ...current, lastHeartbeat: '2026-09-08T10:01:31.000Z' }), null);
});

test('merges daily totals without storing source activity details', () => {
  const delta = buildCodingDelta(first, { ...first, lastHeartbeat: '2026-09-08T10:00:30.000Z' });
  const document = mergeCodingDay(null, delta);
  assert.equal(document.activeSeconds, 30);
  assert.equal(document.languages.TypeScript, 30);
  assert.equal(document.editors['VS Code'], 30);
  assert.equal('file' in document, false);
  assert.equal('repository' in document, false);
});

test('builds owner dashboard totals, dimensions, timeline, and streak', () => {
  const documents = [
    { day: '2026-09-06', activeSeconds: 60, languages: { JavaScript: 60 }, editors: { Cursor: 60 } },
    { day: '2026-09-07', activeSeconds: 120, languages: { TypeScript: 120 }, editors: { 'VS Code': 120 } },
    { day: '2026-09-08', activeSeconds: 180, languages: { TypeScript: 180 }, editors: { 'VS Code': 180 } },
  ];
  const result = buildCodingStats(documents, new Date('2026-09-08T12:00:00.000Z'));
  assert.equal(result.todaySeconds, 180);
  assert.equal(result.weekSeconds, 360);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.achievements.find(item => item.id === 'three-day-streak').earned, true);
  assert.equal(result.achievements.find(item => item.id === 'first-hour').earned, false);
  assert.deepEqual(result.languages[0], { name: 'TypeScript', seconds: 300 });
  assert.equal(result.timeline.length, 30);
});

test('derives achievements from aggregate totals without source activity', () => {
  const achievements = buildCodingAchievements({ allSeconds: 3600, weekSeconds: 18000, currentStreak: 7 });
  assert.equal(achievements.length, 4);
  assert.equal(achievements.every(item => item.earned), true);
  assert.equal(achievements.some(item => 'file' in item || 'repository' in item), false);
});