import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedMutationOrigin } from '../lib/request-origin.js';

function request(url, headers = {}) {
  return { url, headers: new Headers(headers) };
}

test('allows requests without an Origin header', () => {
  assert.equal(isAllowedMutationOrigin(request('http://localhost:3000/api/example')), true);
});

test('allows direct same-origin mutations', () => {
  assert.equal(isAllowedMutationOrigin(request('http://localhost:3000/api/example', {
    origin: 'http://localhost:3000',
    host: 'localhost:3000',
  })), true);
});

test('allows the public origin forwarded by a trusted proxy boundary', () => {
  assert.equal(isAllowedMutationOrigin(request('http://app:3000/api/example', {
    origin: 'https://www.devglobe.dev',
    host: 'app:3000',
    'x-forwarded-host': 'www.devglobe.dev',
    'x-forwarded-proto': 'https',
  })), true);
});

test('rejects cross-origin and malformed origins', () => {
  assert.equal(isAllowedMutationOrigin(request('https://www.devglobe.dev/api/example', {
    origin: 'https://attacker.example',
    host: 'www.devglobe.dev',
  })), false);
  assert.equal(isAllowedMutationOrigin(request('https://www.devglobe.dev/api/example', {
    origin: 'not-a-url',
  })), false);
});