import test from 'node:test';
import assert from 'node:assert/strict';
import { contributionTask, contributionGuideUrl } from '../lib/contribution-task.js';
import { rankContributionOpportunities } from '../lib/contribution-opportunities.js';

test('distinguishes JSON/content work from repository language without retaining issue bodies', () => {
  const issue = {
    id: 31499, title: 'Add new Japan Fact', state: 'open',
    body: 'No coding experience required! This is a simple JSON/data file edit. [Beginner Contributing Guide](../blob/main/docs/CONTRIBUTING-BEGINNERS.md)',
    labels: [{ name: 'good first issue' }, { name: 'hacktoberfest' }],
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
  };
  const repository = { full_name: 'lingdojo/kana-dojo', language: 'TypeScript' };
  const [match] = rankContributionOpportunities([{
    issue, repository, hasContributionGuide: true,
    lastMaintainerActivityAt: '2026-10-02T00:00:00Z', recentlyMergedPullRequests: 3,
  }], { languages: ['typescript'], interests: [], difficulty: 'beginner', campaign: 'hacktoberfest-2026' }, [], new Date('2026-10-03T00:00:00Z'));
  assert.deepEqual(match.task, { kind: 'content', label: 'JSON/content edit' });
  assert.equal(match.language, 'TypeScript');
  assert.ok(match.reasons.includes('Repository: TypeScript'));
  assert.equal(match.contributionGuideUrl, 'https://github.com/lingdojo/kana-dojo/blob/main/docs/CONTRIBUTING-BEGINNERS.md');
  assert.equal(Object.hasOwn(match, 'body'), false);
});

test('uses conservative task labels and does not infer code work from repository language', () => {
  assert.equal(contributionTask({ title: 'Improve README setup' }).kind, 'content');
  assert.equal(contributionTask({ title: 'Fix JSON parser bug', body: 'Edit the parser to parse JSON correctly.' }).kind, 'code');
  assert.equal(contributionTask({ title: 'Implement a new feature' }).kind, 'code');
  assert.equal(contributionTask({ title: 'Discuss a better approach' }).kind, 'unknown');
  assert.equal(contributionTask({ title: 'Translate the getting started page' }).kind, 'content');
});

test('prefers an issue-specific guide and safely falls back to verified repository guidance', () => {
  const repo = { full_name: 'org/repo' };
  const fallback = 'https://github.com/org/repo/blob/main/CONTRIBUTING.md';
  assert.equal(contributionGuideUrl({ body: '[Contribution guide](../blob/main/docs/beginners.md)' }, repo, fallback), 'https://github.com/org/repo/blob/main/docs/beginners.md');
  for (const value of ['javascript:alert(1)', 'https://evil.test/guide', 'https://github.com/other/repo/blob/main/guide.md', 'https://github.com/org/repo/issues/1', 'https://github.com@evil.test/org/repo/blob/main/guide.md']) {
    assert.equal(contributionGuideUrl({ body: `[Contribution guide](${value})` }, repo, fallback), fallback);
    assert.equal(contributionGuideUrl({}, repo, value), null);
  }
  assert.equal(contributionGuideUrl({}, repo), null);
});
