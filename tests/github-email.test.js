import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGitHubEmail } from '../lib/github-email.js';

test('selects the verified primary GitHub email', () => {
  assert.equal(selectGitHubEmail('public@example.com', [
    { email: 'other@example.com', verified: true, primary: false },
    { email: 'primary@example.com', verified: true, primary: true },
  ]), 'primary@example.com');
});

test('falls back to public profile email and ignores unverified addresses', () => {
  assert.equal(selectGitHubEmail('public@example.com', [
    { email: 'unverified@example.com', verified: false, primary: true },
  ]), 'public@example.com');
  assert.equal(selectGitHubEmail(null, [
    { email: 'unverified@example.com', verified: false, primary: true },
  ]), null);
});