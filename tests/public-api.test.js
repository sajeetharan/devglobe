import test from 'node:test';
import assert from 'node:assert/strict';
import { developerSnapshotUrl, publicApiUrl } from '../lib/public-api.js';

test('uses same-origin paths when Azure is not configured', () => {
  assert.equal(publicApiUrl('/api/developer', ''), '/api/developer');
  assert.equal(developerSnapshotUrl(''), '/api/developers');
});

test('joins configured Azure origins and paths', () => {
  assert.equal(publicApiUrl('api/search', 'https://api.example.com/'), 'https://api.example.com/api/search');
  assert.equal(developerSnapshotUrl('https://cdn.example.com/developers.json'), 'https://cdn.example.com/developers.json');
});