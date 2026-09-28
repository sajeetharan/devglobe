export function normalizeTextSearchQuery(query) {
  return String(query || '').trim().replace(/^@/, '');
}

const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'building', 'developer', 'developers', 'find', 'for', 'in',
  'is', 'looking', 'me', 'of', 'on', 'or', 'someone', 'the', 'to', 'who',
  'tools', 'using', 'with', 'working',
]);

export function tokenizeDeveloperSearchQuery(query) {
  const normalized = normalizeTextSearchQuery(query).toLowerCase();
  const terms = normalized.match(/"[^"]+"|[\p{L}\p{N}+#.-]+/gu) || [];
  const meaningfulTerms = terms
    .map(term => term.replace(/^"|"$/g, '').trim())
    .filter(term => term && !SEARCH_STOP_WORDS.has(term));

  return [...new Set(meaningfulTerms.length ? meaningfulTerms : [normalized].filter(Boolean))];
}

export function developerMatchesSearchQuery(developer, query) {
  const terms = tokenizeDeveloperSearchQuery(query);
  if (!terms.length) return false;

  const searchableText = [
    developer?.login,
    developer?.name,
    developer?.location,
    developer?.bio,
    developer?.topLanguage,
    ...(Array.isArray(developer?.specialTags) ? developer.specialTags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return terms.every(term => searchableText.includes(term));
}

export function findExactLoginResult(query, results = []) {
  const login = normalizeTextSearchQuery(query).toLowerCase();
  if (!login) return null;
  return results.find(result => String(result?.login || '').toLowerCase() === login) || null;
}