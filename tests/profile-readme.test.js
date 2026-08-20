import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultReadmeAbout, generateProfileReadme, resolveReadmeAccess } from '../lib/profile-readme.js';

function developer(overrides = {}) {
  return {
    login: 'octo-dev',
    name: 'Octo Dev',
    bio: 'Building tools & APIs',
    location: 'Colombo | Sri Lanka',
    topLanguage: 'TypeScript',
    languages: [{ name: 'TypeScript' }, { name: 'JavaScript' }],
    totalStars: 1234,
    totalCommits: 5678,
    followers: 90,
    globalRank: 12,
    countryRank: 2,
    country: 'Sri Lanka',
    soUserId: 12345,
    soReputation: 4200,
    topRepos: [{ name: 'handy-tools', url: 'https://github.com/octo-dev/handy-tools', stars: 77, description: 'Useful *things*' }],
    ...overrides,
  };
}

test('generateProfileReadme builds a portable profile README', () => {
  const markdown = generateProfileReadme(developer(), { siteUrl: 'https://devglobe.test/' });

  assert.match(markdown, /# Hi, I'm Octo Dev/);
  assert.match(markdown, /https:\/\/devglobe\.test\/api\/badge\/octo-dev\.svg/);
  assert.match(markdown, /\| Stars \| 1,234 \|/);
  assert.match(markdown, /TypeScript · JavaScript/);
  assert.match(markdown, /\[handy\\-tools\]\(https:\/\/github\.com\/octo-dev\/handy-tools\)/);
  assert.match(markdown, /\[Stack Overflow\]\(https:\/\/stackoverflow\.com\/users\/12345\)/);
});

test('generateProfileReadme escapes profile-sourced Markdown and omits unavailable sections', () => {
  const markdown = generateProfileReadme(developer({
    name: '[Click me](https://example.com)',
    bio: null,
    location: null,
    topLanguage: null,
    languages: [],
    topRepos: [],
    soUserId: null,
    soReputation: null,
    globalRank: null,
    countryRank: null,
    totalStars: null,
    totalCommits: null,
    followers: null,
  }));

  assert.ok(markdown.includes("# Hi, I'm \\[Click me\\]\\(https://example\\.com\\)"));
  assert.doesNotMatch(markdown, /## Languages/);
  assert.doesNotMatch(markdown, /## Featured projects/);
  assert.doesNotMatch(markdown, /## Open-source snapshot/);
  assert.doesNotMatch(markdown, /Stack Overflow/);
});

test('generateProfileReadme preserves a custom About me section', () => {
  const markdown = generateProfileReadme(developer(), { about: 'I build **developer tools**.\n\n- Currently shipping APIs' });
  assert.match(markdown, /I build \*\*developer tools\*\*\.\n\n- Currently shipping APIs/);
});

test('defaultReadmeAbout creates a fallback and a login is required', () => {
  assert.equal(defaultReadmeAbout({ topLanguage: 'C#', location: 'Paris' }), 'I am a developer focused on C\\# and open source based in Paris.');
  assert.throws(() => generateProfileReadme({}), /login is required/);
});

test('resolveReadmeAccess requires GitHub ownership and a claimed profile', () => {
  const dev = developer({ claimed: false });
  assert.equal(resolveReadmeAccess(dev, null), 'sign-in');
  assert.equal(resolveReadmeAccess(dev, { login: 'someone-else' }), 'unavailable');
  assert.equal(resolveReadmeAccess(dev, { login: 'OCTO-DEV' }), 'claim');
  assert.equal(resolveReadmeAccess(dev, { login: 'octo-dev' }, true), 'generate');
  assert.equal(resolveReadmeAccess({ ...dev, claimed: true }, { login: 'octo-dev' }), 'generate');
});