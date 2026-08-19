import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeveloperFunFact } from '../lib/card-fun-fact.js';

test('returns a generated OpenAI fun fact', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'TypeScript leads your open-source toolkit with 1,250 stars in orbit.' } }],
    }));
  };

  assert.equal(
    await getDeveloperFunFact(
      { login: 'octocat', topLanguage: 'TypeScript', totalStars: 1_250 },
      { fetchImpl, endpoint: 'https://example.openai.azure.com/', apiKey: 'secret', deployment: 'gpt-4o-mini' }
    ),
    'TypeScript leads your open-source toolkit with 1,250 stars in orbit.'
  );
  assert.match(request.url, /deployments\/gpt-4o-mini\/chat\/completions/);
  assert.equal(request.options.headers['api-key'], 'secret');
  const body = JSON.parse(request.options.body);
  assert.equal(JSON.parse(body.messages[1].content).login, 'octocat');
});

test('falls back through stars, followers, contributions, language, and default copy', async () => {
  assert.equal(
    await getDeveloperFunFact({ totalStars: 118 }),
    'Your open-source work has earned 118 stars.'
  );
  assert.equal(
    await getDeveloperFunFact({ followers: 1_500 }),
    '1,500 developers follow your open-source work.'
  );
  assert.equal(
    await getDeveloperFunFact({ totalCommits: 720 }),
    "You've logged 720 public contributions."
  );
  assert.equal(
    await getDeveloperFunFact({ topLanguage: 'Rust' }),
    'Rust is your top language.'
  );
  assert.equal(
    await getDeveloperFunFact(),
    'Your open-source journey is now mapped on DevGlobe.'
  );
});

test('uses the fallback for failed or invalid OpenAI responses', async () => {
  const options = { endpoint: 'https://example.com', apiKey: 'secret', deployment: 'chat' };
  assert.equal(
    await getDeveloperFunFact(
      { totalStars: -10, followers: 'invalid', topLanguage: 'Go' },
      { ...options, fetchImpl: async () => new Response('{}', { status: 500 }) }
    ),
    'Go is your top language.'
  );
  assert.equal(
    await getDeveloperFunFact(
      { totalStars: 118 },
      { ...options, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x'.repeat(141) } }] })) }
    ),
    'Your open-source work has earned 118 stars.'
  );
});