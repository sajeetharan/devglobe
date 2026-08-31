export function normalizeTextSearchQuery(query) {
  return String(query || '').trim().replace(/^@/, '');
}

export function findExactLoginResult(query, results = []) {
  const login = normalizeTextSearchQuery(query).toLowerCase();
  if (!login) return null;
  return results.find(result => String(result?.login || '').toLowerCase() === login) || null;
}