'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import styles from './RepositoryMatchTool.module.css';

const REPOSITORY_PATTERN = /^(?:https?:\/\/github\.com\/)?[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d._-]{1,100}(?:\.git)?\/?$/i;

function normalizeRepository(value) {
  return value.trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git\/?$/i, '')
    .replace(/\/$/, '');
}

function reportUrl(repository) {
  const url = new URL('/repository-match', window.location.origin);
  url.searchParams.set('repository', repository);
  return url.toString();
}

function mcpPrompt(repository) {
  return `Use DevGlobe to match developers to the public GitHub repository ${repository}. Explain the public evidence for each match and do not treat relevance as a suitability judgment.`;
}

export default function RepositoryMatchTool() {
  const [repository, setRepository] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState('');

  async function buildReport(value) {
    const normalizedRepository = normalizeRepository(value);
    if (!REPOSITORY_PATTERN.test(normalizedRepository)) {
      setError('Enter a public GitHub repository as owner/repository or paste its GitHub URL.');
      setStatus('error');
      return;
    }

    setRepository(normalizedRepository);
    setStatus('loading');
    setError('');
    setNotice('');
    setResult(null);
    track('repository_match_submitted', { journey: 'repository_match_report' });

    try {
      const response = await fetch(`/api/repository-matches?repository=${encodeURIComponent(normalizedRepository)}&top=10`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to build this report.');
      setResult(data);
      setStatus('ready');
      window.history.replaceState({}, '', `/repository-match?repository=${encodeURIComponent(data.repository.fullName)}`);
      track('repository_match_generated', { journey: 'repository_match_report', outcome: data.count ? 'matches' : 'empty' });
    } catch (reportError) {
      setError(reportError.message);
      setStatus('error');
    }
  }

  useEffect(() => {
    const initialRepository = new URLSearchParams(window.location.search).get('repository') || '';
    track('repository_match_opened', { journey: 'repository_match_report' });
    if (initialRepository && REPOSITORY_PATTERN.test(initialRepository)) buildReport(initialRepository);
  }, []);

  async function shareReport() {
    const url = reportUrl(result.repository.fullName);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${result.repository.fullName} developer match report`,
          text: `See evidence-backed developer matches for ${result.repository.fullName} on DevGlobe.`,
          url,
        });
        setNotice('Report shared.');
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Report link copied.');
      }
      track('repository_match_shared', { journey: 'repository_match_report', channel: navigator.share ? 'native_share' : 'copy_link' });
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setNotice('Unable to share this report.');
    }
  }

  async function copyMcpPrompt() {
    try {
      await navigator.clipboard.writeText(mcpPrompt(result.repository.fullName));
      setNotice('MCP prompt copied.');
      track('repository_match_mcp_prompt_copied', { journey: 'repository_match_report' });
    } catch {
      setNotice('Unable to copy the MCP prompt.');
    }
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Repository match navigation">
        <Link href="/" className={styles.brand}>
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <Link href="/agents">Connect an agent</Link>
      </nav>

      <section className={styles.workspace}>
        <header className={styles.intro}>
          <span className={styles.eyebrow}>REPOSITORY MATCH REPORT</span>
          <h1>Find the people already close to the work.</h1>
          <p>Paste a public GitHub repository. DevGlobe ranks relevant developers using public contribution, language, topic, and availability signals.</p>
        </header>

        <div className={styles.tool} aria-busy={status === 'loading'}>
          <div className={styles.toolHeading}>
            <span>PUBLIC EVIDENCE REPORT</span>
            <span>No sign-in</span>
          </div>
          <form onSubmit={event => { event.preventDefault(); buildReport(repository); }} className={styles.form}>
            <label htmlFor="repository-reference">GitHub repository</label>
            <div className={styles.inputRow}>
              <span aria-hidden="true">github.com/</span>
              <input
                id="repository-reference"
                name="repository"
                value={repository}
                onChange={event => setRepository(event.target.value)}
                placeholder="owner/repository"
                autoComplete="url"
                spellCheck="false"
                required
                maxLength="160"
              />
              <button type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Building...' : 'Build report'}
              </button>
            </div>
            <p>Public GitHub and DevGlobe profile data only.</p>
          </form>

          {status === 'loading' && (
            <div className={styles.state} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              <div><strong>Reading public repository signals</strong><span>Matching contributors, languages, and topics.</span></div>
            </div>
          )}
          {status === 'error' && (
            <div className={`${styles.state} ${styles.error}`} role="alert">
              <div><strong>We could not build this report</strong><span>{error}</span></div>
            </div>
          )}

          {status === 'ready' && result && (
            <section className={styles.results} aria-labelledby="report-title">
              <div className={styles.repositorySummary}>
                <div>
                  <span>{result.repository.language || 'Public repository'} · {result.repository.stars.toLocaleString()} stars</span>
                  <h2 id="report-title">{result.repository.fullName}</h2>
                  {result.repository.description && <p>{result.repository.description}</p>}
                </div>
                <a href={result.repository.url} target="_blank" rel="noopener noreferrer">View repository</a>
              </div>

              <div className={styles.reportActions}>
                <button type="button" onClick={shareReport}>Share report</button>
                <button type="button" onClick={copyMcpPrompt}>Copy MCP prompt</button>
                <span role="status" aria-live="polite">{notice}</span>
              </div>

              {result.results.length > 0 ? (
                <div className={styles.matchList}>
                  {result.results.map((developer, index) => (
                    <article className={styles.match} key={developer.login}>
                      <span className={styles.matchNumber}>{String(index + 1).padStart(2, '0')}</span>
                      <div className={styles.matchBody}>
                        <span className={styles.developerMeta}>{developer.topLanguage || 'Multi-language'}{developer.location ? ` · ${developer.location}` : ''}</span>
                        <h3>{developer.name} <span>@{developer.login}</span></h3>
                        <div className={styles.reasons}>
                          {developer.whyMatched.map(reason => <span key={reason}>{reason}</span>)}
                        </div>
                        <div className={styles.evidence}>
                          {developer.publicEvidence.slice(0, 3).map(item => <span key={item.label}>{item.label}: {item.value.toLocaleString()}</span>)}
                          <span>{developer.dataFreshness.status === 'reported' ? 'Metrics reported' : 'Freshness unknown'}</span>
                        </div>
                      </div>
                      <Link
                        href={`/developer/${encodeURIComponent(developer.login)}`}
                        onClick={() => track('repository_match_profile_opened', { journey: 'repository_match_report' })}
                      >
                        View profile
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.state} role="status">
                  <div><strong>No evidence-backed matches yet</strong><span>Try another repository or share the report so relevant developers can join DevGlobe.</span></div>
                </div>
              )}

              <p className={styles.disclaimer}>Matches explain public relevance signals. They are not employment or suitability judgments.</p>
            </section>
          )}
        </div>

        <dl className={styles.criteria}>
          <div><dt>01</dt><dd>Existing contribution evidence</dd></div>
          <div><dt>02</dt><dd>Language and topic overlap</dd></div>
          <div><dt>03</dt><dd>Shareable without an account</dd></div>
        </dl>
      </section>

      <footer className={styles.footer}>
        <span>Public evidence, explained.</span>
        <Link href="/">Explore DevGlobe</Link>
      </footer>
    </main>
  );
}