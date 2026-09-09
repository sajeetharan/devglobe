import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bannerSource = await readFile(new URL('../components/PlatformActivityBanner.jsx', import.meta.url), 'utf8');
const homeSource = await readFile(new URL('../app/page.jsx', import.meta.url), 'utf8');

test('homepage activity ribbon includes anonymized Reddit feedback', () => {
  assert.match(bannerSource, /The 3D globe looks really slick in the editor\./);
  assert.match(bannerSource, /The globe is a nice hook, but the mission match is prob the sticky part\./);
  assert.match(bannerSource, /Anonymous developer/);
  assert.doesNotMatch(bannerSource, /Outrageous_Ad_4801|NoRelation8434/);
});

test('feedback ribbon remains visible for signed-in and signed-out visitors', () => {
  assert.match(homeSource, /\{!tourStep && <PlatformActivityBanner \/>\}/);
  assert.match(homeSource, /\{!tourStep && user && claimStatus === 'claimed'/);
});
