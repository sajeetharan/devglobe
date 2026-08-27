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
import { SCORE_METHODOLOGY } from '../lib/scoring.js';

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
        </nav>
      </header>

      <section className="leaderboard-page__hero" aria-labelledby="leaderboard-title">
        <p className="leaderboard-page__eyebrow">OPEN-SOURCE IMPACT / GLOBAL BOARD</p>
        <div className="leaderboard-page__hero-grid">
          <div>
            <h1 id="leaderboard-title">See who is shaping the open web.</h1>
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

      <section className="leaderboard-board" aria-label="Developer leaderboard">
        <div className="leaderboard-board__heading">
          <div>
            <p className="leaderboard-page__eyebrow">THE RANKINGS</p>
            <h2>Global impact</h2>
          </div>
          <p title={SCORE_METHODOLOGY.short}>Scores are relative to developers currently indexed by DevGlobe.</p>
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
                  <th scope="col">Stars</th>
                  <th scope="col">Commits</th>
                  <th scope="col">OSS worth</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(developer => (
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
                    </td>
                    <td data-label="Location">
                      <strong>{developer.location || 'Location unknown'}</strong>
                      <span>{developer.topLanguage || 'Language unknown'}</span>
                    </td>
                    <td className="leaderboard-board__score" data-label="Impact score">
                      <strong>{developer.score}</strong><span>/100</span>
                    </td>
                    <td data-label="GitHub stars">{formatNum(developer.totalStars)}</td>
                    <td data-label="Commit activity">{formatNum(developer.totalCommits)}</td>
                    <td data-label="Estimated OSS worth">{formatUsd(developer.ossWorth?.totalDollarValue, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </main>
  );
}