import test from 'node:test';
import assert from 'node:assert/strict';
import { attributedInstallUrl, editorChannels, editorInstallSteps, filterEditorChannels, getEditorChannel } from '../lib/editor-distribution.js';

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
  assert.match(editorInstallSteps(cursor)[2], /verified GitHub name/);
  assert.deepEqual(editorInstallSteps(jetbrains), []);
  assert.equal(attributedInstallUrl(jetbrains), null);
  assert.match(installUrl.pathname, /v0\.4\.0\/devglobe-developer-discovery-0\.4\.0\.vsix$/);
  assert.equal(installUrl.searchParams.get('utm_campaign'), 'cursor');
  assert.equal(installUrl.searchParams.get('utm_medium'), 'plugin_directory');
});

test('filters editor connections by status, name, family, and aliases', () => {
  assert.deepEqual(filterEditorChannels(editorChannels, { query: 'cursor' }).map(editor => editor.slug), ['cursor']);
  assert.deepEqual(filterEditorChannels(editorChannels, { query: 'pycharm' }).map(editor => editor.slug), ['jetbrains']);
  assert.deepEqual(filterEditorChannels(editorChannels, { query: 'claude' }).map(editor => editor.slug), ['cli']);
  assert.equal(filterEditorChannels(editorChannels, { query: 'vs code', status: 'available' }).length, 7);
  assert.deepEqual(filterEditorChannels(editorChannels, { status: 'planned' }).map(editor => editor.slug), ['jetbrains', 'cli']);
});