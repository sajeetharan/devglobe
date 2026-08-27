import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemapEntries } from '../app/sitemap.js';

test('includes every existing indexable acquisition route', () => {
  const entries = buildSitemapEntries(['octocat', 'octo cat', 'octocat']);
  const paths = entries.map(entry => new URL(entry.url).pathname);

  assert.ok(paths.includes('/countries'));
  assert.ok(paths.includes('/developer/octocat'));
  assert.ok(paths.includes('/share/octocat'));
  assert.ok(paths.includes('/developer/octo%20cat'));
  assert.equal(paths.filter(path => path === '/developer/octocat').length, 1);
});