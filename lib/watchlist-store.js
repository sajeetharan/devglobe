import { getCosmosContainer } from './cosmos.js';

const memoryWatchlists = new Map();

const FOLLOW_CATEGORIES = ['developers', 'projects', 'languages', 'countries'];
const MUTE_ENTITY_TYPES = ['developer', 'project', 'language', 'country'];
export const MAX_DEVELOPER_FOLLOWS = 100;

export function normalizeDeveloperFollow(value) {
  const login = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(login)) {
    throw new Error('Invalid GitHub login');
  }
  return login;
}

export function updateDeveloperFollows(follows, value, { remove = false, ownerLogin = '' } = {}) {
  const login = normalizeDeveloperFollow(value);
  const owner = ownerLogin ? normalizeDeveloperFollow(ownerLogin) : '';
  if (!remove && login === owner) throw new Error('You cannot follow your own profile');

  const current = new Set((follows || []).map(normalizeDeveloperFollow));
  if (remove) current.delete(login);
  else current.add(login);
  if (current.size > MAX_DEVELOPER_FOLLOWS) {
    throw new Error(`Developer follow limit is ${MAX_DEVELOPER_FOLLOWS}`);
  }
  return [...current];
}

function getWatchlistContainer() {
  return getCosmosContainer(process.env.COSMOS_WATCHLIST_CONTAINER || 'watchlists');
}

function emptyWatchlist(login) {
  return {
    id: login,
    login,
    documentType: 'watchlist',
    schemaVersion: 2,
    follows: { developers: [], projects: [], languages: [], countries: [] },
    mutes: { entities: [], eventTypes: [] },
    readState: { readThrough: null, readIds: [] },
    shortlists: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getWatchlist(login) {
  if (!login) return null;
  const container = getWatchlistContainer();

  if (!container) {
    return memoryWatchlists.get(login) || emptyWatchlist(login);
  }

  try {
    const { resource } = await container.item(login, login).read();
    return resource || emptyWatchlist(login);
  } catch (error) {
    if (error.code === 404) return emptyWatchlist(login);
    throw error;
  }
}

async function saveWatchlist(watchlist) {
  const document = { ...watchlist, schemaVersion: 2, updatedAt: new Date().toISOString() };
  const container = getWatchlistContainer();
  if (!container) {
    memoryWatchlists.set(document.login, document);
    return document;
  }
  if (watchlist._etag) {
    const etag = watchlist._etag;
    for (const key of Object.keys(document)) {
      if (key.startsWith('_')) delete document[key];
    }
    const { resource } = await container.item(document.id, document.id).replace(document, {
      accessCondition: { type: 'IfMatch', condition: etag },
    });
    return resource;
  }
  const { resource } = await container.items.upsert(document);
  return resource;
}

export async function mutateShortlists(login, mutation, {
  attempts = 3,
  load = getWatchlist,
  save = saveWatchlist,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const watchlist = await load(login);
    const result = mutation(watchlist.shortlists || []);
    watchlist.shortlists = result.shortlists;
    try {
      return { watchlist: await save(watchlist), result };
    } catch (error) {
      if (error.code !== 412) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function followEntity(login, category, value) {
  if (!FOLLOW_CATEGORIES.includes(category) || !value) {
    throw new Error(`Invalid follow category: ${category}`);
  }
  const watchlist = await getWatchlist(login);
  if (category === 'developers') {
    watchlist.follows.developers = updateDeveloperFollows(watchlist.follows.developers, value, { ownerLogin: login });
    return saveWatchlist(watchlist);
  }
  const set = new Set(watchlist.follows[category]);
  set.add(value);
  watchlist.follows[category] = [...set];
  return saveWatchlist(watchlist);
}

export async function unfollowEntity(login, category, value) {
  if (!FOLLOW_CATEGORIES.includes(category)) {
    throw new Error(`Invalid follow category: ${category}`);
  }
  const watchlist = await getWatchlist(login);
  if (category === 'developers') {
    watchlist.follows.developers = updateDeveloperFollows(watchlist.follows.developers, value, { remove: true });
    return saveWatchlist(watchlist);
  }
  watchlist.follows[category] = watchlist.follows[category].filter(entry => entry !== value);
  return saveWatchlist(watchlist);
}

export async function muteEntity(login, type, value) {
  if (!MUTE_ENTITY_TYPES.includes(type) || !value) {
    throw new Error(`Invalid mute type: ${type}`);
  }
  const watchlist = await getWatchlist(login);
  const exists = watchlist.mutes.entities.some(entry => entry.type === type && entry.value === value);
  if (!exists) watchlist.mutes.entities.push({ type, value });
  return saveWatchlist(watchlist);
}

export async function unmuteEntity(login, type, value) {
  const watchlist = await getWatchlist(login);
  watchlist.mutes.entities = watchlist.mutes.entities.filter(
    entry => !(entry.type === type && entry.value === value),
  );
  return saveWatchlist(watchlist);
}

export async function muteEventType(login, eventType) {
  if (!eventType) throw new Error('eventType is required');
  const watchlist = await getWatchlist(login);
  const set = new Set(watchlist.mutes.eventTypes);
  set.add(eventType);
  watchlist.mutes.eventTypes = [...set];
  return saveWatchlist(watchlist);
}

export async function unmuteEventType(login, eventType) {
  const watchlist = await getWatchlist(login);
  watchlist.mutes.eventTypes = watchlist.mutes.eventTypes.filter(entry => entry !== eventType);
  return saveWatchlist(watchlist);
}

export async function markRead(login, eventIds = []) {
  const watchlist = await getWatchlist(login);
  const set = new Set(watchlist.readState.readIds);
  eventIds.forEach(id => set.add(id));
  watchlist.readState.readIds = [...set].slice(-500);
  return saveWatchlist(watchlist);
}

export async function markAllRead(login, cursor) {
  const watchlist = await getWatchlist(login);
  watchlist.readState.readThrough = cursor;
  watchlist.readState.readIds = [];
  return saveWatchlist(watchlist);
}

export { FOLLOW_CATEGORIES, MUTE_ENTITY_TYPES };
