'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import { formatNum, formatRelativeTime } from '../lib/format.js';
import { publicApiUrl } from '../lib/public-api.js';
import { acquisitionAttributionProperties } from '../lib/share-attribution.js';
import { identityCardShareUrl } from '../lib/share-attribution.js';
import { getSiteUrl, IDENTITY_CARD_VERSION } from '../lib/site.js';
import { useActivityFeed } from './useActivityFeed.js';
import BadgeSnippet from './BadgeSnippet.jsx';
import SpecialTags from './SpecialTags.jsx';
import ImpactHistoryPanel from './ImpactHistoryPanel.jsx';

export default function DeveloperActivityPage({ login }) {
  const [developer, setDeveloper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [claimState, setClaimState] = useState('idle');
  const [claimMessage, setClaimMessage] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [siteUrl, setSiteUrl] = useState(getSiteUrl);
  const {
    activities,
    loading: activitiesLoading,
    newActivityIds,
    lastUpdated,
  } = useActivityFeed(login, { limit: 20 });

  useEffect(() => {
    setSiteUrl(window.location.origin);
  }, []);

  useEffect(() => {
    const attribution = acquisitionAttributionProperties(new URLSearchParams(window.location.search), { referrer: document.referrer, siteUrl: window.location.origin });
    track('site_visited', { ...attribution, journey: 'developer_profile' });
    track('profile_viewed', { login, ...attribution });
  }, [login]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [developerResponse, sessionResponse] = await Promise.all([
          fetch(publicApiUrl(`/api/developer?id=${encodeURIComponent(login)}`)),
          fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' }),
        ]);
        if (!developerResponse.ok) throw new Error('Developer not found');

        const profile = await developerResponse.json();
        const session = sessionResponse.ok ? await sessionResponse.json() : {};
        if (!cancelled) {
          setDeveloper(profile);
          setUser(session.user || null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [login]);

  const isOwner = user?.login?.toLowerCase() === login.toLowerCase();

  function claimReturnTo() {
    const params = new URLSearchParams(window.location.search);
    const safe = new URLSearchParams();
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      if (params.has(key)) safe.set(key, params.get(key));
    }
    const query = safe.toString();
    return `/developer/${encodeURIComponent(login)}${query ? `?${query}` : ''}`;
  }

  const completeClaim = useCallback(async source => {
    setClaimState('claiming');
    setClaimMessage('');
    track('claim_started', { login, source });
    try {
      const response = await fetch('/api/auth/claim', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to claim this profile');
      if (result.profileStatus !== 'public') {
        setClaimState('pending');
        setClaimMessage('Your ownership is verified. This profile is pending publication review.');
        return;
      }
      const profileResponse = await fetch(publicApiUrl(`/api/developer?id=${encodeURIComponent(login)}`), { cache: 'no-store' });
      if (!profileResponse.ok) throw new Error('The profile was claimed but could not be refreshed');
      setDeveloper(await profileResponse.json());
      setClaimState('success');
      setClaimMessage('Profile claimed. You now control how collaborators and AI agents discover you.');
      const attribution = acquisitionAttributionProperties(new URLSearchParams(window.location.search), {
        referrer: document.referrer,
        siteUrl: window.location.origin,
      });
      track('claim_completed', { login, ...attribution });
    } catch (claimError) {
      setClaimState('error');
      setClaimMessage(claimError.message);
      track('claim_failed', { login, outcome: 'request_failed', source });
    }
  }, [login]);

  async function claimProfile() {
    try { localStorage.setItem('devglobe-pending-claim', login); } catch { /* OAuth can continue without persistence. */ }
    track('claim_clicked', { source: 'developer_page' });
    if (isOwner) {
      await completeClaim('developer_page');
      return;
    }
    if (user) await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    track('github_auth_started', { source: 'developer_page' });
    const returnTo = claimReturnTo();
    window.location.assign(`/api/auth/github?login=${encodeURIComponent(login)}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  useEffect(() => {
    if (loading || !developer || claimState !== 'idle') return;
    if (!developer.claimed) track('claim_cta_viewed', { login, source: 'developer_page' });

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') !== 'success' || params.get('claim') !== 'auto') return;
    try { localStorage.removeItem('devglobe-pending-claim'); } catch { /* The server-bound OAuth continuation is authoritative. */ }
    params.delete('auth');
    params.delete('claim');
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
    track('github_auth_completed', { source: 'developer_page' });
    if (!user || !isOwner) {
      setClaimState('identity-mismatch');
      setClaimMessage(`Sign in as @${login} to claim this profile. No changes were made.`);
      return;
    }
    if (developer.claimed) {
      setClaimState('success');
      setClaimMessage('This profile is already claimed by your GitHub identity.');
      return;
    }
    void completeClaim('oauth_return');
  }, [claimState, completeClaim, developer, isOwner, loading, login, user]);

  async function shareProfile() {
    const text = `See @${login}'s public open-source profile on DevGlobe.`;
    try {
      if (navigator.share) {
        const url = identityCardShareUrl(window.location.origin, login, 'native_share', IDENTITY_CARD_VERSION);
        await navigator.share({ title: `@${login} on DevGlobe`, text, url });
        track('agent_profile_shared', { login, channel: 'native_share' });
        setShareStatus('Profile shared');
      } else {
        const url = identityCardShareUrl(window.location.origin, login, 'copy_link', IDENTITY_CARD_VERSION);
        await navigator.clipboard.writeText(`${text}\n${url}`);
        track('agent_profile_shared', { login, channel: 'copy_link' });
        setShareStatus('Profile link copied');
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setShareStatus('Unable to share profile');
    }
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

          {!developer.claimed && (
            <section className="profile-ownership" aria-labelledby="profile-ownership-title">
              <div className="profile-ownership__copy">
                <span>Control your public developer identity</span>
                <h2 id="profile-ownership-title">Is this your GitHub profile?</h2>
                <p>Verify with GitHub to manage opportunity preferences, show whether you accept agent requests, receive weekly impact updates, and create a shareable identity card.</p>
              </div>
              <ul className="profile-ownership__benefits" aria-label="Claim benefits">
                <li>Set work and collaboration preferences</li>
                <li>Control consent-gated agent introductions</li>
                <li>Track rank and public contribution changes</li>
              </ul>
              <div className="profile-ownership__action">
                <button type="button" className="btn btn--primary" onClick={claimProfile} disabled={claimState === 'claiming'}>
                  {claimState === 'claiming' ? 'Verifying with GitHub...' : `Claim @${login} with GitHub`}
                </button>
                <small>DevGlobe checks that the signed-in GitHub login matches @{login}.</small>
              </div>
              {claimMessage && (
                <p className={`profile-ownership__status profile-ownership__status--${claimState}`} role="status" aria-live="polite">
                  {claimMessage}
                </p>
              )}
            </section>
          )}

          {developer.claimed && isOwner && (
            <section className="profile-owner-hub" aria-labelledby="profile-owner-hub-title">
              <div className="profile-owner-hub__heading">
                <div>
                  <span>Your verified DevGlobe identity</span>
                  <h2 id="profile-owner-hub-title">Turn your profile into opportunities</h2>
                </div>
                <button type="button" onClick={shareProfile}>{shareStatus || 'Share profile'}</button>
              </div>
              {claimMessage && <p className="profile-owner-hub__success" role="status">{claimMessage}</p>}
              <div className="profile-owner-hub__actions">
                <Link href={`/?dev=${encodeURIComponent(login)}&setup=ai-profile`}>Set opportunity preferences</Link>
                <Link href={`/?dev=${encodeURIComponent(login)}&open=contributions`}>Find a contribution</Link>
                <Link href={`/?dev=${encodeURIComponent(login)}&setup=weekly-updates`}>Enable weekly updates</Link>
                <Link href={`/share/${encodeURIComponent(login)}`}>Open identity card</Link>
              </div>
              <BadgeSnippet login={login} siteUrl={siteUrl} />
            </section>
          )}

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