import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemapEntries } from '../app/sitemap.js';

test('includes every existing indexable acquisition route', () => {
  const entries = buildSitemapEntries(['octocat', 'octo cat', 'octocat']);
  const paths = entries.map(entry => new URL(entry.url).pathname);

  assert.ok(paths.includes('/countries'));
  assert.ok(paths.includes('/leaderboard'));
  assert.ok(paths.includes('/developer/octocat'));
  assert.ok(!paths.includes('/share/octocat'));
  assert.ok(paths.includes('/developer/octo%20cat'));
  assert.equal(paths.filter(path => path === '/developer/octocat').length, 1);
});

test('stays within the sitemap URL limit for the current dataset size', () => {
  const logins = Array.from({ length: 27_000 }, (_, index) => `developer-${index}`);

  assert.ok(buildSitemapEntries(logins).length <= 50_000);
});