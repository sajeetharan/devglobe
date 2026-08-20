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

test('generateProfileReadme builds a profile-styled README', () => {
  const markdown = generateProfileReadme(developer(), { siteUrl: 'https://devglobe.test/' });

  assert.match(markdown, /# Hey, I'm Octo Dev 👋/);
  assert.match(markdown, /api\/profile-card\/octo-dev\.svg\?theme=dark/);
  assert.match(markdown, /<picture>/);
  assert.match(markdown, /komarev\.com\/ghpvc\/\?username=octo-dev/);
  assert.match(markdown, /## 🚀 About Me/);
  assert.match(markdown, /## 🏆 Community Impact/);
  assert.match(markdown, /Ranked \*\*#12 globally\*\* on DevGlobe/);
  assert.match(markdown, /github-readme-stats\.vercel\.app\/api\?username=octo-dev/);
  assert.match(markdown, /## 🛠️ Tech Stack/);
  assert.match(markdown, /\*\*Languages & Frameworks\*\*/);
  assert.match(markdown, /img\.shields\.io\/badge\/TypeScript-3178C6/);
  assert.match(markdown, /stackoverflow\.com\/users\/flair\/12345\.png/);
  assert.match(markdown, /https:\/\/devglobe\.test\/api\/badge\/octo-dev\.svg/);
});

test('generateProfileReadme adds an italic subtitle only from a multi-sentence bio', () => {
  const multi = generateProfileReadme(developer({ bio: 'Principal engineer. I build developer tools and APIs.' }));
  assert.ok(multi.includes('*Principal engineer\\.*'));

  const single = generateProfileReadme(developer({ bio: 'Building tools and APIs' }));
  assert.doesNotMatch(single, /\n\*Building tools and APIs\*/);

  const explicit = generateProfileReadme(developer({ bio: null }), { headline: 'Open to collaboration' });
  assert.match(explicit, /\*Open to collaboration\*/);
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
    cityRank: null,
    city: null,
    score: null,
    totalStars: null,
    totalCommits: null,
    followers: null,
  }));

  assert.ok(markdown.includes("# Hey, I'm \\[Click me\\]\\(https://example\\.com\\) 👋"));
  assert.doesNotMatch(markdown, /## 🛠️ Tech Stack/);
  assert.doesNotMatch(markdown, /## 🔥 Featured Projects/);
  assert.doesNotMatch(markdown, /## 🏆 Community Impact/);
  assert.doesNotMatch(markdown, /## 🏅 Stack Overflow/);
  // GitHub Stats is always included.
  assert.match(markdown, /## 📊 GitHub Stats/);
});

test('generateProfileReadme includes optional social badges only when present', () => {
  const withSocials = generateProfileReadme(developer({ website: 'octo.dev', twitter: '@octo', linkedin: 'octo-dev' }));
  assert.match(withSocials, /img\.shields\.io\/badge\/Website/);
  assert.match(withSocials, /img\.shields\.io\/badge\/LinkedIn/);
  assert.match(withSocials, /img\.shields\.io\/badge\/X-/);
  assert.match(withSocials, /twitter\.com\/octo/);

  const withoutSocials = generateProfileReadme(developer({ website: null, twitter: null, linkedin: null }));
  assert.doesNotMatch(withoutSocials, /img\.shields\.io\/badge\/Website/);
  assert.doesNotMatch(withoutSocials, /img\.shields\.io\/badge\/LinkedIn/);
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