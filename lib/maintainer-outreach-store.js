import { getCosmosContainer } from './cosmos.js';
import { followUpDueAt, MAINTAINER_OUTREACH_MAX_ATTEMPTS } from './maintainer-outreach.js';

const memoryRecords = new Map();

function loginOf(value) {
  return String(value || '').trim().toLowerCase();
}

export function getMaintainerOutreachContainer() {
  return getCosmosContainer(process.env.COSMOS_MAINTAINER_OUTREACH_CONTAINER || 'maintainer-outreach');
}

export async function getMaintainerOutreachRecord(login, container = getMaintainerOutreachContainer()) {
  const normalizedLogin = loginOf(login);
  if (!container) return memoryRecords.get(normalizedLogin) || null;
  try {
    const { resource } = await container.item(normalizedLogin, normalizedLogin).read();
    return resource || null;
  } catch (error) {
    if (error.code === 404 || error.statusCode === 404) return null;
    throw error;
  }
}

export async function listMaintainerOutreachRecords(status, container = getMaintainerOutreachContainer()) {
  if (!container) {
    return [...memoryRecords.values()]
      .filter(record => !status || record.status === status)
      .sort((left, right) => right.selectedAt.localeCompare(left.selectedAt));
  }
  const query = status
    ? {
        query: 'SELECT * FROM c WHERE c.documentType = "maintainer-outreach" AND c.status = @status ORDER BY c.selectedAt DESC',
        parameters: [{ name: '@status', value: status }],
      }
    : 'SELECT * FROM c WHERE c.documentType = "maintainer-outreach" ORDER BY c.selectedAt DESC';
  const { resources } = await container.items.query(query).fetchAll();
  return resources;
}

async function replaceRecord(record, container) {
  if (!container) {
    memoryRecords.set(record.login, record);
    return record;
  }
  const { resource } = await container.item(record.id, record.login).replace(record, {
    accessCondition: record._etag ? { type: 'IfMatch', condition: record._etag } : undefined,
  });
  return resource;
}

export async function saveMaintainerOutreachDraft(draft, container = getMaintainerOutreachContainer()) {
  const existing = await getMaintainerOutreachRecord(draft.login, container);
  const updatedAt = new Date().toISOString();
  if (!existing) {
    const document = { ...draft, createdAt: updatedAt, updatedAt, attemptHistory: [] };
    if (!container) {
      memoryRecords.set(document.login, document);
      return document;
    }
    try {
      const { resource } = await container.items.create(document);
      return resource;
    } catch (error) {
      if (error.code === 409 || error.statusCode === 409) return getMaintainerOutreachRecord(draft.login, container);
      throw error;
    }
  }
  if (existing.status !== 'sent' || draft.attempt !== existing.attempt + 1) return existing;
  return replaceRecord({
    ...existing,
    ...draft,
    createdAt: existing.createdAt,
    updatedAt,
    approvedAt: null,
    approvedBy: null,
    sentAt: null,
    followUpDueAt: null,
    attemptHistory: [
      ...(existing.attemptHistory || []),
      { attempt: existing.attempt, sentAt: existing.sentAt },
    ],
  }, container);
}

export async function updateMaintainerOutreachStatus(login, action, actor, container = getMaintainerOutreachContainer(), now = new Date()) {
  const existing = await getMaintainerOutreachRecord(login, container);
  if (!existing) throw new Error(`Outreach record not found: ${login}`);
  const timestamp = now.toISOString();
  let patch;
  if (action === 'approve' && existing.status === 'pending') {
    patch = { status: 'approved', approvedAt: timestamp, approvedBy: actor || null };
  } else if (action === 'reject' && ['pending', 'approved'].includes(existing.status)) {
    patch = { status: 'rejected', rejectedAt: timestamp, rejectedBy: actor || null };
  } else if (action === 'sent' && existing.status === 'approved') {
    patch = {
      status: 'sent',
      sentAt: timestamp,
      sentBy: actor || null,
      followUpDueAt: existing.attempt < MAINTAINER_OUTREACH_MAX_ATTEMPTS ? followUpDueAt(timestamp) : null,
    };
  } else {
    throw new Error(`Cannot ${action} outreach record in ${existing.status} state`);
  }
  return replaceRecord({ ...existing, ...patch, updatedAt: timestamp }, container);
}

export function __resetMemoryMaintainerOutreachStoreForTests() {
  memoryRecords.clear();
}