'use client';

import Link from 'next/link';
import { selectLeaderboardActivities } from '../lib/activity-ribbon.js';
import { useGlobalActivityFeed } from './useGlobalActivityFeed.js';

export default function LeaderboardActivityRibbon() {
  const { activities, loading, error } = useGlobalActivityFeed(true);
  const visible = selectLeaderboardActivities(activities);

  if (loading) return <div className="leaderboard-ribbon leaderboard-ribbon--message" role="status">Syncing real DevGlobe activity...</div>;
  if (error) return <div className="leaderboard-ribbon leaderboard-ribbon--message">Live activity is temporarily unavailable.</div>;
  if (visible.length === 0) return <div className="leaderboard-ribbon leaderboard-ribbon--message">No public DevGlobe activity has been recorded recently.</div>;

  return (
    <section className="leaderboard-ribbon" aria-label="Recent DevGlobe activity">
      <div className="leaderboard-ribbon__label"><i aria-hidden="true" /> Live on DevGlobe</div>
      <div className="leaderboard-ribbon__viewport">
        <div className="leaderboard-ribbon__track">
          <ActivityItems activities={visible} />
          <div aria-hidden="true"><ActivityItems activities={visible} tabIndex={-1} /></div>
        </div>
      </div>
    </section>
  );
}

function ActivityItems({ activities, tabIndex }) {
  return activities.map(activity => (
    <Link key={activity.id} href={activity.url} tabIndex={tabIndex}>
      <strong>@{activity.login}</strong>
      <span>{activity.description}</span>
    </Link>
  ));
}