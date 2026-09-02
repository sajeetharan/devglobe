'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import { formatRelativeTime } from '../lib/format.js';

const EMPTY_RESULT = { events: [], unreadCount: 0 };

export default function ReturnBriefing({ login, onOpenContributions, onOpenWeeklyUpdates }) {
  const [result, setResult] = useState(EMPTY_RESULT);
  const [status, setStatus] = useState('loading');
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/feed?limit=3', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load followed updates');
        if (!cancelled) {
          setResult({
            events: Array.isArray(data.events) ? data.events : [],
            unreadCount: Number.isInteger(data.unreadCount) ? data.unreadCount : 0,
          });
          setStatus('ready');
          track('return_briefing_viewed', { journey: 'personalized_return' });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => { cancelled = true; };
  }, []);

  async function reviewUpdates() {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (!willExpand) return;

    track('return_briefing_action_selected', { action: 'review_updates', journey: 'personalized_return' });
    const unreadEvents = result.events.filter(event => !event.read);
    if (unreadEvents.length === 0) return;

    try {
      const response = await fetch('/api/feed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: unreadEvents.flatMap(event => event.groupedIds || [event.id]) }),
      });
      if (!response.ok) return;
      setResult(current => ({
        events: current.events.map(event => ({ ...event, read: true })),
        unreadCount: Math.max(0, current.unreadCount - unreadEvents.length),
      }));
    } catch { /* Reviewing updates remains available when read state cannot be saved. */ }
  }

  const newest = result.events[0];
  const updateLabel = status === 'loading'
    ? 'Checking followed developers...'
    : newest?.summary || (status === 'unavailable'
      ? 'Your return tools are still available.'
      : 'Follow developers to receive meaningful updates here.');

  if (dismissed) return null;

  return (
    <aside className={`return-briefing${expanded ? ' return-briefing--expanded' : ''}`} aria-labelledby="return-briefing-title">
      <div className="return-briefing__heading">
        <div>
          <span>YOUR DEVGlobe</span>
          <h2 id="return-briefing-title">Welcome back</h2>
        </div>
        <div className="return-briefing__heading-actions">
          {result.unreadCount > 0 && <strong aria-label={`${result.unreadCount} unread followed updates`}>{result.unreadCount} new</strong>}
          <button
            type="button"
            className="return-briefing__close"
            onClick={() => setDismissed(true)}
            aria-label="Close welcome back"
            title="Close welcome back"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      </div>

      <p className="return-briefing__summary">{updateLabel}</p>

      {expanded && result.events.length > 0 && (
        <ol className="return-briefing__updates">
          {result.events.map(event => (
            <li key={event.id}>
              <span>{event.summary}</span>
              <small>@{event.subjectLogin} · {formatRelativeTime(event.createdAt)}</small>
            </li>
          ))}
        </ol>
      )}

      <div className="return-briefing__actions">
        {result.events.length > 0 && (
          <button type="button" onClick={reviewUpdates} aria-expanded={expanded}>
            {expanded ? 'Hide updates' : 'Review updates'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            track('return_briefing_action_selected', { action: 'find_contribution', journey: 'personalized_return' });
            onOpenContributions();
          }}
        >
          Find a contribution
        </button>
        <Link
          href={`/developer/${encodeURIComponent(login)}`}
          onClick={() => track('return_briefing_action_selected', { action: 'view_impact', journey: 'personalized_return' })}
        >
          View my impact
        </Link>
        <button
          type="button"
          onClick={() => {
            track('return_briefing_action_selected', { action: 'weekly_updates', journey: 'personalized_return' });
            onOpenWeeklyUpdates();
          }}
        >
          Weekly updates
        </button>
      </div>
    </aside>
  );
}