export function normalizeTextSearchQuery(query) {
  return String(query || '').trim().replace(/^@/, '');
}

const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'building', 'developer', 'developers', 'find', 'for', 'in',
  'is', 'looking', 'me', 'of', 'on', 'or', 'someone', 'the', 'to', 'who',
  'tools', 'using', 'with', 'working',
]);

const SEARCH_ALIASES = new Map([
  ['ai', ['artificial intelligence']],
  ['golang', ['go']],
  ['js', ['javascript']],
  ['k8s', ['kubernetes']],
  ['nodejs', ['node.js', 'node']],
  ['py', ['python']],
  ['reactjs', ['react']],
  ['ts', ['typescript']],
]);

export function tokenizeDeveloperSearchQuery(query) {
  const normalized = normalizeTextSearchQuery(query).toLowerCase();
  const terms = normalized.match(/"[^"]+"|[\p{L}\p{N}+#.-]+/gu) || [];
  const meaningfulTerms = terms
    .map(term => term.replace(/^"|"$/g, '').trim())
    .filter(term => term && !SEARCH_STOP_WORDS.has(term));

  return [...new Set(meaningfulTerms.length ? meaningfulTerms : [normalized].filter(Boolean))];
}

export function searchTermAlternatives(term) {
  return [term, ...(SEARCH_ALIASES.get(term) || [])];
}

function searchableDeveloperText(developer) {
  return [
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
}

function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maximum) return false;
    previous = current;
  }
  return previous[right.length] <= maximum;
}

function matchSearchTerm(text, words, term) {
  const alternatives = searchTermAlternatives(term);
  if (alternatives.some(alternative => text.includes(alternative))) return 'exact';
  if (term.includes(' ') || term.length < 4) return null;
  const maximumDistance = term.length >= 8 ? 2 : 1;
  return words.some(word => editDistanceWithin(term, word, maximumDistance)) ? 'approximate' : null;
}

function scoreDeveloperSearchTerms(developer, terms) {
  const text = searchableDeveloperText(developer);
  const words = text.match(/[\p{L}\p{N}+#.-]+/gu) || [];
  const matches = terms.map(term => matchSearchTerm(text, words, term));
  return {
    matchedTerms: matches.filter(Boolean).length,
    exactTerms: matches.filter(match => match === 'exact').length,
  };
}

export function developerMatchesSearchQuery(developer, query) {
  const terms = tokenizeDeveloperSearchQuery(query);
  if (!terms.length) return false;
  return scoreDeveloperSearchTerms(developer, terms).exactTerms === terms.length;
}

export function rankDeveloperSearchResults(developers, query, limit = 20) {
  const interpretedTerms = tokenizeDeveloperSearchQuery(query);
  if (!interpretedTerms.length) return { results: [], interpretedTerms, matchMode: 'all' };

  const scored = developers.map(developer => ({
    developer,
    ...scoreDeveloperSearchTerms(developer, interpretedTerms),
  }));
  const exact = scored.filter(candidate => candidate.exactTerms === interpretedTerms.length);
  const approximate = scored.filter(candidate => candidate.matchedTerms === interpretedTerms.length);
  const minimumTerms = interpretedTerms.length === 1 ? 1 : Math.max(2, Math.ceil(interpretedTerms.length * 0.6));
  const broadened = scored.filter(candidate => candidate.matchedTerms >= minimumTerms);
  const candidates = exact.length ? exact : approximate.length ? approximate : broadened;
  const matchMode = exact.length ? 'all' : approximate.length ? 'approximate' : broadened.length ? 'broadened' : 'none';
  const results = candidates
    .sort((left, right) =>
      right.matchedTerms - left.matchedTerms
      || right.exactTerms - left.exactTerms
      || Number(right.developer?.score || 0) - Number(left.developer?.score || 0))
    .slice(0, limit)
    .map(candidate => candidate.developer);

  return { results, interpretedTerms, matchMode };
}

export function findExactLoginResult(query, results = []) {
  const login = normalizeTextSearchQuery(query).toLowerCase();
  if (!login) return null;
  return results.find(result => String(result?.login || '').toLowerCase() === login) || null;
}