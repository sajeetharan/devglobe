'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { prepareDeveloperDataset } from '../lib/developer-dataset.js';
import { track } from '../lib/analytics.js';
import { formatNum, formatUsd } from '../lib/format.js';
import {
  filterAndSortLeaderboard,
  findLeaderboardDeveloper,
  getLeaderboardFilters,
  normalizeGitHubLogin,
} from '../lib/leaderboard.js';
import {
  buildRankMovement,
  LEADERBOARD_PERIODS,
} from '../lib/leaderboard-movement.js';
import { SCORE_METHODOLOGY } from '../lib/scoring.js';
import { acquisitionAttributionProperties, buildDeveloperStory, DEVELOPER_STORY_TYPES } from '../lib/share-attribution.js';
import LeaderboardActivityRibbon from './LeaderboardActivityRibbon.jsx';
import LeaderboardTrust from './LeaderboardTrust.jsx';

const PAGE_SIZE = 500;
const DISPLAY_STEP = 100;

const SORT_LABELS = {
  score: 'Impact score',
  stars: 'GitHub stars',
  commits: 'Commit activity',
  worth: 'OSS worth',
};

function nextPageUrl(page) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (page.nextCursor) params.set('cursor', page.nextCursor);
  else if (Number.isInteger(page.nextOffset)) params.set('offset', String(page.nextOffset));
  return `/api/developers?${params}`;
}

