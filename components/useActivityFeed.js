'use client';

import { useEffect, useRef, useState } from 'react';
import { publicApiUrl } from '../lib/public-api.js';

const SESSION_CACHE_PREFIX = 'devglobe-activity:';
const SESSION_CACHE_MS = 10 * 60 * 1000;

function readSessionActivities(logins) {
  try {
    return logins.flatMap(login => {
      const cached = JSON.parse(sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${login}`));
      return cached?.savedAt > Date.now() - SESSION_CACHE_MS ? cached.activities : [];
    });
  } catch {
    return [];
  }
}

function saveSessionActivities(activities) {
  try {
    const activitiesByLogin = new Map();
    activities.forEach(activity => {
      const loginActivities = activitiesByLogin.get(activity.login) || [];
      loginActivities.push(activity);
      activitiesByLogin.set(activity.login, loginActivities);
    });
    activitiesByLogin.forEach((loginActivities, login) => {
      sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${login}`, JSON.stringify({
        activities: loginActivities,
        savedAt: Date.now(),
      }));
    });
  } catch { /* session storage unavailable */ }
}

export function useActivityFeed(logins, { limit, intervalMs = 300000 } = {}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newActivityIds, setNewActivityIds] = useState(new Set());
  const [lastUpdated, setLastUpdated] = useState(null);
  const knownIdsRef = useRef(null);

  useEffect(() => {
    if (!logins) return;
    let cancelled = false;
    let inFlight = false;
    let highlightTimer;
    const query = new URLSearchParams({ logins });
    const loginList = logins.split(',');
    if (limit) query.set('limit', String(limit));

    async function refresh(force = false) {
      if (inFlight || (!force && document.visibilityState === 'hidden')) return;
      inFlight = true;
      try {
        const response = await fetch(publicApiUrl(`/api/activities?${query}`));
        if (!response.ok) throw new Error('Activity request failed');
        const data = await response.json();
        if (cancelled) return;

        if (data.length === 0 && knownIdsRef.current?.size > 0) {
          setLastUpdated(new Date());
          return;
        }

        const nextIds = new Set(data.map(activity => activity.id));
        if (knownIdsRef.current) {
          const arrivedIds = new Set(data
            .filter(activity => !knownIdsRef.current.has(activity.id))
            .map(activity => activity.id));
          if (arrivedIds.size > 0) {
            setNewActivityIds(arrivedIds);
            clearTimeout(highlightTimer);
            highlightTimer = setTimeout(() => setNewActivityIds(new Set()), 10000);
          }
        }
        knownIdsRef.current = nextIds;
        saveSessionActivities(data);
        setActivities(data);
        setLastUpdated(new Date());
      } catch {
        if (!cancelled && knownIdsRef.current === null) setActivities([]);
      } finally {
        if (!cancelled) setLoading(false);
        inFlight = false;
      }
    }

    const cachedActivities = readSessionActivities(loginList)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    knownIdsRef.current = cachedActivities.length > 0
      ? new Set(cachedActivities.map(activity => activity.id))
      : null;
    setActivities(cachedActivities);
    setNewActivityIds(new Set());
    setLoading(cachedActivities.length === 0);
    refresh(true);
    const interval = setInterval(refresh, intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(highlightTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, limit, logins]);

  return { activities, loading, newActivityIds, lastUpdated };
}