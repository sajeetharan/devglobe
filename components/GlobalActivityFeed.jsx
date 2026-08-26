'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import TodayMission from './TodayMission.jsx';
import { useGlobalActivityFeed } from './useGlobalActivityFeed.js';

const ACTIVITY_SOURCES = [
  { id: 'devglobe', label: 'DevGlobe Activity' },
  { id: 'github', label: 'GitHub Activity' },
];

function activitySource(activity) {
  return activity.documentType === 'platform-activity' || activity.documentType === 'fallback-activity'
    ? 'devglobe'
    : 'github';
}

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function GlobalActivityFeed({ active, onOpenContributions }) {
  const [selectedSource, setSelectedSource] = useState('devglobe');
  const {
    activities,
    loading,
    loadingMore,
    error,
    newActivityIds,
    nextCursor,
    lastUpdated,
    loadMore,
    refresh,
  } = useGlobalActivityFeed(active);
  const sourceCounts = useMemo(() => activities.reduce((counts, activity) => {
    counts[activitySource(activity)] += 1;
    return counts;
  }, { devglobe: 0, github: 0 }), [activities]);
  const visibleActivities = useMemo(
    () => activities.filter(activity => activitySource(activity) === selectedSource),
    [activities, selectedSource]
  );
  const visibleNewCount = visibleActivities.filter(activity => newActivityIds.has(activity.id)).length;

  return (
    <div className="global-activity">
      <TodayMission active={active} onOpenContributions={onOpenContributions} />
      <div className="global-activity__sources" role="tablist" aria-label="Activity source">
        {ACTIVITY_SOURCES.map(source => (
          <button
            type="button"
            role="tab"
            aria-selected={selectedSource === source.id}
            className={selectedSource === source.id ? 'global-activity__source global-activity__source--active' : 'global-activity__source'}
            onClick={() => setSelectedSource(source.id)}
            key={source.id}
          >
            <span>{source.label}</span>
            <strong>{sourceCounts[source.id]}</strong>
          </button>
        ))}
      </div>
      <div className="global-activity__status">
        <span className="global-activity__live" aria-live="polite">
          {visibleNewCount > 0 ? `${visibleNewCount} new` : 'Live'}
        </span>
        <span>{selectedSource === 'github' ? 'Best-effort GitHub events' : 'Activity on DevGlobe'}</span>
      </div>

      {loading && <p className="global-activity__message">Loading activities...</p>}
      {!loading && error && (
        <div className="global-activity__message">
          <span>{error}</span>
          <button type="button" onClick={() => refresh(activities.length === 0)}>Retry</button>
        </div>
      )}
      {!loading && !error && visibleActivities.length === 0 && (
        <p className="global-activity__message">
          {selectedSource === 'github'
            ? 'No GitHub activity has been collected in the last 24 hours.'
            : 'No DevGlobe activity has been recorded in the last 24 hours.'}
        </p>
      )}

      <ol className="global-activity__list">
        {visibleActivities.map(activity => (
          <li className={newActivityIds.has(activity.id) ? 'global-activity__item global-activity__item--new' : 'global-activity__item'} key={activity.id}>
            <Link className="global-activity__developer" href={`/developer/${encodeURIComponent(activity.login)}`}>
              <img src={activity.avatarUrl || `https://github.com/${encodeURIComponent(activity.login)}.png?size=64`} alt="" loading="lazy" />
              <span>@{activity.login}</span>
            </Link>
            {selectedSource === 'github' ? (
              <a className="global-activity__event" href={activity.url} target="_blank" rel="noopener noreferrer">
                {activity.description}
              </a>
            ) : (
              <Link className="global-activity__event" href={activity.url}>{activity.description}</Link>
            )}
            <time dateTime={activity.createdAt} title={new Date(activity.createdAt).toLocaleString()}>
              {relativeTime(activity.createdAt)}
            </time>
          </li>
        ))}
      </ol>

      {nextCursor && (
        <button className="global-activity__more" type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load earlier activity'}
        </button>
      )}
      {lastUpdated && (
        <time className="global-activity__updated" dateTime={lastUpdated.toISOString()}>
          Checked {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      )}
    </div>
  );
}