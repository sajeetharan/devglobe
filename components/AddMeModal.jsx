import React, { useState, useEffect, useRef } from 'react';
import styles from './AddMeModal.module.css';

const SUCCESS_MESSAGE = "Your profile is pending review. We'll email you when it is approved and visible on the globe, usually within a week.";

export default function AddMeModal({ onClose }) {
  const [username, setUsername] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [emailConsent, setEmailConsent] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState('');
  const inputRef = useRef(null);

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
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError('Network error. Please try again.');
    }
  };

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add me to DevGlobe">
        <button className={styles['modal__close']} onClick={onClose} aria-label="Close" type="button">✕</button>

        {status === 'success' ? (
          <div className={styles['modal__success']}>
            <div className={styles['modal__success-icon']}>🎉</div>
            <h2 className={styles['modal__title']}>Nomination received</h2>
            <p className={styles['modal__message']}>{SUCCESS_MESSAGE}</p>
            <button className="btn btn--primary" onClick={onClose} type="button">Done</button>
          </div>
        ) : (
          <>
            <h2 className={styles['modal__title']}>Add me to DevGlobe</h2>
            <p className={styles['modal__subtitle']}>
              Submit your GitHub username to be featured on the globe. We'll review and add you within a week.
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
