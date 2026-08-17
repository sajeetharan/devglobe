import { addDeveloperRanks } from './ranking.js';
import { withOssWorth } from './oss-worth.js';

export function prepareDeveloperDataset(developers = []) {
  const ranked = [...developers]
    .map(developer => ({
      ...developer,
      score: Number.isFinite(developer.score) ? developer.score : 0,
    }))
    .sort((left, right) =>
      right.score - left.score || String(left.login || '').localeCompare(String(right.login || ''))
    );

  return addDeveloperRanks(ranked).map(withOssWorth);
}