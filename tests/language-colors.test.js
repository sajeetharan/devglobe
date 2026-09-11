import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLanguageColor,
  LANGUAGE_COLORS,
  LANGUAGE_FALLBACK_COLOR,
} from '../lib/language-colors.js';

test('matches language colors regardless of editor ID casing', () => {
  assert.equal(getLanguageColor('TypeScript'), LANGUAGE_COLORS.TypeScript);
  assert.equal(getLanguageColor('typescript'), LANGUAGE_COLORS.TypeScript);
  assert.equal(getLanguageColor(' JAVASCRIPT '), LANGUAGE_COLORS.JavaScript);
  assert.equal(getLanguageColor('markdown'), LANGUAGE_COLORS.Markdown);
});

test('uses the fallback color for missing and unknown languages', () => {
  assert.equal(getLanguageColor('Ready to code'), LANGUAGE_FALLBACK_COLOR);
  assert.equal(getLanguageColor(''), LANGUAGE_FALLBACK_COLOR);
});
