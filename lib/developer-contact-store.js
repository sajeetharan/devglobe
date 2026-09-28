import { getCosmosContainer } from './cosmos.js';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CONTACT_SOURCES = new Set(['github-oauth', 'self-nomination']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_DELIVERY_CLAIM_TTL_MS = 15 * 60 * 1000;
export const VERIFICATION_REMINDER_INTERVAL_MS = 72 * 60 * 60 * 1000;

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

export async function setProductUpdatesPreference(login, enabled, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login) return { updated: false, reason: 'not_configured' };

  const id = String(login).trim().toLowerCase();
  const contact = await readExistingContact(container, id);
  if (!contact) return { updated: false, reason: 'not_found' };
  if (enabled && contact.emailVerified !== true) {
    return { updated: false, reason: 'email_not_verified' };
  }

  const document = {
    ...stripSystemFields(contact),
    productUpdatesEnabled: enabled === true,
    updatedAt: options.now || new Date().toISOString(),
  };
  const { resource } = await container.item(id, id).replace(document, {
    accessCondition: { type: 'IfMatch', condition: contact._etag },
  });
  return { updated: true, contact: resource || document };
}

export async function* iterateWeeklyDigestContacts(options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container) return;

  const iterator = container.items.query({
    query: `SELECT c.id, c.login, c.email, c.lastWeeklyDigestRank, c.lastWeeklyDigestWeek
      FROM c
      WHERE c.emailVerified = true AND c.productUpdatesEnabled = true`,
  }, { maxItemCount: options.pageSize || 100 });

  while (iterator.hasMoreResults()) {
    const { resources = [] } = await iterator.fetchNext();
    for (const contact of resources) yield contact;
  }
}

export async function recordWeeklyDigestDelivery(login, delivery, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login) return { updated: false, reason: 'not_configured' };

  const id = String(login).trim().toLowerCase();
  const contact = await readExistingContact(container, id);
  if (!contact) return { updated: false, reason: 'not_found' };

  const document = {
    ...stripSystemFields(contact),
    lastWeeklyDigestRank: delivery.rank,
    lastWeeklyDigestWeek: delivery.weekKey,
    lastWeeklyDigestSentAt: delivery.sentAt,
    lastWeeklyDigestUpdateType: delivery.updateType,
    updatedAt: delivery.sentAt,
  };
  await container.item(id, id).replace(document, {
    accessCondition: { type: 'IfMatch', condition: contact._etag },
  });
  return { updated: true };
}

export async function recordWeeklyDigestBaseline(login, rank, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login) return { updated: false, reason: 'not_configured' };

  const id = String(login).trim().toLowerCase();
  const contact = await readExistingContact(container, id);
  if (!contact) return { updated: false, reason: 'not_found' };
  const updatedAt = options.now || new Date().toISOString();
  const document = {
    ...stripSystemFields(contact),
    lastWeeklyDigestRank: rank,
    updatedAt,
  };
  await container.item(id, id).replace(document, {
    accessCondition: { type: 'IfMatch', condition: contact._etag },
  });
  return { updated: true };
}

function hashVerificationToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function stripSystemFields(document) {
  return Object.fromEntries(Object.entries(document).filter(([key]) => !key.startsWith('_')));
}

export async function createEmailVerification(login, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login) return { created: false, reason: 'not_configured' };

  const id = String(login).trim().toLowerCase();
  const contact = await readExistingContact(container, id);
  if (!contact) return { created: false, reason: 'not_found' };
  if (contact.emailVerified === true) return { created: false, reason: 'already_verified' };

  const now = options.now ? new Date(options.now) : new Date();
  const token = options.token || randomBytes(32).toString('base64url');
  const document = {
    ...stripSystemFields(contact),
    emailVerificationTokenHash: hashVerificationToken(token),
    emailVerificationExpiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS).toISOString(),
    updatedAt: now.toISOString(),
  };
  const item = container.item(id, id);
  await item.replace(document, {
    accessCondition: { type: 'IfMatch', condition: contact._etag },
  });

  return { created: true, token, email: contact.email };
}

export async function verifyDeveloperContactEmail(login, token, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login || !token) return { verified: false, reason: 'invalid' };

  const id = String(login).trim().toLowerCase();
  const contact = await readExistingContact(container, id);
  if (!contact) return { verified: false, reason: 'invalid' };
  if (contact.emailVerified === true) return { verified: true, reason: 'already_verified' };

  const expiresAt = Date.parse(contact.emailVerificationExpiresAt || '');
  const now = options.now ? new Date(options.now) : new Date();
  const expectedHash = contact.emailVerificationTokenHash || '';
  const actualHash = hashVerificationToken(String(token));
  const hashesMatch = expectedHash.length === actualHash.length
    && timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
  if (!hashesMatch || !Number.isFinite(expiresAt) || expiresAt < now.getTime()) {
    return { verified: false, reason: 'invalid' };
  }

  const document = stripSystemFields(contact);
  delete document.emailVerificationTokenHash;
  delete document.emailVerificationExpiresAt;
  document.emailVerified = true;
  document.emailVerifiedAt = now.toISOString();
  document.updatedAt = now.toISOString();
  const item = container.item(id, id);
  await item.replace(document, {
    accessCondition: { type: 'IfMatch', condition: contact._etag },
  });

  return { verified: true };
}

export function isVerificationReminderDue(contact, now = new Date()) {
  if (!contact?.email || contact.emailVerified === true || contact.transactionalEmailsEnabled !== true) {
    return false;
  }

  const lastReminderAt = Date.parse(contact.lastVerificationReminderAt || '');
  return !Number.isFinite(lastReminderAt) || now.getTime() - lastReminderAt >= VERIFICATION_REMINDER_INTERVAL_MS;
}

