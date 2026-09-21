import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVibeCard,
  formatVibeDuration,
  normalizeVibeCardIdentity,
  vibeShareText,
} from '../lib/vibe-card.js';
import { findVibeCard, saveVibeCard } from '../lib/vibe-card-store.js';

const vibeId = '123e4567-e89b-42d3-a456-426614174000';

test('builds a bounded public Vibe Card from opt-in presence metadata', () => {
  const card = buildVibeCard({
    login: 'OctoCat',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.example/octo.png',
    activeLanguage: 'TypeScript',
    codingAgent: 'GitHub Copilot',
    codingModel: 'GPT',
    editor: 'VS Code',
  }, {
    durationMinutes: 47,
    developerCount: 12,
    countryCount: 5,
    waveCount: 2,
  }, {
    vibeId,
    now: new Date('2026-09-21T14:00:00.000Z'),
  });

  assert.deepEqual(card, {
    id: `vibe:${vibeId}`,
    type: 'vibe-card',
    vibeId,
    login: 'octocat',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.example/octo.png',
    activeLanguage: 'TypeScript',
    codingAgent: 'GitHub Copilot',
    codingModel: 'GPT',
    editor: 'VS Code',
    durationMinutes: 47,
    developerCount: 12,
    countryCount: 5,
    waveCount: 2,
    createdAt: '2026-09-21T14:00:00.000Z',
    ttl: 34560000,
  });
  assert.equal('location' in card, false);
  assert.equal('repository' in card, false);
});

test('formats and describes a Vibe Card for social sharing', () => {
  const card = {
    durationMinutes: 125,
    activeLanguage: 'TypeScript',
    codingAgent: 'GitHub Copilot',
    developerCount: 12,
    countryCount: 5,
  };
  assert.equal(formatVibeDuration(card.durationMinutes), '2h 5m');
  assert.equal(
    vibeShareText(card),
    'I just finished a 2h 5m TypeScript vibe coding session with GitHub Copilot alongside 12 developers across 5 countries.',
  );
});

test('rejects invalid public Vibe Card identities', () => {
  assert.deepEqual(normalizeVibeCardIdentity('OctoCat', vibeId), { login: 'octocat', vibeId });
  assert.equal(normalizeVibeCardIdentity('../private', vibeId), null);
  assert.equal(normalizeVibeCardIdentity('octocat', 'not-a-card'), null);
});

test('stores and reads Vibe Cards by login partition without exposing storage metadata', async () => {
  let stored;
  const container = {
    items: {
      create: async card => {
        stored = { ...card, _etag: 'private-storage-metadata' };
        return { resource: stored };
      },
    },
    item: (id, partitionKey) => ({
      read: async () => {
        assert.equal(id, `vibe:${vibeId}`);
        assert.equal(partitionKey, 'octocat');
        return { resource: stored };
      },
    }),
  };
  await saveVibeCard({
    login: 'octocat',
    name: 'Octo Cat',
    activeLanguage: 'TypeScript',
    editor: 'VS Code',
  }, {
    durationMinutes: 25,
    developerCount: 3,
    countryCount: 2,
    waveCount: 1,
  }, {
    container,
    vibeId,
    now: new Date('2026-09-21T14:00:00.000Z'),
  });
  const card = await findVibeCard('OctoCat', vibeId, container);
  assert.equal(card.name, 'Octo Cat');
  assert.equal(card.durationMinutes, 25);
  assert.equal('_etag' in card, false);
  assert.equal('ttl' in card, false);
});
