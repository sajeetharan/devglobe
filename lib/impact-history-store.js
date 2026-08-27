import { getCosmosContainer } from './cosmos.js';

const memorySnapshots = new Map();

function getHistoryContainer() {
  return getCosmosContainer(process.env.COSMOS_IMPACT_HISTORY_CONTAINER || 'impact-history');
}

export async function getLatestImpactSnapshot(login, beforeDay = null) {
  const normalizedLogin = String(login || '').toLowerCase();
  const container = getHistoryContainer();
  if (!container) {
    return [...memorySnapshots.values()]
      .filter(snapshot => snapshot.login === normalizedLogin && (!beforeDay || snapshot.day < beforeDay))
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] || null;
  }

  const conditions = ['c.login = @login'];
  const parameters = [{ name: '@login', value: normalizedLogin }];
  if (beforeDay) {
    conditions.push('c.day < @beforeDay');
    parameters.push({ name: '@beforeDay', value: beforeDay });
  }
  const { resources } = await container.items.query({
    query: `SELECT TOP 1 * FROM c WHERE ${conditions.join(' AND ')} ORDER BY c.capturedAt DESC`,
    parameters,
  }, { partitionKey: normalizedLogin }).fetchAll();
  return resources[0] || null;
}

export async function getLatestImpactDayBefore(day) {
  const container = getHistoryContainer();
  if (!container) {
    return [...memorySnapshots.values()]
      .map(snapshot => snapshot.day)
      .filter(snapshotDay => snapshotDay < day)
      .sort()
      .at(-1);
  }

  const { resources: days } = await container.items.query({
    query: 'SELECT TOP 1 VALUE c.day FROM c WHERE c.day < @day ORDER BY c.day DESC',
    parameters: [{ name: '@day', value: day }],
  }).fetchAll();
  return days[0] || null;
}

export async function getLatestImpactDayOnOrBefore(day) {
  const container = getHistoryContainer();
  if (!container) {
    return [...memorySnapshots.values()]
      .filter(snapshot => snapshot.documentType === 'impact-snapshot')
      .map(snapshot => snapshot.day)
      .filter(snapshotDay => snapshotDay <= day)
      .sort()
      .at(-1) || null;
  }

  const { resources: days } = await container.items.query({
    query: `SELECT TOP 1 VALUE c.day FROM c
      WHERE c.documentType = 'impact-snapshot' AND c.day <= @day
      ORDER BY c.day DESC`,
    parameters: [{ name: '@day', value: day }],
  }).fetchAll();
  return days[0] || null;
}

export async function listImpactSnapshotsForDay(day) {
  if (!day) return [];
  const container = getHistoryContainer();
  if (!container) {
    return [...memorySnapshots.values()].filter(snapshot =>
      snapshot.documentType === 'impact-snapshot' && snapshot.day === day
    );
  }

  const { resources } = await container.items.query({
    query: `SELECT c.login, c.day, c.capturedAt, c.score, c.globalRank
      FROM c
      WHERE c.documentType = 'impact-snapshot' AND c.day = @day`,
    parameters: [{ name: '@day', value: day }],
  }).fetchAll();
  return resources;
}

export async function getImpactSnapshotForDay(login, day) {
  if (!day) return null;
  const normalizedLogin = String(login || '').toLowerCase();
  const id = `${normalizedLogin}:${day}`;
  const container = getHistoryContainer();
  if (!container) return memorySnapshots.get(id) || null;
  try {
    const { resource } = await container.item(id, normalizedLogin).read();
    return resource || null;
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function getImpactCaptureProgress(day) {
  const id = `capture:${day}`;
  const container = getHistoryContainer();
  if (!container) return memorySnapshots.get(id) || null;
  try {
    const { resource } = await container.item(id, '__capture__').read();
    return resource || null;
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function saveImpactCaptureProgress(progress) {
  const document = {
    id: `capture:${progress.captureDay}`,
    login: '__capture__',
    documentType: 'impact-capture-progress',
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  const container = getHistoryContainer();
  if (!container) {
    memorySnapshots.set(document.id, document);
    return document;
  }
  const { resource } = await container.items.upsert(document);
  return resource || document;
}

export async function listImpactSnapshots(login, days = 90, now = new Date()) {
  const normalizedLogin = String(login || '').toLowerCase();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const container = getHistoryContainer();
  if (!container) {
    return [...memorySnapshots.values()]
      .filter(snapshot => snapshot.login === normalizedLogin && snapshot.capturedAt >= cutoff)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  const { resources } = await container.items.query({
    query: `SELECT * FROM c
      WHERE c.login = @login AND c.capturedAt >= @cutoff
      ORDER BY c.capturedAt ASC`,
    parameters: [
      { name: '@login', value: normalizedLogin },
      { name: '@cutoff', value: cutoff },
    ],
  }, { partitionKey: normalizedLogin }).fetchAll();
  return resources;
}

export async function saveImpactSnapshot(snapshot) {
  const container = getHistoryContainer();
  if (!container) {
    memorySnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }
  const { resource } = await container.items.upsert(snapshot);
  return resource || snapshot;
}

// Cross-partition read used by trending (#24): the most recent snapshot for
// every developer captured on or before `day`, in a single query rather than
// one per-login round trip. Snapshots are partitioned by login, so this scans
// across partitions; day is indexed (see setup-impact-history-container.js)
// which keeps it cheap relative to a full collection scan.
export async function listLatestSnapshotsOnOrBeforeDay(day) {
  const container = getHistoryContainer();
  if (!container) {
    const bestByLogin = new Map();
    for (const snapshot of memorySnapshots.values()) {
      if (snapshot.documentType !== 'impact-snapshot' || snapshot.day > day) continue;
      const existing = bestByLogin.get(snapshot.login);
      if (!existing || snapshot.day > existing.day) bestByLogin.set(snapshot.login, snapshot);
    }
    return [...bestByLogin.values()];
  }

  const { resources } = await container.items.query({
    query: `SELECT c.login, c.day, c.capturedAt, c.score, c.globalRank
      FROM c
      WHERE c.documentType = 'impact-snapshot' AND c.day <= @day
      ORDER BY c.day DESC`,
    parameters: [{ name: '@day', value: day }],
  }).fetchAll();

  const bestByLogin = new Map();
  for (const snapshot of resources) {
    if (!bestByLogin.has(snapshot.login)) bestByLogin.set(snapshot.login, snapshot);
  }
  return [...bestByLogin.values()];
}

export function __resetMemoryImpactHistoryForTests() {
  memorySnapshots.clear();
}
