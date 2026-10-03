'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import { acquisitionAttributionProperties } from '../lib/share-attribution.js';
import { HACKTOBERFEST_CAMPAIGN } from '../lib/hacktoberfest-campaign.js';
import { CONTRIBUTION_LANGUAGES } from '../lib/contribution-opportunities.js';
import styles from './HacktoberfestMatchmaker.module.css';

export default function HacktoberfestMatchmaker() {
  const [login, setLogin] = useState('');
  const [mode, setMode] = useState('profile');
  const [language, setLanguage] = useState('typescript');
  const [taskPreference, setTaskPreference] = useState('any');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [profileMissing, setProfileMissing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialLogin = params.get('login') || '';
    if (/^[a-z\d-]{1,39}$/i.test(initialLogin)) setLogin(initialLogin);
    if (params.get('mode') === 'guest') {
      setMode('guest');
      if (CONTRIBUTION_LANGUAGES.includes(params.get('language'))) setLanguage(params.get('language'));
      if (['any', 'code', 'content'].includes(params.get('task'))) setTaskPreference(params.get('task'));
    }
    track('site_visited', {
      ...acquisitionAttributionProperties(params, { referrer: document.referrer, siteUrl: window.location.origin }),
      journey: 'hacktoberfest_matchmaker',
    });
    track('recommendation_opened', { journey: 'hacktoberfest_matchmaker', campaign: HACKTOBERFEST_CAMPAIGN });
  }, []);

  async function findMatches(event) {
    event.preventDefault();
    const normalizedLogin = login.trim().replace(/^@/, '');
    setStatus('loading');
    setError('');
    setProfileMissing(false);
    setResult(null);
    track('next_action_selected', { action: mode === 'guest' ? 'hacktoberfest_guest_submit' : 'hacktoberfest_username_submit', journey: 'hacktoberfest_matchmaker', campaign: HACKTOBERFEST_CAMPAIGN });

    try {
      const params = mode === 'guest'
        ? new URLSearchParams({ mode: 'guest', language, task: taskPreference })
        : new URLSearchParams({ login: normalizedLogin });
      const response = await fetch(`/api/hacktoberfest-matches?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setProfileMissing(response.status === 404);
        throw new Error(data.error || 'Unable to find matches');
      }
      setResult(data);
      setStatus('ready');
      const url = new URL(window.location.href);
      for (const key of ['login', 'mode', 'language', 'task']) url.searchParams.delete(key);
      for (const [key, value] of params) url.searchParams.set(key, key === 'login' ? data.developer.login : value);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    } catch (matchError) {
      setError(matchError.message);
      setStatus('error');
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setStatus('idle');
    setError('');
    setProfileMissing(false);
    setResult(null);
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
          <span className={styles.eyebrow}>Hacktoberfest 2026</span>
          <h1>Your next contribution starts here.</h1>
          <p>Skip the endless issue search. Use your DevGlobe language profile or choose a repository language to discover up to three fresh, unassigned issues labeled for Hacktoberfest.</p>
          <p className={styles.requirement}>Already on DevGlobe? Enter your GitHub username. New or awaiting approval? Try a guest preview. No sign-in required.</p>
        </header>

        <div className={styles.tool} aria-busy={status === 'loading'}>
          <div className={styles.toolHeading}>
            <span>Find your contribution</span>
            <span>Public beta</span>
          </div>
          <form onSubmit={findMatches} className={styles.form}>
            <fieldset className={styles.modeChoice} disabled={status === 'loading'}>
              <legend>Match using</legend>
              <label><input type="radio" name="mode" value="profile" checked={mode === 'profile'} onChange={() => changeMode('profile')} /> My DevGlobe profile</label>
              <label><input type="radio" name="mode" value="guest" checked={mode === 'guest'} onChange={() => changeMode('guest')} /> Guest preferences</label>
            </fieldset>
            {mode === 'profile' ? (
              <>
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
                <p>Your username must have a public DevGlobe profile. We never request access to your private repositories.</p>
              </>
            ) : (
              <div className={styles.guestFields}>
                <label htmlFor="hacktoberfest-language">Repository language</label>
                <select id="hacktoberfest-language" value={language} onChange={event => setLanguage(event.target.value)} disabled={status === 'loading'}>
                  {CONTRIBUTION_LANGUAGES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <label htmlFor="hacktoberfest-task">What would you like to do?</label>
                <select id="hacktoberfest-task" value={taskPreference} onChange={event => setTaskPreference(event.target.value)} disabled={status === 'loading'}>
                  <option value="any">Code or content</option>
                  <option value="code">Code changes</option>
                  <option value="content">Content or documentation edits</option>
                </select>
                <p>Repository language is not always the task language. Task badges are inferred from issue text; check the instructions. Guest previews do not create a profile or save preferences.</p>
                <button type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Matching...' : 'Preview guest matches'}</button>
              </div>
            )}
          </form>

          {status === 'loading' && (
            <div className={styles.state} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              <div><strong>Checking contribution-ready issues</strong><span>This can take a few seconds.</span></div>
            </div>
          )}
          {status === 'error' && (
            <div className={`${styles.state} ${styles.error}`} role="alert">
              <div>
                <strong>{profileMissing ? 'Your profile is not on DevGlobe yet' : 'Matches could not be loaded'}</strong>
                <span>{profileMissing ? 'Use guest preferences to preview matches while your profile is awaiting approval, or submit your profile on the globe.' : error}</span>
                {profileMissing && <><button type="button" className={styles.guestRecovery} onClick={() => changeMode('guest')}>Try a guest preview</button><Link href="/">Add my profile on the globe</Link></>}
              </div>
            </div>
          )}

          {status === 'ready' && result && (
            <section className={styles.results} aria-labelledby="match-results-title">
              <div className={styles.profile}>
                {result.developer?.avatarUrl
                  ? <img src={result.developer.avatarUrl} alt="" />
                  : <span className={styles.avatarFallback} aria-hidden="true">{result.developer ? result.developer.login[0].toUpperCase() : 'G'}</span>}
                <div>
                  <span>{result.developer ? `Matches for @${result.developer.login}` : 'Guest preview · not saved'}</span>
                  <h2 id="match-results-title">Your Hacktoberfest shortlist</h2>
                </div>
                <div className={styles.languages} aria-label="Matched languages">
                  {(result.developer?.languages || result.preferences.languages).map(language => <span key={language}>{language}</span>)}
                </div>
              </div>
              <p className={styles.resultNote}>Repository language describes the project, not necessarily your task. Task badges are inferred from issue text; confirm the instructions and guide before starting.</p>

              {result.matches.length > 0 ? (
                <div className={styles.matchList}>
                  {result.matches.map((match, index) => (
                    <article className={styles.match} key={match.id}>
                      <span className={styles.matchNumber}>0{index + 1}</span>
                      <div className={styles.matchBody}>
                        <span className={styles.repository}>{match.repository}</span>
                        <h3>{match.title}</h3>
                        <div className={styles.reasons}>
                          <span>{match.task?.label || 'Task: check issue details'}</span>
                          {match.language && <span>Repository: {match.language}</span>}
                          {match.reasons.filter(reason => !reason.startsWith('Repository: ')).map(reason => <span key={reason}>{reason}</span>)}
                        </div>
                        {match.contributionGuideUrl && (
                          <a className={styles.guideLink} href={match.contributionGuideUrl} target="_blank" rel="noopener noreferrer"
                            onClick={() => track('next_action_selected', { action: 'open_hacktoberfest_guide', journey: 'hacktoberfest_matchmaker', campaign: HACKTOBERFEST_CAMPAIGN })}>
                            Read contribution guide
                          </a>
                        )}
                      </div>
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track('next_action_selected', { action: 'open_hacktoberfest_match', journey: 'hacktoberfest_matchmaker', campaign: HACKTOBERFEST_CAMPAIGN })}
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
                <a href={result.developer ? `/api/auth/github?login=${encodeURIComponent(result.developer.login)}` : '/api/auth/github'}>Sign in to personalize</a>
              </div>
            </section>
          )}
        </div>

        <dl className={styles.criteria}>
          <div><dt>Skills</dt><dd>Profile languages or guest preferences</dd></div>
          <div><dt>Issues</dt><dd>Open, unassigned, recently updated</dd></div>
          <div><dt>Guidance</dt><dd>A contribution guide is available</dd></div>
        </dl>
        <p className={styles.eventNote}>
          DevGlobe is an independent issue finder, not an official Hacktoberfest partner.
          Issue labels do not guarantee event eligibility or rewards. Read the project's contribution guide and{' '}
          <a href="https://hacktoberfest.com/" target="_blank" rel="noopener noreferrer">current Hacktoberfest guidance</a> before contributing.
        </p>
      </section>

      <footer className={styles.footer}>
        <span>Built for useful contributions, not contribution counts.</span>
        <Link href="/">Explore DevGlobe</Link>
      </footer>
    </main>
  );
}