import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichWithCollaborators } from '../lib/collaboration.js';

describe('Collaboration Graph Builder', () => {
  it('identifies collaborators sharing a single repository', () => {
    const devs = [
      {
        login: 'alice',
        name: 'Alice Developer',
        lat: 37.7749,
        lng: -122.4194,
        score: 85,
        topRepos: [{ name: 'react' }, { name: 'next.js' }],
      },
      {
        login: 'bob',
        name: 'Bob Coder',
        lat: 40.7128,
        lng: -74.0060,
        score: 75,
        topRepos: [{ name: 'react' }, { name: 'vite' }],
      },
      {
        login: 'charlie',
        name: 'Charlie Smith',
        lat: 51.5074,
        lng: -0.1278,
        score: 90,
        topRepos: [{ name: 'vue' }],
      },
    ];

    const result = enrichWithCollaborators(devs);
    
    // Alice and Bob share 'react'
    const alice = result.find(d => d.login === 'alice');
    assert.equal(alice.collaborators.length, 1);
    assert.equal(alice.collaborators[0].login, 'bob');
    assert.equal(alice.collaborators[0].repo, 'react');
    assert.equal(alice.collaborators[0].lat, 40.7128);
    assert.equal(alice.collaborators[0].lng, -74.0060);

    const bob = result.find(d => d.login === 'bob');
    assert.equal(bob.collaborators.length, 1);
    assert.equal(bob.collaborators[0].login, 'alice');
    assert.equal(bob.collaborators[0].repo, 'react');

    // Charlie shares nothing
    const charlie = result.find(d => d.login === 'charlie');
    assert.equal(charlie.collaborators.length, 0);
  });

  it('handles case-insensitivity and whitespace in repository names', () => {
    const devs = [
      {
        login: 'dev1',
        topRepos: [{ name: 'Linux' }],
      },
      {
        login: 'dev2',
        topRepos: [{ name: '  linux  ' }],
      },
    ];

    const result = enrichWithCollaborators(devs);
    assert.equal(result[0].collaborators.length, 1);
    assert.equal(result[0].collaborators[0].login, 'dev2');
  });

  it('ranks collaborators by shared repo count then score and caps at 5', () => {
    const devs = [
      {
        login: 'mainDev',
        topRepos: [{ name: 'repo1' }, { name: 'repo2' }, { name: 'repo3' }],
      },
      {
        login: 'devHighShared',
        score: 50,
        topRepos: [{ name: 'repo1' }, { name: 'repo2' }],
      },
      {
        login: 'devHighScorer',
        score: 95,
        topRepos: [{ name: 'repo1' }],
      },
      {
        login: 'devLowScorer',
        score: 20,
        topRepos: [{ name: 'repo1' }],
      },
      {
        login: 'dev4',
        score: 60,
        topRepos: [{ name: 'repo1' }],
      },
      {
        login: 'dev5',
        score: 70,
        topRepos: [{ name: 'repo1' }],
      },
      {
        login: 'dev6',
        score: 80,
        topRepos: [{ name: 'repo1' }],
      },
    ];

    const result = enrichWithCollaborators(devs);
    const main = result.find(d => d.login === 'mainDev');
    
    // Exactly 5 collaborators
    assert.equal(main.collaborators.length, 5);
    
    // First should be devHighShared (2 shared repos vs 1)
    assert.equal(main.collaborators[0].login, 'devHighShared');
    assert.equal(main.collaborators[0].sharedRepos.length, 2);
    
    // Next should be devHighScorer (score 95)
    assert.equal(main.collaborators[1].login, 'devHighScorer');
  });

  it('handles string arrays for topRepos as well as object arrays', () => {
    const devs = [
      { login: 'dev1', topRepos: ['repoA', 'repoB'] },
      { login: 'dev2', topRepos: [{ name: 'repoA' }] },
    ];

    const result = enrichWithCollaborators(devs);
    assert.equal(result[0].collaborators.length, 1);
    assert.equal(result[0].collaborators[0].login, 'dev2');
  });

  it('handles empty, null, or malformed data gracefully', () => {
    assert.deepEqual(enrichWithCollaborators([]), []);
    assert.deepEqual(enrichWithCollaborators(null), []);
    
    const devs = [
      { login: 'dev1', topRepos: null },
      { login: 'dev2' },
      null,
    ];
    const result = enrichWithCollaborators(devs);
    assert.equal(result.length, 3);
    assert.deepEqual(result[0].collaborators, []);
    assert.deepEqual(result[1].collaborators, []);
  });
});
