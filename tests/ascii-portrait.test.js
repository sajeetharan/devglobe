import test from 'node:test';
import assert from 'node:assert/strict';
import { luminance, imageToAscii, renderProfileCardSvg } from '../lib/ascii-portrait.js';
import { buildCardDetails } from '../lib/profile-card-lookup.js';

function solidImage(width, height, rgba) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return { width, height, data };
}

test('luminance weights green most heavily', () => {
  assert.ok(luminance(0, 255, 0) > luminance(255, 0, 0));
  assert.ok(luminance(255, 0, 0) > luminance(0, 0, 255));
});

test('imageToAscii cuts out the background and keeps foreground', () => {
  // 4x2: left half dark foreground, right half matches the (white) corners => background.
  const width = 4; const height = 2;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dark = x < 2;
      data[i] = dark ? 20 : 255;
      data[i + 1] = dark ? 20 : 255;
      data[i + 2] = dark ? 20 : 255;
      data[i + 3] = 255;
    }
  }
  const rows = imageToAscii({ width, height, data }, 4, 2);
  assert.equal(rows.length, 2);
  // Foreground (dark) becomes a dense glyph; background (white corners) is trimmed to empty.
  assert.match(rows[0], /^[@%#]/);
  assert.equal(rows[0].replace(/\s+$/, '').length <= 2, true);
});

test('renderProfileCardSvg produces a terminal card with escaped details', () => {
  const svg = renderProfileCardSvg({
    login: 'octo-dev',
    portrait: ['@@  ', ' ## '],
    details: [['Name', 'A & B <x>'], ['Stars', '1,234']],
    theme: 'dark',
  });
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg/);
  assert.match(svg, /octo-dev@github/);
  assert.match(svg, /A &amp; B &lt;x&gt;/);
  assert.doesNotMatch(svg, /<x>/);
  assert.match(svg, /1,234/);
  assert.match(svg, /<\/svg>/);
});

test('renderProfileCardSvg honors the light theme background', () => {
  const light = renderProfileCardSvg({ login: 'octo-dev', theme: 'light' });
  assert.match(light, /#ffffff/);
});

test('buildCardDetails includes present fields and falls back when empty', () => {
  const details = buildCardDetails({
    name: 'Octo Dev', location: 'Colombo', topLanguage: 'TypeScript',
    score: 88, globalRank: 12, totalStars: 1234, followers: 90,
  }, 'octo-dev');
  const labels = details.map(([label]) => label);
  assert.deepEqual(labels.slice(0, 3), ['Name', 'Location', 'Language']);
  assert.ok(details.some(([, value]) => value === '88/100'));

  const fallback = buildCardDetails(null, 'octo-dev');
  assert.deepEqual(fallback, [['GitHub', '@octo-dev']]);
});
