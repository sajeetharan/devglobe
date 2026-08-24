'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useGlobalActivityFeed } from './useGlobalActivityFeed.js';

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function PlatformActivityBanner() {
  const { activities, error } = useGlobalActivityFeed(true, { intervalMs: 300000 });
  const [visibleIndex, setVisibleIndex] = useState(0);

  useEffect(() => {
    if (activities.length < 2) return undefined;
    const interval = setInterval(() => {
      setVisibleIndex(current => (current + 1) % Math.min(activities.length, 8));
    }, 6000);
    return () => clearInterval(interval);
  }, [activities.length]);

  useEffect(() => {
    setVisibleIndex(0);
  }, [activities[0]?.id]);

  const activity = activities[visibleIndex];
  if (!activity || error) return null;

  return (
    <aside className="activity-banner" aria-label="Recent platform activity" aria-live="polite">
      <span className="activity-banner__pulse" aria-hidden="true" />
      <span className="activity-banner__label">Live</span>
      <Link href={`/developer/${encodeURIComponent(activity.login)}`} className="activity-banner__actor">
        {activity.avatarUrl ? <img src={activity.avatarUrl} alt="" /> : <span aria-hidden="true">{activity.login[0].toUpperCase()}</span>}
        @{activity.login}
      </Link>
      <a className="activity-banner__detail" href={activity.url}>{activity.description}</a>
      <time dateTime={activity.createdAt}>{relativeTime(activity.createdAt)}</time>
      <Link className="activity-banner__campaign" href="/hacktoberfest" aria-label="Explore Hacktoberfest 2026 contribution opportunities">
        <span>Hacktoberfest 2026</span>
        <strong>Find your issue</strong>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </Link>
    </aside>
  );
}