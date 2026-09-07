export const SEARCH_MATCH_DISCLAIMER = 'Discovery relevance based on public profile signals; not a probability, suitability rating, or hiring recommendation.';

const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'or', 'the', 'to', 'with']);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function queryTokens(query) {
  return normalize(query)
    .replace(/^@/, '')
    .split(/[^a-z0-9+#.-]+/)
    .filter(token => (token.length > 1 || token === 'c' || token === 'r') && !STOP_WORDS.has(token));
}

function containsQueryToken(value, tokens) {
  const normalized = normalize(value);
  return normalized && tokens.some(token => normalized.includes(token));
}

function fieldEvidence(developer, query) {
  const normalizedQuery = normalize(query).replace(/^@/, '');
  const tokens = queryTokens(query);
  const login = normalize(developer.login);
  const name = normalize(developer.name);
  const language = normalize(developer.topLanguage);
  const location = normalize(developer.location);
  const tags = Array.isArray(developer.specialTags) ? developer.specialTags : [];
  const reasons = [];
  let score = 0;

  if (normalizedQuery && login === normalizedQuery) {
    reasons.push(`Exact GitHub login match: @${developer.login}`);
    score = 100;
  } else if (normalizedQuery && name === normalizedQuery) {
    reasons.push(`Exact developer name match: ${developer.name}`);
    score = 98;
  } else if (normalizedQuery && login.includes(normalizedQuery)) {
    reasons.push(`GitHub login includes “${normalizedQuery}”`);
    score = 94;
  } else if (normalizedQuery && name.includes(normalizedQuery)) {
    reasons.push(`Developer name includes “${normalizedQuery}”`);
    score = 92;
  }

  if (language && containsQueryToken(language, tokens)) {
    reasons.push(`Primary language matches ${developer.topLanguage}`);
    score = Math.max(score, 88);
  }
  if (location && containsQueryToken(location, tokens)) {
    reasons.push(`Location matches ${developer.location}`);
    score = Math.max(score, 82);
  }
  const matchedTag = tags.find(tag => containsQueryToken(tag, tokens));
  if (matchedTag) {
    reasons.push(`Public profile tag matches ${matchedTag}`);
    score = Math.max(score, 80);
  }

  return { reasons, score };
}

function rankScore(mode, rank) {
  if (mode === 'vector') return Math.max(62, 90 - rank * 3);
  if (mode === 'hybrid') return Math.max(68, 91 - rank * 2);
  return Math.max(64, 84 - rank * 2);
}

function matchLabel(score) {
  if (score >= 85) return 'Strong match';
  if (score >= 72) return 'Good match';
  return 'Related match';
}

export function explainSearchMatch(developer, query, {
  mode = 'text',
  rank = 0,
  vectorRank = null,
  textRank = null,
} = {}) {
  const boundedRank = Number.isInteger(rank) && rank >= 0 ? rank : 0;
  const evidence = fieldEvidence(developer, query);
  const reasons = [...evidence.reasons];
  const signals = [];

  if (mode === 'vector') {
    signals.push('semantic');
    reasons.push(`Semantic profile similarity ranked this result #${boundedRank + 1}`);
  } else if (mode === 'hybrid') {
    if (Number.isInteger(vectorRank)) signals.push('semantic');
    if (Number.isInteger(textRank)) signals.push('text');
    if (signals.length === 2) {
      reasons.push('Matched both semantic similarity and public profile text');
    } else if (signals[0] === 'semantic') {
      reasons.push('Matched semantic profile similarity');
    } else {
      reasons.push('Matched public profile text');
    }
  } else {
    signals.push('text');
    if (reasons.length === 0) reasons.push('Matched indexed public profile text');
  }

  let score = Math.max(evidence.score, rankScore(mode, boundedRank));
  if (mode === 'hybrid' && signals.length === 2) score = Math.min(98, score + 4);

  return {
    score,
    label: matchLabel(score),
    reasons: reasons.slice(0, 3),
    signals,
    method: mode === 'vector' ? 'semantic' : mode,
    disclaimer: SEARCH_MATCH_DISCLAIMER,
  };
}

export function attachSearchMatches(results, query, mode = 'text') {
  return results.map((developer, rank) => {
    const {
      _searchVectorRank: vectorRank = null,
      _searchTextRank: textRank = null,
      relevance: _relevance,
      ...publicDeveloper
    } = developer;
    return {
      ...publicDeveloper,
      match: explainSearchMatch(publicDeveloper, query, { mode, rank, vectorRank, textRank }),
    };
  });
}