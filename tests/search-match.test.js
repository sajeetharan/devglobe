import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSearchMatches, explainSearchMatch, SEARCH_MATCH_DISCLAIMER } from '../lib/search-match.js';

test('explains exact login and public field matches without suitability claims', () => {
  const match = explainSearchMatch({
    login: 'octocat',
    name: 'The Octocat',
    topLanguage: 'TypeScript',
    location: 'London, UK',
  }, '@octocat', { mode: 'text' });

  assert.equal(match.score, 100);
  assert.equal(match.label, 'Strong match');
  assert.deepEqual(match.signals, ['text']);
  assert.match(match.reasons[0], /Exact GitHub login/);
  assert.equal(match.disclaimer, SEARCH_MATCH_DISCLAIMER);
});

test('explains language and location evidence using visible public fields', () => {
  const match = explainSearchMatch({
    login: 'typed-dev',
    topLanguage: 'TypeScript',
    location: 'Berlin, Germany',
  }, 'TypeScript developer in Berlin', { mode: 'text', rank: 2 });

  assert.equal(match.score, 88);
  assert.deepEqual(match.reasons, [
    'Primary language matches TypeScript',
    'Location matches Berlin, Germany',
  ]);
});

test('explains one-letter programming language matches', () => {
  const match = explainSearchMatch({ login: 'kernel-dev', topLanguage: 'C' }, 'C', { mode: 'text' });

  assert.equal(match.score, 88);
  assert.deepEqual(match.reasons, ['Primary language matches C']);
});

test('labels semantic rank as an ordinal discovery signal', () => {
  const first = explainSearchMatch({ login: 'first' }, 'AI agent builder', { mode: 'vector', rank: 0 });
  const tenth = explainSearchMatch({ login: 'tenth' }, 'AI agent builder', { mode: 'vector', rank: 9 });

  assert.equal(first.score, 90);
  assert.equal(tenth.score, 63);
  assert.deepEqual(first.signals, ['semantic']);
  assert.match(first.reasons[0], /ranked this result #1/);
});

test('rewards hybrid results supported by semantic and text retrieval', () => {
  const [result] = attachSearchMatches([{
    login: 'hybrid-dev',
    topLanguage: 'Go',
    _searchVectorRank: 1,
    _searchTextRank: 3,
  }], 'Go maintainer', 'hybrid');

  assert.equal(result.match.score, 95);
  assert.deepEqual(result.match.signals, ['semantic', 'text']);
  assert.match(result.match.reasons.join(' '), /both semantic similarity and public profile text/);
  assert.equal('_searchVectorRank' in result, false);
  assert.equal('_searchTextRank' in result, false);
});

test('decorating results does not mutate source records', () => {
  const source = [{ login: 'stable-dev', relevance: 0.14, _searchTextRank: 0 }];
  const decorated = attachSearchMatches(source, 'stable', 'hybrid');

  assert.notEqual(decorated[0], source[0]);
  assert.equal(source[0]._searchTextRank, 0);
  assert.equal(source[0].relevance, 0.14);
  assert.equal('match' in source[0], false);
  assert.equal('relevance' in decorated[0], false);
});