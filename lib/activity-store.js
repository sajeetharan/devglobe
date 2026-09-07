import { getCosmosContainer } from './cosmos.js';

const memoryActivities = new Map();
const RETENTION_MS = 24 * 60 * 60 * 1000;

function getActivityContainer() {
  return getCosmosContainer(process.env.COSMOS_ACTIVITY_CONTAINER || 'activities');
}

function compareActivities(left, right) {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export function encodeActivityCursor(activity) {
  if (!activity) return null;
  return Buffer.from(JSON.stringify({ createdAt: activity.createdAt, id: activity.id })).toString('base64url');
}

export function decodeActivityCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof cursor.id !== 'string' || Number.isNaN(Date.parse(cursor.createdAt))) return null;
    return cursor;
  } catch {
    return null;
  }
}

export async function saveActivities(activities) {
  const now = new Date();
  const ingestedAt = now.toISOString();
  const container = getActivityContainer();
  let inserted = 0;

  for (const activity of activities) {
    const document = {
      ...activity,
      day: activity.createdAt.slice(0, 10),
      ingestedAt,
      ttl: 48 * 60 * 60,
      schemaVersion: 1,
      documentType: activity.documentType || 'github-activity',
    };

    if (!container) {
      if (!memoryActivities.has(document.id)) inserted += 1;
      memoryActivities.set(document.id, document);
      continue;
    }

    try {
      await container.items.create(document, { disableAutomaticIdGeneration: true });
      inserted += 1;
    } catch (error) {
      if (error.code !== 409) throw error;
    }
  }

  return { inserted, ingestedAt };
}

export async function listActivities({ limit = 50, cursor, after } = {}) {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const container = getActivityContainer();

  if (!container) {
    const activities = [...memoryActivities.values()]
      .filter(activity => activity.createdAt >= cutoff)
      .filter(activity => !cursor
        || activity.createdAt < cursor.createdAt
        || (activity.createdAt === cursor.createdAt && activity.id < cursor.id))
      .filter(activity => !after
        || activity.createdAt > after.createdAt
        || (activity.createdAt === after.createdAt && activity.id > after.id))
      .sort(compareActivities)
      .slice(0, limit);
    return { activities, nextCursor: activities.length === limit ? encodeActivityCursor(activities.at(-1)) : null };
  }

  const conditions = ['c.documentType IN ("github-activity", "platform-activity")', 'c.createdAt >= @cutoff'];
  const parameters = [{ name: '@cutoff', value: cutoff }];
  if (cursor) {
    conditions.push('(c.createdAt < @cursorTime OR (c.createdAt = @cursorTime AND c.id < @cursorId))');
    parameters.push({ name: '@cursorTime', value: cursor.createdAt }, { name: '@cursorId', value: cursor.id });
  }
  if (after) {
    conditions.push('(c.createdAt > @afterTime OR (c.createdAt = @afterTime AND c.id > @afterId))');
    parameters.push({ name: '@afterTime', value: after.createdAt }, { name: '@afterId', value: after.id });
  }

  const query = {
    query: `SELECT TOP ${limit} c.id, c.login, c.avatarUrl, c.type, c.description, c.targetLogin, c.targetName, c.repo, c.url, c.createdAt, c.ingestedAt, c.documentType FROM c WHERE ${conditions.join(' AND ')} ORDER BY c.createdAt DESC, c.id DESC`,
    parameters,
  };
  const { resources } = await container.items.query(query).fetchAll();
  return {
    activities: resources,
    nextCursor: resources.length === limit ? encodeActivityCursor(resources.at(-1)) : null,
  };
}