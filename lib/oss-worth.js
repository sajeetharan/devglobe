export const OSS_WORTH_FORMULA_VERSION = 'oss-worth-v1';
export const OSS_WORTH_MAX_CREDITS = 1_000_000;

export const OSS_WORTH_PLATFORMS = {
  github: {
    maxCredits: 600_000,
    dimensions: [
      { key: 'stars', label: 'Repository stars', field: 'totalStars', weight: 0.30, cap: 100_000 },
      { key: 'commits', label: 'Commit activity', field: 'totalCommits', weight: 0.30, cap: 10_000 },
      { key: 'repoReach', label: 'Repository reach', weight: 0.25, cap: 50_000 },
      { key: 'followers', label: 'Community reach', field: 'followers', weight: 0.10, cap: 25_000 },
      { key: 'publicRepos', label: 'Public projects', field: 'publicRepos', weight: 0.05, cap: 100 },
    ],
  },
  stackoverflow: {
    maxCredits: 400_000,
    dimensions: [
      { key: 'reputation', label: 'Knowledge reputation', field: 'soReputation', weight: 0.55, cap: 100_000 },
      { key: 'acceptedAnswers', label: 'Accepted-answer engagement', weight: 0.35, cap: 1_000 },
      { key: 'badges', label: 'Community recognition', field: 'soBadges', weight: 0.10, cap: 100 },
    ],
  },
};

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

function normalize(value, cap) {
  return Math.min(Math.log1p(nonNegativeNumber(value)) / Math.log1p(cap), 1);
}

function calculatePlatform(dimensions, maxCredits, values, available = true) {
  const breakdown = dimensions.map(dimension => {
    const sourceValue = nonNegativeNumber(values[dimension.key]);
    const normalized = normalize(sourceValue, dimension.cap);
    return {
      ...dimension,
      sourceValue,
      normalized,
      credits: normalized * dimension.weight * maxCredits,
    };
  });
  const index = available
    ? breakdown.reduce((total, dimension) => total + dimension.normalized * dimension.weight, 0)
    : 0;

  return {
    available,
    credits: Math.round(index * maxCredits),
    maxCredits,
    index,
    breakdown,
  };
}

export function calculateOssWorth(developer = {}) {
  const acceptRate = Math.min(nonNegativeNumber(developer.soAcceptRate), 100);
  const hasStackOverflowData = Boolean(developer.soUserId) ||
    nonNegativeNumber(developer.soReputation) > 0 ||
    nonNegativeNumber(developer.soAnswers) > 0 ||
    nonNegativeNumber(developer.soBadges) > 0;

  const github = calculatePlatform(
    OSS_WORTH_PLATFORMS.github.dimensions,
    OSS_WORTH_PLATFORMS.github.maxCredits,
    {
      stars: developer.totalStars,
      commits: developer.totalCommits,
      repoReach: nonNegativeNumber(developer.totalForks) + nonNegativeNumber(developer.totalWatchers),
      followers: developer.followers,
      publicRepos: developer.publicRepos,
    }
  );
  const stackoverflow = calculatePlatform(
    OSS_WORTH_PLATFORMS.stackoverflow.dimensions,
    OSS_WORTH_PLATFORMS.stackoverflow.maxCredits,
    {
      reputation: developer.soReputation,
      acceptedAnswers: nonNegativeNumber(developer.soAnswers) * acceptRate / 100,
      badges: developer.soBadges,
    },
    hasStackOverflowData
  );

  return {
    formulaVersion: OSS_WORTH_FORMULA_VERSION,
    totalCredits: github.credits + stackoverflow.credits,
    github,
    stackoverflow,
  };
}

export function withOssWorth(developer) {
  return { ...developer, ossWorth: calculateOssWorth(developer) };
}

export function compareOssWorth(left, right) {
  return (right.ossWorth?.totalCredits || 0) - (left.ossWorth?.totalCredits || 0) ||
    (right.score || 0) - (left.score || 0) ||
    String(left.login || '').localeCompare(String(right.login || ''));
}