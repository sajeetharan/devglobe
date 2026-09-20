const STORAGE_KEY = 'devglobe-discovery-history:v1';
const HISTORY_EVENT = 'devglobe:discovery-history';
const MAX_RECENT_ITEMS = 5;
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function readValue(storage) {
  if (!storage) return { searches: [], profiles: [] };
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    return {
      searches: Array.isArray(parsed.searches)
        ? parsed.searches.filter(item => Number.isFinite(item?.savedAt) && item.savedAt >= cutoff)
        : [],
      profiles: Array.isArray(parsed.profiles)
        ? parsed.profiles.filter(item => Number.isFinite(item?.savedAt) && item.savedAt >= cutoff)
        : [],
    };
  } catch {
    return { searches: [], profiles: [] };
  }
}

function writeValue(history, storage) {
  if (!storage) return history;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    return history;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HISTORY_EVENT));
  return history;
}

export function readDiscoveryHistory(storage = globalThis.localStorage) {
  return readValue(storage);
}

export function recordRecentSearch({ query, mode = 'text' }, storage = globalThis.localStorage) {
  const normalizedQuery = normalizeText(query, 120);
  if (!normalizedQuery) return readValue(storage);
  const history = readValue(storage);
  const search = {
    query: normalizedQuery,
    mode: ['text', 'vector', 'hybrid'].includes(mode) ? mode : 'text',
    savedAt: Date.now(),
  };
  return writeValue({
    ...history,
    searches: [
      search,
      ...history.searches.filter(item => item?.query?.toLowerCase() !== normalizedQuery.toLowerCase()),
    ].slice(0, MAX_RECENT_ITEMS),
  }, storage);
}

export function recordRecentProfile(profile, storage = globalThis.localStorage) {
  const login = normalizeText(profile?.login, 39);
  if (!login) return readValue(storage);
  const history = readValue(storage);
  const recentProfile = {
    login,
    name: normalizeText(profile?.name, 100),
    avatarUrl: normalizeText(profile?.avatarUrl, 500),
    savedAt: Date.now(),
  };
  return writeValue({
    ...history,
    profiles: [
      recentProfile,
      ...history.profiles.filter(item => item?.login?.toLowerCase() !== login.toLowerCase()),
    ].slice(0, MAX_RECENT_ITEMS),
  }, storage);
}

export const DISCOVERY_HISTORY_EVENT = HISTORY_EVENT;
