'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { publicApiUrl } from '../lib/public-api.js';

const POLL_INTERVAL_MS = 60000;
const MAX_VISIBLE_EVENTS = 300;

function mergeActivities(current, incoming) {
  const byId = new Map(current.map(activity => [activity.id, activity]));
  incoming.forEach(activity => byId.set(activity.id, activity));
  return [...byId.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice(0, MAX_VISIBLE_EVENTS);
}

export function useGlobalActivityFeed(active, { intervalMs = POLL_INTERVAL_MS } = {}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [newActivityIds, setNewActivityIds] = useState(new Set());
  const [nextCursor, setNextCursor] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const afterCursorRef = useRef(null);
  const knownIdsRef = useRef(new Set());

  const requestPage = useCallback(async (query = '') => {
    const response = await fetch(publicApiUrl(`/api/activities/live${query}`));
    if (!response.ok) throw new Error('Live activity is temporarily unavailable');
    return response.json();
  }, []);

  const refresh = useCallback(async (initial = false) => {
    if (!active || (!initial && document.visibilityState === 'hidden')) return;
    if (initial) setLoading(true);
    try {
      const query = afterCursorRef.current
        ? `?after=${encodeURIComponent(afterCursorRef.current)}&limit=100`
        : '?limit=100';
      const data = await requestPage(query);
      const arrivedIds = new Set(data.activities
        .filter(activity => !knownIdsRef.current.has(activity.id))
        .map(activity => activity.id));
      data.activities.forEach(activity => knownIdsRef.current.add(activity.id));
      if (!initial && arrivedIds.size > 0) {
        setNewActivityIds(arrivedIds);
        setTimeout(() => setNewActivityIds(new Set()), 10000);
      }
      setActivities(current => initial ? data.activities : mergeActivities(current, data.activities));
      if (initial) setNextCursor(data.nextCursor);
      if (data.afterCursor) afterCursorRef.current = data.afterCursor;
      setLastUpdated(new Date());
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [active, requestPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await requestPage(`?cursor=${encodeURIComponent(nextCursor)}&limit=100`);
      data.activities.forEach(activity => knownIdsRef.current.add(activity.id));
      setActivities(current => mergeActivities(current, data.activities));
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, requestPage]);

  useEffect(() => {
    if (!active) return undefined;
    refresh(activities.length === 0);
    const interval = setInterval(() => refresh(false), intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, activities.length, intervalMs, refresh]);

  return { activities, loading, loadingMore, error, newActivityIds, nextCursor, lastUpdated, loadMore, refresh };
}