export const MAX_REPOSITORY_MATCHES = 20;

const OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPOSITORY_PATTERN = /^[a-z\d._-]{1,100}$/i;

export function parseRepositoryReference(value) {
  const normalized = String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
  const [owner, repository, ...extra] = normalized.split('/');
  if (extra.length || !OWNER_PATTERN.test(owner || '') || !REPOSITORY_PATTERN.test(repository || '')) return null;
  return { owner, repository, fullName: `${owner}/${repository}` };
}

export function normalizeRepositoryMatchLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 10;
  return Math.min(parsed, MAX_REPOSITORY_MATCHES);
}

function normalizedLanguages(developer) {
  return new Set([
    developer.topLanguage,
    ...(developer.languages || []).map(language => language?.name || language),
  ].filter(Boolean).map(language => String(language).toLowerCase()));
}

function repositoryNames(developer) {
  return new Set((developer.topRepos || [])
    .map(repository => String(repository?.name || repository || '').toLowerCase())
    .filter(Boolean));
}

function publicEvidence(developer) {
  return [
    ['GitHub stars', developer.totalStars],
    ['Public commits', developer.totalCommits],
    ['GitHub followers', developer.followers],
    ['Stack Overflow reputation', developer.soReputation],
  ]
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([label, value]) => ({ label, value: Number(value) }));
}

function scoreCandidate(repository, developer) {
  const reasons = [];
  let matchStrength = 0;
  const login = String(developer.login || '').toLowerCase();
  const owner = repository.owner.toLowerCase();
  const repoName = repository.name.toLowerCase();
  const languages = normalizedLanguages(developer);
  const contribution = (repository.contributors || []).find(contributor => contributor.login.toLowerCase() === login);

  if (login === owner) {
    matchStrength += 100;
    reasons.push(`Public GitHub owner of ${repository.fullName}`);
  }
  if (login === owner && repositoryNames(developer).has(repoName)) {
    matchStrength += 10;
    reasons.push(`Features ${repository.name} among public repositories`);
  }
  if (contribution) {
    matchStrength += 20;
    reasons.push(`Public GitHub contributor to ${repository.fullName} (${contribution.contributions} contributions)`);
  }
  if (repository.language && languages.has(repository.language.toLowerCase())) {
    matchStrength += developer.topLanguage?.toLowerCase() === repository.language.toLowerCase() ? 6 : 4;
    reasons.push(`Public language profile includes ${repository.language}`);
  }

  const publicText = `${developer.bio || ''} ${(developer.specialTags || []).join(' ')}`.toLowerCase();
  const matchedTopics = (repository.topics || []).filter(topic => publicText.includes(topic.toLowerCase())).slice(0, 2);
  if (matchedTopics.length) {
    matchStrength += matchedTopics.length * 2;
    reasons.push(`Public profile matches repository topic${matchedTopics.length > 1 ? 's' : ''}: ${matchedTopics.join(', ')}`);
  }
  if (developer.aiProfile?.opportunityPreferences?.types?.includes('open-source')) {
    matchStrength += 1;
    reasons.push('Self-declared as open to open-source opportunities');
  }

  return { matchStrength, reasons: reasons.slice(0, 3) };
}

export function rankDevelopersForRepository(repository, developers, requestedLimit) {
  const limit = normalizeRepositoryMatchLimit(requestedLimit);
  return developers
    .filter(developer => developer?.login)
    .map(developer => ({ developer, ...scoreCandidate(repository, developer) }))
    .filter(candidate => candidate.matchStrength > 0)
    .sort((left, right) => right.matchStrength - left.matchStrength
      || Number(right.developer.score || 0) - Number(left.developer.score || 0)
      || left.developer.login.localeCompare(right.developer.login))
    .slice(0, limit)
    .map(({ developer, reasons }) => ({
      login: developer.login,
      name: developer.name || developer.login,
      ...(developer.location ? { location: developer.location } : {}),
      ...(developer.topLanguage ? { topLanguage: developer.topLanguage } : {}),
      ...(Number.isFinite(Number(developer.score)) ? { score: Number(developer.score) } : {}),
      whyMatched: reasons,
      publicEvidence: publicEvidence(developer),
      dataFreshness: {
        updatedAt: developer.metricsUpdatedAt || null,
        status: developer.metricsUpdatedAt ? 'reported' : 'unknown',
      },
      availableForAgents: developer.aiProfile?.acceptsAgentRequests === true,
    }));
}

export function repositoryCandidateQuery(repository) {
  const conditions = ['LOWER(c.login) = @owner'];
  const parameters = [{ name: '@owner', value: repository.owner.toLowerCase() }];
  const contributorLogins = (repository.contributors || []).map(contributor => contributor.login.toLowerCase());
  if (contributorLogins.length) {
    conditions.push('ARRAY_CONTAINS(@contributors, LOWER(c.login))');
    parameters.push({ name: '@contributors', value: contributorLogins });
  }
  if (repository.language) {
    conditions.push("(LOWER(c.topLanguage) = @language OR EXISTS(SELECT VALUE language FROM language IN c.languages WHERE LOWER(language.name) = @language))");
    parameters.push({ name: '@language', value: repository.language.toLowerCase() });
  }
  (repository.topics || []).slice(0, 5).forEach((topic, index) => {
    conditions.push(`CONTAINS(LOWER(c.bio), @topic${index})`);
    parameters.push({ name: `@topic${index}`, value: topic.toLowerCase() });
  });
  return { conditions, parameters };
}