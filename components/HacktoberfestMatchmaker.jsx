'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import styles from './HacktoberfestMatchmaker.module.css';

export default function HacktoberfestMatchmaker() {
  const [login, setLogin] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const initialLogin = new URLSearchParams(window.location.search).get('login') || '';
    if (/^[a-z\d-]{1,39}$/i.test(initialLogin)) setLogin(initialLogin);
    track('recommendation_opened', { journey: 'hacktoberfest_matchmaker' });
  }, []);

  async function findMatches(event) {
    event.preventDefault();
    const normalizedLogin = login.trim().replace(/^@/, '');
    setStatus('loading');
    setError('');
    setResult(null);
    track('next_action_selected', { action: 'hacktoberfest_username_submit', journey: 'hacktoberfest_matchmaker' });

    try {
      const response = await fetch(`/api/hacktoberfest-matches?login=${encodeURIComponent(normalizedLogin)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to find matches');
      setResult(data);
      setStatus('ready');
      window.history.replaceState({}, '', `/hacktoberfest?login=${encodeURIComponent(data.developer.login)}`);
    } catch (matchError) {
      setError(matchError.message);
      setStatus('error');
    }
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Hacktoberfest Matchmaker navigation">
        <Link href="/" className={styles.brand}>
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <a href="https://github.com/sajeetharan/devglobe" target="_blank" rel="noreferrer">GitHub</a>
      </nav>

      <section className={styles.workspace}>
        <header className={styles.intro}>
          <span className={styles.eyebrow}>HACKTOBERFEST 2026</span>
          <h1>Find an issue worth opening.</h1>
          <p>Enter your GitHub username. DevGlobe uses your public language profile to find three fresh, unassigned issues with contribution guidance.</p>
          <dl className={styles.criteria}>
            <div><dt>01</dt><dd>Matched to your languages</dd></div>
            <div><dt>02</dt><dd>Open and unassigned</dd></div>
            <div><dt>03</dt><dd>Contribution guide verified</dd></div>
          </dl>
        </header>

        <div className={styles.tool} aria-busy={status === 'loading'}>
          <div className={styles.toolHeading}>
            <span>OPEN SOURCE PASSPORT</span>
            <span>Public beta</span>
          </div>
          <form onSubmit={findMatches} className={styles.form}>
            <label htmlFor="hacktoberfest-login">GitHub username</label>
            <div className={styles.inputRow}>
              <span aria-hidden="true">@</span>
              <input
                id="hacktoberfest-login"
                name="login"
                value={login}
                onChange={event => setLogin(event.target.value)}
                placeholder="octocat"
                autoComplete="username"
                spellCheck="false"
                required
                maxLength="40"
              />
              <button type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Matching...' : 'Find my matches'}
              </button>
            </div>
            <p>Public DevGlobe data only. No sign-in required.</p>
          </form>

          {status === 'loading' && (
            <div className={styles.state} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              <div><strong>Checking contribution-ready issues</strong><span>This can take a few seconds.</span></div>
            </div>
          )}
          {status === 'error' && (
            <div className={`${styles.state} ${styles.error}`} role="alert">
              <div><strong>We could not build this passport</strong><span>{error}</span></div>
            </div>
          )}

          {status === 'ready' && result && (
            <section className={styles.results} aria-labelledby="match-results-title">
              <div className={styles.profile}>
                {result.developer.avatarUrl
                  ? <img src={result.developer.avatarUrl} alt="" />
                  : <span className={styles.avatarFallback} aria-hidden="true">{result.developer.login[0].toUpperCase()}</span>}
                <div>
                  <span>Matches for @{result.developer.login}</span>
                  <h2 id="match-results-title">Your Hacktoberfest shortlist</h2>
                </div>
                <div className={styles.languages} aria-label="Matched languages">
                  {result.developer.languages.map(language => <span key={language}>{language}</span>)}
                </div>
              </div>

              {result.matches.length > 0 ? (
                <div className={styles.matchList}>
                  {result.matches.map((match, index) => (
                    <article className={styles.match} key={match.id}>
                      <span className={styles.matchNumber}>0{index + 1}</span>
                      <div className={styles.matchBody}>
                        <span className={styles.repository}>{match.repository}</span>
                        <h3>{match.title}</h3>
                        <div className={styles.reasons}>
                          {match.reasons.map(reason => <span key={reason}>{reason}</span>)}
                        </div>
                      </div>
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track('next_action_selected', { action: 'open_hacktoberfest_match', journey: 'hacktoberfest_matchmaker' })}
                      >
                        Open issue
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M7 17 17 7M7 7h10v10" />
                        </svg>
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.state} role="status">
                  <div><strong>No strong matches right now</strong><span>Fresh issues change often. Try again later or use the full contribution finder.</span></div>
                </div>
              )}

              <div className={styles.saveCta}>
                <div><strong>Want more control?</strong><span>Sign in to choose interests and difficulty, save preferences, and dismiss results.</span></div>
                <a href={`/api/auth/github?login=${encodeURIComponent(result.developer.login)}`}>Sign in to personalize</a>
              </div>
            </section>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Built for useful contributions, not contribution counts.</span>
        <Link href="/">Explore DevGlobe</Link>
      </footer>
    </main>
  );
}