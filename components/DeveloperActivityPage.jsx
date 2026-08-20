'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import { formatNum, formatRelativeTime } from '../lib/format.js';
import { publicApiUrl } from '../lib/public-api.js';
import { useActivityFeed } from './useActivityFeed.js';
import SpecialTags from './SpecialTags.jsx';
import ImpactHistoryPanel from './ImpactHistoryPanel.jsx';

export default function DeveloperActivityPage({ login }) {
  const [developer, setDeveloper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const {
    activities,
    loading: activitiesLoading,
    newActivityIds,
    lastUpdated,
  } = useActivityFeed(login, { limit: 20 });

  useEffect(() => {
    const source = new URLSearchParams(window.location.search).get('utm_source') || 'direct';
    track('profile_viewed', { login, source });
  }, [login]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const developerResponse = await fetch(publicApiUrl(`/api/developer?id=${encodeURIComponent(login)}`));
        if (!developerResponse.ok) throw new Error('Developer not found');

        const profile = await developerResponse.json();
        if (!cancelled) setDeveloper(profile);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [login]);

  function claimProfile() {
    try { localStorage.setItem('devglobe-pending-claim', login); } catch { /* OAuth can continue without persistence. */ }
    track('claim_clicked', { source: 'developer_page' });
    window.location.assign(`/api/auth/github?login=${encodeURIComponent(login)}`);
  }

  return (
    <main className="activity-page">
      <header className="activity-page__nav">
        <Link href="/" className="activity-page__brand">
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <Link href="/" className="activity-page__back">Back to globe</Link>
      </header>

      {loading && <div className="activity-page__state">Loading developer activity...</div>}
      {error && <div className="activity-page__state">{error}</div>}

      {developer && (
        <div className="activity-page__content">
          <section className="activity-profile">
            <img className="activity-profile__avatar" src={developer.avatarUrl} alt={developer.login} />
            <div className="activity-profile__identity">
              <span className="activity-profile__handle">@{developer.login}</span>
              <h1>{developer.name || developer.login}</h1>
              <SpecialTags tags={developer.specialTags} />
              <p>{developer.bio || `${developer.topLanguage || 'Open-source'} developer${developer.location ? ` from ${developer.location}` : ''}.`}</p>
              <div className="activity-profile__links">
                <a href={developer.githubUrl || `https://github.com/${developer.login}`} target="_blank" rel="noopener noreferrer">GitHub profile</a>
                {developer.soUserId && (
                  <a href={`https://stackoverflow.com/users/${developer.soUserId}`} target="_blank" rel="noopener noreferrer">Stack Overflow</a>
                )}
                {!developer.claimed && (
                  <button type="button" onClick={claimProfile}>Claim this profile</button>
                )}
              </div>
            </div>
            <dl className="activity-profile__stats">
              <div><dt>Stars</dt><dd>{formatNum(developer.totalStars)}</dd></div>
              <div><dt>Commits</dt><dd>{formatNum(developer.totalCommits)}</dd></div>
              <div><dt>Followers</dt><dd>{formatNum(developer.followers)}</dd></div>
            </dl>
          </section>

          <ImpactHistoryPanel login={developer.login} />

          <section className="activity-timeline" aria-labelledby="activity-timeline-title">
            <div className="activity-timeline__heading">
              <div>
                <span>Public GitHub events</span>
                <h2 id="activity-timeline-title">Recent activity</h2>
              </div>
              <span role="status" aria-live="polite">
                {newActivityIds.size > 0
                  ? `${newActivityIds.size} new events`
                  : `${activities.length} events${lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
              </span>
            </div>
            {activitiesLoading && <p className="activity-timeline__empty">Loading public GitHub activity...</p>}
            {!activitiesLoading && activities.length === 0 && (
              <p className="activity-timeline__empty">No recent public activity found.</p>
            )}
            {activities.map(activity => (
              <a className={`timeline-event${newActivityIds.has(activity.id) ? ' timeline-event--new' : ''}`} href={activity.url} target="_blank" rel="noopener noreferrer" key={activity.id}>
                <span className={`timeline-event__icon timeline-event__icon--${activity.type}`} aria-hidden="true" />
                <span className="timeline-event__body">
                  <strong>{activity.description}</strong>
                  <span>{activity.repo || developer.login}</span>
                </span>
                <time dateTime={activity.createdAt}>{formatRelativeTime(activity.createdAt)}</time>
              </a>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}