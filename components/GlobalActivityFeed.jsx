'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TodayMission from './TodayMission.jsx';
import { useGlobalActivityFeed } from './useGlobalActivityFeed.js';

const ACTIVITY_SOURCES = [
  { id: 'devglobe', label: 'DevGlobe Activity' },
  { id: 'github', label: 'GitHub Activity' },
];

const ACTIVITY_VIEWS = ['today', 'completed', 'community'];
const ACTIVITY_VIEW_SET = new Set(ACTIVITY_VIEWS);

function activityViewFromUrl() {
  if (typeof window === 'undefined') return 'today';
  const view = new URL(window.location.href).searchParams.get('activity');
  return ACTIVITY_VIEW_SET.has(view) ? view : 'today';
}

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

export default function GlobalActivityFeed({ active, onOpenContributions, onCreateCard }) {
  const [selectedView, setSelectedView] = useState('today');
  const [completedCount, setCompletedCount] = useState(null);
  const [selectedSource, setSelectedSource] = useState('devglobe');
  const viewTabsRef = useRef([]);
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

  useEffect(() => {
    const syncView = () => setSelectedView(activityViewFromUrl());
    syncView();
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);

  const selectView = useCallback(view => {
    setSelectedView(view);
    const url = new URL(window.location.href);
    url.searchParams.set('activity', view);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const handleViewKeyDown = useCallback((event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % ACTIVITY_VIEWS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + ACTIVITY_VIEWS.length) % ACTIVITY_VIEWS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = ACTIVITY_VIEWS.length - 1;
    else return;
    event.preventDefault();
    const nextView = ACTIVITY_VIEWS[nextIndex];
    selectView(nextView);
    viewTabsRef.current[nextIndex]?.focus();
  }, [selectView]);

  return (
    <div className="global-activity">
      <div className="global-activity__views" role="tablist" aria-label="Activity sections">
        <button ref={node => { viewTabsRef.current[0] = node; }} id="activity-tab-today" type="button" role="tab" tabIndex={selectedView === 'today' ? 0 : -1} aria-selected={selectedView === 'today'} aria-controls="activity-today" className={selectedView === 'today' ? 'global-activity__view global-activity__view--active' : 'global-activity__view'} onClick={() => selectView('today')} onKeyDown={event => handleViewKeyDown(event, 0)}>Today</button>
        <button ref={node => { viewTabsRef.current[1] = node; }} id="activity-tab-completed" type="button" role="tab" tabIndex={selectedView === 'completed' ? 0 : -1} aria-selected={selectedView === 'completed'} aria-controls="activity-completed" className={selectedView === 'completed' ? 'global-activity__view global-activity__view--active' : 'global-activity__view'} onClick={() => selectView('completed')} onKeyDown={event => handleViewKeyDown(event, 1)}>
          <span>Completed</span>
          {completedCount !== null && <strong>{completedCount}</strong>}
        </button>
        <button ref={node => { viewTabsRef.current[2] = node; }} id="activity-tab-community" type="button" role="tab" tabIndex={selectedView === 'community' ? 0 : -1} aria-selected={selectedView === 'community'} aria-controls="activity-community" className={selectedView === 'community' ? 'global-activity__view global-activity__view--active' : 'global-activity__view'} onClick={() => selectView('community')} onKeyDown={event => handleViewKeyDown(event, 2)}>Community</button>
      </div>

      {selectedView !== 'community' && (
        <div id={`activity-${selectedView}`} role="tabpanel" aria-labelledby={`activity-tab-${selectedView}`} className="global-activity__panel">
          <TodayMission
            active={active}
            view={selectedView}
            onOpenContributions={onOpenContributions}
            onCompletedCountChange={setCompletedCount}
          />
        </div>
      )}

      {selectedView === 'community' && <div id="activity-community" role="tabpanel" aria-labelledby="activity-tab-community" className="global-activity__community">
        <div className="global-activity__sources" role="group" aria-label="Community activity source">
        {ACTIVITY_SOURCES.map(source => (
          <button
            type="button"
            aria-pressed={selectedSource === source.id}
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

      {loading && <p className="global-activity__message" role="status">Loading activities…</p>}
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
            {activity.type === 'generated_card' ? (
              <div className="global-activity__event global-activity__event--card">
                <span>{activity.description}</span>
                <span className="global-activity__actions">
                  <Link href={activity.url}>View card</Link>
                  <button type="button" onClick={onCreateCard}>Create yours</button>
                </span>
              </div>
            ) : selectedSource === 'github' ? (
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
          {loadingMore ? 'Loading…' : 'Load earlier activity'}
        </button>
      )}
      {lastUpdated && (
        <time className="global-activity__updated" dateTime={lastUpdated.toISOString()}>
          Checked {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      )}
      </div>}
    </div>
  );
}