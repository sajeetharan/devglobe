import React, { useState, useEffect, useRef } from 'react';
import { track } from '../lib/analytics.js';
import styles from './AddMeModal.module.css';

const PENDING_CLAIM_KEY = 'devglobe-pending-claim';

export default function AddMeModal({ onClose, user, onVerify, verificationUsername = '' }) {
  const [username, setUsername] = useState(verificationUsername);
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [emailConsent, setEmailConsent] = useState(false);
  const [status, setStatus] = useState(verificationUsername ? 'success' : 'idle'); // idle | submitting | success | verifying | error
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const normalizedUsername = username.trim().replace(/^@/, '');
  const identityMatches = user?.login?.toLowerCase() === normalizedUsername.toLowerCase();

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'submitting') return;

    const clean = username.trim().replace(/^@/, '');
    if (!clean) {
      setStatus('error');
      setError('Please enter your GitHub username.');
      return;
    }
    if (!email.trim() || !emailConsent) {
      setStatus('error');
      setError('Enter your email and agree to receive nomination updates.');
      return;
    }

    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/nominate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: clean,
          location: location.trim(),
          email: email.trim(),
          emailConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setUsername(data.username || clean);
      setStatus('success');
      track('nomination_submitted');
    } catch (err) {
      setStatus('error');
      setError('Network error. Please try again.');
    }
  };

  const handleVerify = async () => {
    try {
      localStorage.setItem(PENDING_CLAIM_KEY, normalizedUsername);
    } catch { /* Continue with the current session when storage is unavailable. */ }

    if (!user) {
      track('github_auth_started', { source: 'nomination_claim' });
      window.location.assign(`/api/auth/github?login=${encodeURIComponent(normalizedUsername)}`);
      return;
    }

    if (!identityMatches) return;

    setStatus('verifying');
    setError('');
    track('claim_clicked', { source: 'nomination' });
    const result = await onVerify();
    if (!result?.ok) {
      setStatus('success');
      setError('We could not verify your profile. Please try again.');
      return;
    }
    try { localStorage.removeItem(PENDING_CLAIM_KEY); } catch { /* Ignore storage cleanup failures. */ }
    onClose();
  };

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add me to DevGlobe">
        <button className={styles['modal__close']} onClick={onClose} aria-label="Close" type="button">✕</button>

        {status === 'success' ? (
          <div className={styles['modal__success']}>
            <div className={styles['modal__success-icon']} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className={styles['modal__title']}>Nomination received</h2>
            {user && !identityMatches ? (
              <div className={styles['modal__identity-warning']} role="alert">
                <strong>Sign in as @{normalizedUsername}</strong>
                <span>You are currently signed in as @{user.login}. We will keep this nomination pending rather than verify the wrong account.</span>
              </div>
            ) : (
              <p className={styles['modal__message']}>
                Verify ownership of <strong>@{normalizedUsername}</strong> with GitHub to publish your profile now. Otherwise, it will remain in the review queue.
              </p>
            )}
            {error && <div className={styles['modal__error']}>{error}</div>}
            {(!user || identityMatches) && (
              <button className={`btn btn--primary ${styles['modal__verify']}`} onClick={handleVerify} type="button">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8z" />
                </svg>
                Verify with GitHub
              </button>
            )}
            <button className={styles['modal__later']} onClick={onClose} type="button">
              {user && !identityMatches ? 'Close' : 'I will verify later'}
            </button>
          </div>
        ) : status === 'verifying' ? (
          <div className={styles['modal__success']} aria-live="polite">
            <div className={styles['modal__spinner']} aria-hidden="true" />
            <h2 className={styles['modal__title']}>Publishing your profile</h2>
            <p className={styles['modal__message']}>Confirming your GitHub identity and adding you to the globe.</p>
          </div>
        ) : (
          <>
            <h2 className={styles['modal__title']}>Add me to DevGlobe</h2>
            <p className={styles['modal__subtitle']}>
              Submit your profile, then verify with GitHub to publish instantly. Unverified nominations stay in the review queue.
            </p>
            <form className={styles['modal__form']} onSubmit={handleSubmit}>
              <label className={styles['modal__label']} htmlFor="nominate-username">
                GitHub username <span className={styles['modal__required']}>*</span>
              </label>
              <input
                id="nominate-username"
                ref={inputRef}
                className={styles['modal__input']}
                type="text"
                placeholder="octocat"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />

              <label className={styles['modal__label']} htmlFor="nominate-location">
                Location <span className={styles['modal__optional']}>(optional)</span>
              </label>
              <input
                id="nominate-location"
                className={styles['modal__input']}
                type="text"
                placeholder="San Francisco, CA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                autoComplete="off"
              />

              <label className={styles['modal__label']} htmlFor="nominate-email">
                Email <span className={styles['modal__required']}>*</span>
              </label>
              <input
                id="nominate-email"
                className={styles['modal__input']}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <label className={styles['modal__consent']}>
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={(e) => setEmailConsent(e.target.checked)}
                  required
                />
                <span>Email me about this nomination and essential DevGlobe profile updates.</span>
              </label>

              {status === 'error' && <div className={styles['modal__error']}>{error}</div>}

              <button
                className={`btn btn--primary ${styles['modal__submit']}`}
                type="submit"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? 'Submitting...' : 'Submit nomination'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
