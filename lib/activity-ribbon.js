export function selectLeaderboardActivities(activities, limit = 12) {
  return activities
    .filter(activity => activity.documentType === 'platform-activity' && !activity.fallback)
    .filter(activity => activity.login && activity.description && activity.url)
    .slice(0, limit);
}