import test from 'node:test';
import assert from 'node:assert/strict';
import { attributedInstallUrl, editorChannels, editorInstallSteps, getEditorChannel } from '../lib/editor-distribution.js';

test('defines unique canonical editor channels', () => {
  const slugs = editorChannels.map(editor => editor.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(getEditorChannel('cursor')?.status, 'available');
  assert.equal(getEditorChannel('jetbrains')?.status, 'planned');
  assert.equal(getEditorChannel('unknown'), null);
});

test('only available clients expose installation steps and attributed links', () => {
  const cursor = getEditorChannel('cursor');
  const jetbrains = getEditorChannel('jetbrains');
  const installUrl = new URL(attributedInstallUrl(cursor));
  assert.equal(editorInstallSteps(cursor).length, 3);
  assert.deepEqual(editorInstallSteps(jetbrains), []);
  assert.equal(attributedInstallUrl(jetbrains), null);
  assert.match(installUrl.pathname, /v0\.3\.0\/devglobe-developer-discovery-0\.3\.0\.vsix$/);
  assert.equal(installUrl.searchParams.get('utm_campaign'), 'cursor');
  assert.equal(installUrl.searchParams.get('utm_medium'), 'plugin_directory');
});