import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export class AgentRequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AgentRequestValidationError';
  }
}

export function hashAgentToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Computes how many seconds an agent must wait before its oldest request in
 * the current rate-limit window rolls off, so a 429 response can advertise a
 * concrete, honest Retry-After value instead of a fixed guess.
 */
export function computeRetryAfterSeconds(oldestRequestAt, windowMs, now = new Date()) {
  const resetAt = new Date(oldestRequestAt).getTime() + windowMs;
  return Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
}

export function parseAgentKeys(value) {
  if (!value) return [];

  let keys;
  try {
    keys = JSON.parse(value);
  } catch {
    throw new Error('DEVGLOBE_AGENT_KEYS must be valid JSON');
  }

  if (!Array.isArray(keys)) {
    throw new Error('DEVGLOBE_AGENT_KEYS must be a JSON array');
  }

  return keys.map(key => {
    if (!key || typeof key !== 'object' || !key.id || !key.name || !key.owner) {
      throw new Error('Each agent key requires id, name, owner, and tokenHash');
    }
    if (!/^[a-f\d]{64}$/i.test(key.tokenHash || '')) {
      throw new Error(`Agent key ${key.id} requires a SHA-256 tokenHash`);
    }
    return {
      id: String(key.id).slice(0, 100),
      name: String(key.name).slice(0, 120),
      owner: String(key.owner).slice(0, 200),
      tokenHash: key.tokenHash.toLowerCase(),
    };
  });
}

export function authenticateAgent(authorization, configuredKeys) {
  const match = /^Bearer ([^\s]+)$/.exec(authorization || '');
  if (!match) return null;

  const candidate = Buffer.from(hashAgentToken(match[1]), 'hex');
  for (const key of configuredKeys) {
    const expected = Buffer.from(key.tokenHash, 'hex');
    if (timingSafeEqual(candidate, expected)) {
      const { tokenHash, ...identity } = key;
      return identity;
    }
  }
  return null;
}

export function normalizeIntroductionRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AgentRequestValidationError('Request body must be an object');
  }

  const developerLogin = String(input.developerLogin || '').trim();
  const reason = String(input.reason || '').trim();
  const project = String(input.project || '').trim();

  if (!GITHUB_LOGIN.test(developerLogin)) {
    throw new AgentRequestValidationError('A valid developer login is required');
  }
  if (reason.length < 20 || reason.length > 1000) {
    throw new AgentRequestValidationError('Reason must be between 20 and 1000 characters');
  }
  if (project.length < 2 || project.length > 200) {
    throw new AgentRequestValidationError('Project must be between 2 and 200 characters');
  }

  return { developerLogin, reason, project };
}

export function normalizeIntroductionDecision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AgentRequestValidationError('Decision must be an object');
  }
  const id = String(input.id || '').trim();
  if (!/^[a-f\d-]{36}$/i.test(id)) {
    throw new AgentRequestValidationError('A valid request id is required');
  }
  if (input.status !== 'accepted' && input.status !== 'declined') {
    throw new AgentRequestValidationError('Status must be accepted or declined');
  }
  return { id, status: input.status };
}

export function createIntroductionDocument(input, agent, now = new Date()) {
  const request = normalizeIntroductionRequest(input);
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return {
    id: randomUUID(),
    developerLogin: request.developerLogin,
    agentId: agent.id,
    requesterAgent: {
      id: agent.id,
      name: agent.name,
      owner: agent.owner,
    },
    reason: request.reason,
    project: request.project,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
