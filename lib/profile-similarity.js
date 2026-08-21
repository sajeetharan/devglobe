export const MAX_SIMILAR_DEVELOPERS = 20;
export const PROFILE_EMBEDDING_DIMENSIONS = 1536;

export function hasUsableEmbedding(developer) {
  return Array.isArray(developer?.embedding)
    && developer.embedding.length === PROFILE_EMBEDDING_DIMENSIONS
    && developer.embedding.every(value => Number.isFinite(value));
}

export function normalizeSimilarityLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 10;
  return Math.min(parsed, MAX_SIMILAR_DEVELOPERS);
}

function reasonFor(source, candidate) {
  const reasons = [];
  if (source.topLanguage && candidate.topLanguage
    && source.topLanguage.toLowerCase() === candidate.topLanguage.toLowerCase()) {
    reasons.push(`Both work primarily in ${candidate.topLanguage}`);
  }
  const sourceRepositories = new Set((source.topRepos || []).map(repository => String(repository?.name || repository).toLowerCase()));
  const sharedRepository = (candidate.topRepos || []).find(repository => sourceRepositories.has(String(repository?.name || repository).toLowerCase()));
  if (sharedRepository) reasons.push(`Shared repository signal: ${sharedRepository.name || sharedRepository}`);
  if (source.location && candidate.location && source.location.toLowerCase() === candidate.location.toLowerCase()) {
    reasons.push(`Both list ${candidate.location}`);
  }
  return reasons.length ? reasons.slice(0, 2) : ['Similar public profile and repository signals'];
}

function similarityBand(index) {
  if (index < 3) return 'Very similar';
  if (index < 8) return 'Similar';
  return 'Related';
}

export function normalizeSimilarDevelopers(source, resources, requestedLimit) {
  const limit = normalizeSimilarityLimit(requestedLimit);
  const sourceLogin = String(source?.login || '').toLowerCase();
  return resources
    .filter(candidate => candidate?.login && candidate.login.toLowerCase() !== sourceLogin)
    .filter(candidate => Number.isFinite(candidate.distance))
    .sort((left, right) => left.distance - right.distance || left.login.localeCompare(right.login))
    .slice(0, limit)
    .map((candidate, index) => ({
      id: candidate.id,
      login: candidate.login,
      name: candidate.name || candidate.login,
      avatarUrl: candidate.avatarUrl || null,
      location: candidate.location || null,
      lat: candidate.lat ?? null,
      lng: candidate.lng ?? null,
      topLanguage: candidate.topLanguage || null,
      score: candidate.score ?? null,
      similarity: similarityBand(index),
      reasons: reasonFor(source, candidate),
    }));
}