import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../components/TodayMission.jsx', import.meta.url), 'utf8');
const feedSource = await readFile(new URL('../components/GlobalActivityFeed.jsx', import.meta.url), 'utf8');

test('completed mission history has a permanent empty state and paginated list', () => {
  assert.match(source, /view === 'completed'/);
  assert.match(source, /No completed DevGlobe missions yet/);
  assert.match(source, /completedMissions\.slice\(0, visibleCompletedCount\)/);
  assert.match(source, /Load more/);
  assert.doesNotMatch(source, /\{completedMissions\.length > 0 && \(\s*<section/);
});

test('completed mission actions use explicit destinations', () => {
  assert.match(source, />View issue</);
  assert.match(source, />View merged PR</);
});

test('activity panel gives mission history a URL-backed destination', () => {
  assert.match(feedSource, /Today/);
  assert.match(feedSource, /Completed/);
  assert.match(feedSource, /Community/);
  assert.match(feedSource, /searchParams\.set\('activity', view\)/);
  assert.match(feedSource, /onCompletedCountChange=\{setCompletedCount\}/);
});