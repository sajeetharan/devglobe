function daysLabel(days) {
  if (days === null || days === undefined) return 'Unknown';
  if (days === 0) return 'Today';
  return `${days}d ago`;
}

export default function MissionFreshness({ freshness, compact = false }) {
  if (!freshness) return null;
  return (
    <div className={`mission-freshness mission-freshness--${freshness.level}${compact ? ' mission-freshness--compact' : ''}`} aria-label={`Repository freshness score ${freshness.score} out of 100`}>
      <strong><span aria-hidden="true" />{freshness.score}/100 freshness</strong>
      <span>Maintainer activity {daysLabel(freshness.maintainerActivityDays)}</span>
      <span>Issue opened {daysLabel(freshness.issueAgeDays)}</span>
      <span>{freshness.recentlyMergedPullRequests} similar-label PRs merged in 90d</span>
    </div>
  );
}