export default function LeaderboardPage() {
  const [theme, setTheme] = useState('dark');
  const [developers, setDevelopers] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [sortBy, setSortBy] = useState('score');
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_STEP);
  const [sessionLogin, setSessionLogin] = useState('');
  const [lookup, setLookup] = useState('');
  const [pendingLookup, setPendingLookup] = useState('');
  const [locatedLogin, setLocatedLogin] = useState('');
  const [lookupStatus, setLookupStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attribution = acquisitionAttributionProperties(params, { referrer: document.referrer, siteUrl: window.location.origin });
    track('site_visited', { ...attribution, journey: 'leaderboard' });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('devglobe-theme');
      const initialTheme = stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      setTheme(initialTheme);
    } catch { /* The default dark theme remains available without storage. */ }
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('devglobe-theme', next); } catch { /* Persistence is optional. */ }
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }
  const [period, setPeriod] = useState(30);
  const [movementResult, setMovementResult] = useState(null);
  const [movementStatus, setMovementStatus] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/developers/count', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (Number.isInteger(data?.count)) setTotalCount(data.count);
      })
      .catch(() => {});

    fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data?.user?.login) setSessionLogin(data.user.login);
      })
      .catch(() => {});

    const requestedLogin = normalizeGitHubLogin(new URLSearchParams(window.location.search).get('developer'));
    if (requestedLogin) {
      setLookup(requestedLogin);
      setPendingLookup(requestedLogin);
    }

    async function loadDevelopers() {
      let allDevelopers = [];
      let url = `/api/developers?limit=${PAGE_SIZE}`;

      try {
        while (url) {
          const response = await fetch(url, { signal: controller.signal });
          const page = await response.json();
          if (!response.ok) throw new Error(page.error || 'Unable to load the leaderboard');

          allDevelopers = [...allDevelopers, ...page.developers];
          const isFirstPage = allDevelopers.length === page.developers.length;
          if (isFirstPage || !page.hasMore) setDevelopers(prepareDeveloperDataset(allDevelopers));
          setLoading(false);
          setLoadingMore(Boolean(page.hasMore));
          url = page.hasMore ? nextPageUrl(page) : '';
        }
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message);
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }

    loadDevelopers();
    return () => controller.abort();
  }, []);

  const options = useMemo(() => getLeaderboardFilters(developers), [developers]);
  const ranked = useMemo(() => filterAndSortLeaderboard(developers, {
    country,
    language,
    sortBy,
  }), [country, developers, language, sortBy]);
  const locatedIndex = locatedLogin
    ? ranked.findIndex(developer => developer.login.toLowerCase() === locatedLogin.toLowerCase())
    : -1;
  const visible = locatedIndex >= 0
    ? ranked.slice(Math.max(0, locatedIndex - 2), Math.min(ranked.length, locatedIndex + 3))
    : ranked.slice(0, displayLimit);
  const movementLogins = visible.map(developer => developer.login.toLowerCase()).join(',');
  const movement = useMemo(
    () => buildRankMovement(developers, movementResult?.snapshots || []),
    [developers, movementResult]
  );

  useEffect(() => {
    if (!movementLogins) return undefined;
    const controller = new AbortController();
    setMovementStatus('loading');
    setMovementResult(null);
    const params = new URLSearchParams({ days: String(period), logins: movementLogins });
    fetch(`/api/leaderboard/movement?${params}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load rank movement');
        setMovementResult(body);
        setMovementStatus('ready');
      })
      .catch(error => {
        if (error.name !== 'AbortError') setMovementStatus('error');
      });
    return () => controller.abort();
  }, [movementLogins, period]);

  useEffect(() => setDisplayLimit(DISPLAY_STEP), [country, language, sortBy]);

  useEffect(() => {
    if (!pendingLookup || loading) return;
    if (!findLeaderboardDeveloper(developers, pendingLookup) && loadingMore) return;
    locateDeveloper(pendingLookup, 'shared_link');
    setPendingLookup('');
  }, [developers, loading, loadingMore, pendingLookup]);

  useEffect(() => {
    if (!locatedLogin) return;
    document.getElementById(`leaderboard-${locatedLogin.toLowerCase()}`)?.focus();
  }, [locatedLogin]);

  function locateDeveloper(value, source = 'username_search') {
    const login = normalizeGitHubLogin(value);
    if (!login) {
      setLookupStatus('Enter a valid GitHub username.');
      track('leaderboard_rank_lookup', { source, outcome: 'invalid' });
      return;
    }

    const developer = findLeaderboardDeveloper(developers, login);
    const url = new URL(window.location.href);
    url.searchParams.set('developer', login);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);

    if (!developer) {
      if (loading || loadingMore) {
        setPendingLookup(login);
        setLookupStatus(`Still loading profiles before looking up @${login}...`);
        return;
      }
      setLocatedLogin('');
      setLookupStatus(`@${login} is not indexed yet.`);
      track('leaderboard_rank_lookup', { source, outcome: 'not_found' });
      return;
    }

    setCountry('');
    setLanguage('');
    setSortBy('score');
    setLocatedLogin(developer.login);
    setLookupStatus(`@${developer.login} is global #${formatNum(developer.globalRank)}.`);
    track('leaderboard_rank_lookup', { source, outcome: 'found' });
  }

  function clearLocatedDeveloper() {
    setLocatedLogin('');
    setLookupStatus('');
    const url = new URL(window.location.href);
    url.searchParams.delete('developer');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  function handleLookup(event) {
    event.preventDefault();
    locateDeveloper(lookup);
  }

  async function shareDeveloperStory(developer, rankMovement) {
    const type = rankMovement?.status === 'up'
      ? DEVELOPER_STORY_TYPES.RANK_MOVEMENT
      : country && Number.isInteger(developer.countryRank)
        ? DEVELOPER_STORY_TYPES.COUNTRY_LEADER
        : DEVELOPER_STORY_TYPES.SPOTLIGHT;
    const channel = navigator.share ? 'native_share' : 'copy_link';
    const story = buildDeveloperStory({
      siteUrl: window.location.origin,
      developer,
      type,
      channel,
      period,
      movement: rankMovement?.delta,
    });

    try {
      if (navigator.share) await navigator.share({ title: story.title, text: story.text, url: story.url });
      else await navigator.clipboard.writeText(`${story.text}\n${story.url}`);
      setShareStatus(`${developer.name || `@${developer.login}`} story ${navigator.share ? 'shared' : 'copied'}.`);
      track('leaderboard_story_shared', { login: developer.login, channel, action: type });
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Unable to share this story.');
    }
  }

  return (
    <main className="leaderboard-page">
      <header className="leaderboard-page__nav">
        <Link href="/" className="leaderboard-page__brand">
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <nav aria-label="Leaderboard navigation">
          <Link href="/countries">Country stats</Link>
          <Link href="/" className="leaderboard-page__back">Explore the globe</Link>
          <button
            type="button"
            className="leaderboard-page__theme"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            )}
          </button>
        </nav>
      </header>

      <section className="leaderboard-board" aria-labelledby="leaderboard-title">
        <div className="leaderboard-board__heading">
          <div>
            <p className="leaderboard-page__eyebrow">THE RANKINGS</p>
            <h1 id="leaderboard-title">Global impact</h1>
          </div>
          <p title={SCORE_METHODOLOGY.short}>
            Scores are relative to developers currently indexed by DevGlobe.{' '}
            <a href="#score-methodology">View methodology</a>
          </p>
        </div>

        <div className="leaderboard-period">
          <div className="leaderboard-period__tabs" role="group" aria-label="Rank comparison period">
            {LEADERBOARD_PERIODS.map(days => (
              <button
                key={days}
                type="button"
                aria-pressed={period === days}
                className={period === days ? 'active' : ''}
                onClick={() => setPeriod(days)}
              >
                {days} days
              </button>
            ))}
          </div>
          <p>
            {movementStatus === 'loading' && 'Loading rank movement...'}
            {movementStatus === 'error' && 'Rank movement is temporarily unavailable.'}
            {movementStatus === 'ready' && !movementResult?.hasHistory && 'No historical snapshot is available for this period yet.'}
            {movementStatus === 'ready' && movementResult?.hasHistory && `Movement compares current rank with the latest snapshot on or before ${movementResult.baselineDay}.`}
            {' '}The impact score formula does not change.
          </p>
        </div>

        <form className="leaderboard-find" onSubmit={handleLookup}>
          <div>
            <label htmlFor="leaderboard-login">Where do you rank?</label>
            <span>Enter a GitHub username to locate its global position.</span>
          </div>
          <div className="leaderboard-find__input">
            <span aria-hidden="true">@</span>
            <input
              id="leaderboard-login"
              value={lookup}
              onChange={event => setLookup(event.target.value)}
              placeholder="github-login"
              autoComplete="off"
            />
          </div>
          <button type="submit">Find rank</button>
          {sessionLogin && (
            <button
              type="button"
              className="leaderboard-find__mine"
              onClick={() => {
                setLookup(sessionLogin);
                locateDeveloper(sessionLogin, 'signed_in');
              }}
            >
              My rank
            </button>
          )}
        </form>

        {lookupStatus && (
          <div className="leaderboard-find__status" role="status">
            <span>{lookupStatus}</span>
            {locatedLogin ? (
              <button type="button" onClick={clearLocatedDeveloper}>Return to full board</button>
            ) : normalizeGitHubLogin(lookup) ? (
              <Link href={`/?add=${encodeURIComponent(normalizeGitHubLogin(lookup))}`}>Add this developer</Link>
            ) : null}
          </div>
        )}

        <div className="leaderboard-board__controls">
          <label>
            <span>Country</span>
            <select value={country} onChange={event => setCountry(event.target.value)}>
              <option value="">All countries</option>
              {options.countries.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Language</span>
            <select value={language} onChange={event => setLanguage(event.target.value)}>
              <option value="">All languages</option>
              {options.languages.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Order by</span>
            <select value={sortBy} onChange={event => setSortBy(event.target.value)}>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <div className="leaderboard-board__result-count" aria-live="polite">
            {formatNum(ranked.length)} result{ranked.length === 1 ? '' : 's'}
          </div>
        </div>

        {loading && <div className="leaderboard-board__state" role="status">Loading the global rankings...</div>}
        {!loading && error && developers.length === 0 && (
          <div className="leaderboard-board__state leaderboard-board__state--error" role="alert">{error}</div>
        )}
        {!loading && !error && ranked.length === 0 && (
          <div className="leaderboard-board__state">No developers match these filters.</div>
        )}

        {visible.length > 0 && (
          <>
            {error && <p className="leaderboard-board__notice" role="status">Some profiles could not be loaded: {error}</p>}
            <table className="leaderboard-board__table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Developer</th>
                  <th scope="col">Location</th>
                  <th scope="col">Impact</th>
                  <th scope="col">Movement</th>
                  <th scope="col">Stars</th>
                  <th scope="col">Commits</th>
                  <th scope="col">OSS worth</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(developer => (
                  (() => {
                    const rankMovement = movement.get(developer.login.toLowerCase());
                    const movementUnavailable = movementStatus !== 'ready' || !movementResult?.hasHistory;
                    const movementLabel = movementUnavailable || rankMovement?.status === 'unavailable'
                      ? 'Not available'
                      : rankMovement?.status === 'new'
                        ? 'New'
                        : rankMovement?.status === 'unchanged'
                          ? 'No change'
                          : rankMovement?.status === 'up'
                            ? `Up ${rankMovement.delta}`
                            : `Down ${Math.abs(rankMovement?.delta || 0)}`;
                    return (
                  <tr
                    key={developer.login}
                    id={`leaderboard-${developer.login.toLowerCase()}`}
                    tabIndex={developer.login === locatedLogin ? -1 : undefined}
                    className={`${developer.globalRank === 1 ? 'leaderboard-board__leader' : ''}${developer.login === locatedLogin ? ' leaderboard-board__located' : ''}`}
                  >
                    <td className="leaderboard-board__rank" data-label="Global rank">
                      {developer.globalRank ? String(developer.globalRank).padStart(2, '0') : '--'}
                    </td>
                    <td className="leaderboard-board__developer">
                      <img src={developer.avatarUrl} alt="" loading="lazy" />
                      <div>
                        <Link href={`/developer/${encodeURIComponent(developer.login)}`}>
                          {developer.name || developer.login}
                        </Link>
                        <span>@{developer.login}{developer.claimed ? ' / claimed' : ''}</span>
                      </div>
                      <button
                        type="button"
                        className="leaderboard-board__share"
                        onClick={() => shareDeveloperStory(developer, movementUnavailable ? null : rankMovement)}
                        aria-label={`Share ${developer.name || developer.login}'s leaderboard story`}
                        title="Share leaderboard story"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                          <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
                        </svg>
                      </button>
                    </td>
                    <td data-label="Location">
                      <strong>{developer.location || 'Location unknown'}</strong>
                      <span>{developer.topLanguage || 'Language unknown'}</span>
                    </td>
                    <td className="leaderboard-board__score" data-label="Impact score">
                      <strong>{developer.score}</strong><span>/100</span>
                    </td>
                    <td data-label={`${period}-day movement`}>
                      <span className={`leaderboard-movement leaderboard-movement--${movementUnavailable ? 'unavailable' : rankMovement?.status || 'unavailable'}`}>
                        <i aria-hidden="true">
                          {!movementUnavailable && rankMovement?.status === 'up' ? '↑' : !movementUnavailable && rankMovement?.status === 'down' ? '↓' : '·'}
                        </i>
                        {movementLabel}
                      </span>
                    </td>
                    <td data-label="GitHub stars">{formatNum(developer.totalStars)}</td>
                    <td data-label="Commit activity">{formatNum(developer.totalCommits)}</td>
                    <td data-label="Estimated OSS worth">{formatUsd(developer.ossWorth?.totalDollarValue, true)}</td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
            <span className="visually-hidden" role="status" aria-live="polite">{shareStatus}</span>
            {locatedIndex < 0 && visible.length < ranked.length && (
              <button
                type="button"
                className="leaderboard-board__more"
                onClick={() => setDisplayLimit(limit => limit + DISPLAY_STEP)}
              >
                Show more developers
              </button>
            )}
          </>
        )}
      </section>

      <section className="leaderboard-page__hero" aria-labelledby="leaderboard-context-title">
        <p className="leaderboard-page__eyebrow">OPEN-SOURCE IMPACT / GLOBAL BOARD</p>
        <div className="leaderboard-page__hero-grid">
          <div>
            <h2 id="leaderboard-context-title">See who is shaping the open web.</h2>
            <p className="leaderboard-page__intro">
              Explore developers by a transparent, dataset-relative signal combining public GitHub
              and Stack Overflow activity. It measures indexed impact, not developer ability.
            </p>
          </div>
          <div className="leaderboard-page__count" aria-live="polite">
            <strong>{formatNum(totalCount ?? developers.length)}</strong>
            <span>developers ranked</span>
            {loadingMore && <small>Loading {formatNum(developers.length)} indexed profiles...</small>}
          </div>
        </div>
      </section>

      <LeaderboardActivityRibbon />
      <LeaderboardTrust />
    </main>
  );
}