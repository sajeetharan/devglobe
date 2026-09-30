import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  dailyCompanionVisitKey,
  dailyCompanionStorageKey,
  normalizePublicFeature,
  githubFeatureAuthUrl,
  shouldOpenDailyCompanion,
  todayGitHubAuthUrl,
} from '../lib/public-activation.js';

test('Today authentication returns users to the daily companion', () => {
  assert.equal(todayGitHubAuthUrl(), '/api/auth/github?returnTo=%2F%3Ffeature%3Dtoday');
  assert.equal(githubFeatureAuthUrl('live'), '/api/auth/github?returnTo=%2F%3Ffeature%3Dlive');
  assert.equal(githubFeatureAuthUrl('today', '@OctoCat'), '/api/auth/github?login=OctoCat&returnTo=%2F%3Ffeature%3Dtoday');
});

test('public feature names are bounded to the three primary modes', () => {
  assert.equal(normalizePublicFeature('today'), 'today');
  assert.equal(normalizePublicFeature('live'), 'live');
  assert.equal(normalizePublicFeature('unknown'), 'search');
});

test('daily companion opens once per UTC day for direct signed-in visits', () => {
  const now = new Date('2026-09-30T10:00:00.000Z');
  const visitKey = dailyCompanionVisitKey('OctoCat', now);
  assert.equal(dailyCompanionStorageKey('OctoCat'), 'devglobe-daily-companion:v1:octocat');
  assert.equal(visitKey, 'devglobe-daily-companion:v1:octocat:2026-09-30');
  assert.equal(shouldOpenDailyCompanion({ login: 'OctoCat', searchParams: new URLSearchParams(), now }), true);
  assert.equal(shouldOpenDailyCompanion({ login: 'OctoCat', searchParams: new URLSearchParams(), lastVisitKey: visitKey, now }), false);
  assert.notEqual(dailyCompanionVisitKey('OctoCat', new Date('2026-10-01T00:00:00.000Z')), visitKey);
});

test('daily companion never replaces explicit destinations or non-home routes', () => {
  const now = new Date('2026-09-30T10:00:00.000Z');
  for (const query of ['dev=octocat', 'country=Canada', 'open=contributions', 'feature=live']) {
    assert.equal(shouldOpenDailyCompanion({ login: 'octocat', searchParams: new URLSearchParams(query), now }), false);
  }
  assert.equal(shouldOpenDailyCompanion({ login: 'octocat', pathname: '/developer/octocat', searchParams: new URLSearchParams(), now }), false);
});

test('homepage prioritizes the feature bar without competing first-visit panels', async () => {
  const homepage = await readFile('app/page.jsx', 'utf8');
  assert.match(homepage, /<PublicFeatureBar/);
  assert.match(homepage, /showMissionPreview=\{false\}/);
  assert.doesNotMatch(homepage, /<PlatformActivityBanner/);
  assert.doesNotMatch(homepage, /setTourStep\('search'\).*localStorage\.getItem\(TOUR_COMPLETE_KEY\)/s);
});

test('homepage wires the once-daily Today experience without overlapping the return briefing', async () => {
  const homepage = await readFile('app/page.jsx', 'utf8');
  const featureBar = await readFile('components/PublicFeatureBar.jsx', 'utf8');
  const activity = await readFile('components/GlobalActivityFeed.jsx', 'utf8');
  const mission = await readFile('components/TodayMission.jsx', 'utf8');
  assert.match(homepage, /shouldOpenDailyCompanion/);
  assert.match(homepage, /activeFeature=\{!user \? publicSurface : sidebarOpen && sidebarView === 'activity' \? 'today'/);
  assert.match(homepage, /!\(sidebarOpen && sidebarView === 'activity'\)/);
  assert.match(featureBar, /<strong>Today<\/strong>/);
  assert.match(featureBar, /<strong>Find people<\/strong>/);
  assert.match(activity, /Make one useful move today/);
  assert.match(activity, /<span>Progress<\/span>/);
  assert.equal((mission.match(/todayGitHubAuthUrl\(\)/g) || []).length, 2);
});

test('anonymous entry renders the mission workspace before loading the globe dataset', async () => {
  const homepage = await readFile('app/page.jsx', 'utf8');
  const missionHome = await readFile('components/MissionFirstHome.jsx', 'utf8');
  const featureBar = await readFile('components/PublicFeatureBar.jsx', 'utf8');
  assert.match(homepage, /const shouldLoadDeveloperDataset = sessionResolved && \(Boolean\(user\) \|\| publicSurface === 'search'\)/);
  assert.match(homepage, /const showMissionHome = !sessionResolved \|\| \(!user && publicSurface === 'today'\)/);
  assert.match(homepage, /showMissionHome \? <MissionFirstHome \/> : <>/);
  assert.match(homepage, /onToggleSidebar=\{handleToggleExplorer\}/);
  assert.match(missionHome, /<MissionPreview variant="landing" \/>/);
  assert.match(featureBar, /href=\{githubFeatureAuthUrl\('live'\)\}/);
  assert.match(featureBar, /onClick=\{\(\) => selectFeature\('today', onToday\)\}/);
});