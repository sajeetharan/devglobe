import test from 'node:test';
import assert from 'node:assert/strict';
import { attributedGlobePath, developerInviteUrl, identityCardShareUrl } from '../lib/share-attribution.js';

test('builds channel-specific identity card referral URLs', () => {
  const linkedIn = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octo cat', 'linkedin', '4'));
  const copied = new URL(identityCardShareUrl('https://www.devglobe.dev', 'octocat', 'copy_link', '4'));

  assert.equal(linkedIn.pathname, '/share/octo%20cat');
  assert.equal(linkedIn.searchParams.get('v'), '4');
  assert.equal(linkedIn.searchParams.get('utm_source'), 'linkedin');
  assert.equal(linkedIn.searchParams.get('utm_medium'), 'social');
  assert.equal(linkedIn.searchParams.get('utm_campaign'), 'identity_card');
  assert.equal(copied.searchParams.get('utm_medium'), 'referral');
});

test('preserves only campaign attribution when entering the globe', () => {
  const path = attributedGlobePath('octocat', {
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: 'identity_card',
    token: 'do-not-forward',
  });
  const url = new URL(path, 'https://www.devglobe.dev');

  assert.equal(url.searchParams.get('dev'), 'octocat');
  assert.equal(url.searchParams.get('utm_source'), 'linkedin');
  assert.equal(url.searchParams.get('utm_medium'), 'social');
  assert.equal(url.searchParams.get('utm_campaign'), 'identity_card');
  assert.equal(url.searchParams.has('token'), false);
});

test('attributes member invitations without exposing identity outside ref', () => {
  const url = new URL(developerInviteUrl('https://www.devglobe.dev', 'octocat', 'native_share'));

  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('ref'), 'octocat');
  assert.equal(url.searchParams.get('utm_source'), 'native_share');
  assert.equal(url.searchParams.get('utm_medium'), 'referral');
  assert.equal(url.searchParams.get('utm_campaign'), 'developer_invite');
});