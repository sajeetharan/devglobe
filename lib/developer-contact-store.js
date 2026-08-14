import { getCosmosContainer } from './cosmos.js';

const CONTACT_SOURCES = new Set(['github-oauth', 'self-nomination']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class DeveloperContactValidationError extends Error {}

export function normalizeContactEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new DeveloperContactValidationError('Please enter a valid email address.');
  }
  return email;
}

export function buildDeveloperContact(input, existing = null, now = new Date().toISOString()) {
  const login = String(input.login || '').trim();
  const id = login.toLowerCase();
  if (!id) throw new DeveloperContactValidationError('GitHub login is required.');
  if (!CONTACT_SOURCES.has(input.source)) {
    throw new DeveloperContactValidationError('Unsupported email source.');
  }

  const email = normalizeContactEmail(input.email);
  const sameVerifiedEmail = existing?.email === email && existing?.emailVerified === true;

  return {
    id,
    login,
    email,
    emailVerified: input.emailVerified === true || sameVerifiedEmail,
    source: input.source,
    transactionalEmailsEnabled: input.transactionalEmailsEnabled === true,
    productUpdatesEnabled: existing?.email === email && existing?.productUpdatesEnabled === true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function getContactContainer() {
  return getCosmosContainer(process.env.COSMOS_CONTACTS_CONTAINER || 'developer-contacts');
}

async function readExistingContact(container, id) {
  try {
    const { resource } = await container.item(id, id).read();
    return resource || null;
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function saveDeveloperContact(input, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container) return { saved: false, reason: 'not_configured' };

  const id = String(input.login || '').trim().toLowerCase();
  const existing = id ? await readExistingContact(container, id) : null;
  const document = buildDeveloperContact(input, existing, options.now);
  const { resource } = await container.items.upsert(document);
  return { saved: true, contact: resource || document };
}

export async function getDeveloperContact(login, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login) return null;
  return readExistingContact(container, String(login).trim().toLowerCase());
}