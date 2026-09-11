export const SCORE_TIERS = Object.freeze([
  { label: 'Elite (80+)', minimum: 80, color: '#fbbf24' },
  { label: 'Strong (60+)', minimum: 60, color: '#34d399' },
  { label: 'Solid (40+)', minimum: 40, color: '#3b82f6' },
  { label: 'Emerging', minimum: 0, color: '#6366f1' },
]);

export function getScoreColor(score) {
  return SCORE_TIERS.find(tier => Number(score) >= tier.minimum)?.color
    || SCORE_TIERS.at(-1).color;
}

export function getHighestScore(developers) {
  return developers.reduce((highest, developer) => (
    Math.max(highest, Number(developer?.score) || 0)
  ), 0);
}
