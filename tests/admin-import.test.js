import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminImportedDeveloper, isPublicDeveloper } from '../lib/nominate.js';

test('builds an admin-imported public profile without nomination or contact metadata', () => {
  const developer = buildAdminImportedDeveloper({
    login: 'NChang90',
    name: 'Nicholas Chang',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1',
    bio: 'Platform engineer',
    githubUrl: 'https://github.com/nchang90',
    githubLocation: 'Birmingham',
    followers: 41,
    publicRepos: 66,
    totalStars: 1,
    totalForks: 2,
    totalWatchers: 2,
    totalCommits: 100,
    topLanguage: 'JavaScript',
    languages: [{ name: 'JavaScript', percent: 100 }],
    topRepos: [],
  }, {
    coordinates: { lat: 52.4862, lng: -1.8904 },
    reviewer: 'admin',
    now: '2026-08-25T10:00:00.000Z',
  });

  assert.equal(developer.id, 'nchang90');
  assert.equal(developer.location, 'Birmingham');
  assert.equal(developer.source, 'admin-import');
  assert.equal(developer.importedBy, 'admin');
  assert.equal(developer.nomination, undefined);
  assert.equal(developer.email, undefined);
  assert.equal(isPublicDeveloper(developer), true);
});