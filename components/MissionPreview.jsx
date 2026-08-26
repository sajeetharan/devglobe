'use client';

import { useState } from 'react';
import { track } from '../lib/analytics.js';

export default function MissionPreview({ signedIn = false, onOpenActivity }) {
  const [visible, setVisible] = useState(true);
  const [login, setLogin] = useState('');
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function preview(event) {
    event.preventDefault();
    setStatus('loading');
    setError('');
    setResult(null);
    track('mission_preview_requested', { journey: 'mission_preview' });
    try {
      const response = await fetch('/api/mission-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to preview a mission');
      setResult(data);
      setStatus('ready');
      if (data.mission) track('mission_preview_shown', { journey: 'mission_preview' });
    } catch (previewError) {
      setError(previewError.message);
      setStatus('error');
    }
  }

  function handleSignIn() {
    track('mission_preview_signin_selected', { journey: 'mission_preview' });
  }

  if (!visible) return null;

  return (
    <section className="mission-preview" aria-labelledby="mission-preview-title">
      <button
        type="button"
        className="mission-preview__close"
        onClick={() => setVisible(false)}
        aria-label="Close mission preview"
        title="Close mission preview"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="mission-preview__intro">
        <span>NEW TO OPEN SOURCE?</span>
        <h2 id="mission-preview-title">Preview your mission</h2>
        <p>Enter your GitHub username. DevGlobe will choose one contribution-ready issue from your public language signals.</p>
      </div>
      <form className="mission-preview__form" onSubmit={preview}>
        <label htmlFor="mission-preview-login">GitHub username</label>
        <div>
          <span aria-hidden="true">@</span>
          <input
            id="mission-preview-login"
            name="login"
            value={login}
            onChange={event => setLogin(event.target.value)}
            placeholder="octocat"
            autoComplete="username"
            spellCheck="false"
            required
          />
          <button type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Matching...' : 'Preview mission'}</button>
        </div>
      </form>

      {status === 'error' && <p className="mission-preview__state" role="alert">{error}</p>}
      {status === 'ready' && !result?.mission && (
        <p className="mission-preview__state" role="status">No contribution-ready match is available for this profile right now.</p>
      )}
      {result?.mission && (
        <article className="mission-preview__result" aria-live="polite">
          <div className="mission-preview__identity">
            {result.profile.avatarUrl && <img src={result.profile.avatarUrl} alt="" />}
            <div><span>Matched for @{result.profile.login}</span><strong>{result.mission.type}</strong></div>
          </div>
          <div className="mission-preview__issue">
            <div>
              <span>{result.mission.opportunity.repository}</span>
              <strong>{result.mission.opportunity.title}</strong>
            </div>
            <span className="mission-preview__scope">Suggested scope · {result.mission.durationMinutes} min</span>
          </div>
          {result.mission.opportunity.reasons?.length > 0 && (
            <ul aria-label="Why this mission matched">
              {result.mission.opportunity.reasons.map(reason => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          <div className="mission-preview__actions">
            <p>Previewing does not reserve this issue. Actual effort depends on repository context and maintainer feedback.</p>
            <a href={result.mission.opportunity.url} target="_blank" rel="noopener noreferrer">Open issue</a>
            {signedIn ? (
              <button type="button" onClick={onOpenActivity}>Open Today’s Mission</button>
            ) : (
              <a className="mission-preview__primary" href="/api/auth/github" onClick={handleSignIn}>Sign in to accept missions</a>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