export async function* iterateVerificationReminderContacts(options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container) return;

  const now = options.now ? new Date(options.now) : new Date();
  const iterator = container.items.query({
    query: `SELECT c.id, c.login, c.email, c.emailVerified, c.transactionalEmailsEnabled, c.lastVerificationReminderAt
      FROM c
      WHERE NOT IS_DEFINED(c.type) OR c.type != "email-delivery-state"`,
  }, { maxItemCount: options.pageSize || 100 });

  while (iterator.hasMoreResults()) {
    const { resources = [] } = await iterator.fetchNext();
    for (const contact of resources) {
      if (isVerificationReminderDue(contact, now)) yield contact;
    }
  }
}

export async function recordEmailVerificationReminder(login, delivery, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !login) return { updated: false, reason: 'not_configured' };

  const id = String(login).trim().toLowerCase();
  const contact = await readExistingContact(container, id);
  if (!contact) return { updated: false, reason: 'not_found' };
  if (contact.emailVerified === true) return { updated: false, reason: 'already_verified' };

  const sentAt = delivery.sentAt || new Date().toISOString();
  const document = {
    ...stripSystemFields(contact),
    lastVerificationReminderAt: sentAt,
    verificationReminderCount: Math.max(Number(contact.verificationReminderCount) || 0, 0) + 1,
    updatedAt: sentAt,
  };
  const { resource } = await container.item(id, id).replace(document, {
    accessCondition: { type: 'IfMatch', condition: contact._etag },
  });
  return { updated: true, contact: resource || document };
}

function emailDeliveryClaimId(campaign, recipient, secret) {
  const emailHash = createHmac('sha256', secret).update(normalizeContactEmail(recipient)).digest('hex');
  return `email-delivery-${campaign}-${emailHash}`;
}

function isConflict(error) {
  return error?.code === 409 || error?.code === 412 || error?.statusCode === 409 || error?.statusCode === 412;
}

export async function claimEmailDelivery(input, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container) return { claimed: false, reason: 'not_configured' };

  const now = options.now ? new Date(options.now) : new Date();
  const campaign = String(input.campaign || '').trim().toLowerCase();
  const deliveryKey = String(input.deliveryKey || '').trim();
  const hashSecret = options.hashSecret || process.env.EMAIL_DELIVERY_HASH_SECRET || process.env.CRON_SECRET;
  if (!campaign || !deliveryKey || !hashSecret) return { claimed: false, reason: 'invalid' };
  const id = emailDeliveryClaimId(campaign, input.recipient, hashSecret);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readExistingContact(container, id);
    const deliveredAt = Date.parse(existing?.lastDeliveredAt || '');
    const claimExpiresAt = Date.parse(existing?.claimExpiresAt || '');
    if (existing?.lastDeliveryKey === deliveryKey) return { claimed: false, reason: 'already_delivered' };
    if (Number.isFinite(input.minimumIntervalMs)
      && Number.isFinite(deliveredAt)
      && now.getTime() - deliveredAt < input.minimumIntervalMs) {
      return { claimed: false, reason: 'recently_delivered' };
    }
    if (Number.isFinite(claimExpiresAt) && claimExpiresAt > now.getTime()) {
      return { claimed: false, reason: 'in_progress' };
    }

    const document = {
      ...(existing ? stripSystemFields(existing) : {}),
      id,
      type: 'email-delivery-state',
      campaign,
      claimKey: deliveryKey,
      claimToken: randomBytes(16).toString('hex'),
      claimedAt: now.toISOString(),
      claimExpiresAt: new Date(now.getTime() + EMAIL_DELIVERY_CLAIM_TTL_MS).toISOString(),
      updatedAt: now.toISOString(),
    };
    try {
      if (existing) {
        await container.item(id, id).replace(document, {
          accessCondition: { type: 'IfMatch', condition: existing._etag },
        });
      } else {
        await container.items.create(document);
      }
      return { claimed: true, id, deliveryKey, claimToken: document.claimToken };
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  return { claimed: false, reason: 'contention' };
}

export async function completeEmailDelivery(claim, delivery, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !claim?.id) return { completed: false, reason: 'not_configured' };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readExistingContact(container, claim.id);
    if (!existing || existing.claimKey !== claim.deliveryKey || existing.claimToken !== claim.claimToken) {
      return { completed: false, reason: 'stale_claim' };
    }

    const deliveredAt = delivery.deliveredAt || new Date().toISOString();
    const document = stripSystemFields(existing);
    delete document.claimKey;
    delete document.claimToken;
    delete document.claimedAt;
    delete document.claimExpiresAt;
    document.lastDeliveryKey = claim.deliveryKey;
    document.lastDeliveredAt = deliveredAt;
    document.updatedAt = deliveredAt;
    try {
      await container.item(claim.id, claim.id).replace(document, {
        accessCondition: { type: 'IfMatch', condition: existing._etag },
      });
      return { completed: true };
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  return { completed: false, reason: 'contention' };
}

export async function releaseEmailDelivery(claim, options = {}) {
  const container = options.container === undefined ? getContactContainer() : options.container;
  if (!container || !claim?.id) return { released: false, reason: 'not_configured' };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readExistingContact(container, claim.id);
    if (!existing || existing.claimKey !== claim.deliveryKey || existing.claimToken !== claim.claimToken) {
      return { released: false, reason: 'stale_claim' };
    }

    const document = stripSystemFields(existing);
    delete document.claimKey;
    delete document.claimToken;
    delete document.claimedAt;
    delete document.claimExpiresAt;
    document.updatedAt = options.now || new Date().toISOString();
    try {
      await container.item(claim.id, claim.id).replace(document, {
        accessCondition: { type: 'IfMatch', condition: existing._etag },
      });
      return { released: true };
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  return { released: false, reason: 'contention' };
}