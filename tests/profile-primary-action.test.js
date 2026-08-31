import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_PRIMARY_ACTIONS, resolveProfilePrimaryAction } from '../lib/profile-primary-action.js';

test('gives profile owners contribution opportunities as their primary action', () => {
  assert.equal(resolveProfilePrimaryAction({
    viewerLogin: 'OctoCat',
    profileLogin: 'octocat',
  }), PROFILE_PRIMARY_ACTIONS.OPPORTUNITIES);
});

test('gives signed-out and signed-in visitors follow as their primary action', () => {
  assert.equal(resolveProfilePrimaryAction({
    profileLogin: 'octocat',
  }), PROFILE_PRIMARY_ACTIONS.FOLLOW);
  assert.equal(resolveProfilePrimaryAction({
    viewerLogin: 'mona',
    profileLogin: 'octocat',
  }), PROFILE_PRIMARY_ACTIONS.FOLLOW);
});

test('gives followers impact history as their next primary action', () => {
  assert.equal(resolveProfilePrimaryAction({
    viewerLogin: 'mona',
    profileLogin: 'octocat',
    isFollowing: true,
  }), PROFILE_PRIMARY_ACTIONS.IMPACT);
});