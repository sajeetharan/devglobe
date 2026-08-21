'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics.js';

export default function SimilarDevelopersModal({ login, onClose, onResults, onSelect }) {
  const [status, setStatus] = useState('loading');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      setError('');
      try {
        const response = await fetch(`/api/similar-developers?login=${encodeURIComponent(login)}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          if (data.missingEmbedding) {
            setStatus('missing');
            return;
          }
          throw new Error(data.error || 'Unable to find similar developers');
        }
        setResults(data.results);
        setStatus('ready');
        onResults(data.results);
        track('recommendation_opened', { journey: 'profile_similarity', login });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
          setStatus('error');
        }
      }
    }
    load();
    const previousFocus = document.activeElement;
    modalRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [login]);

  return (
    <div className="similar-modal__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="similar-modal" role="dialog" aria-modal="true" aria-labelledby="similar-title" ref={modalRef} tabIndex="-1">
        <button type="button" className="similar-modal__close" onClick={onClose} aria-label="Close similar developers">&times;</button>
        <span className="similar-modal__eyebrow">PROFILE NEIGHBORS</span>
        <h2 id="similar-title">Developers similar to @{login}</h2>
        <p className="similar-modal__intro">Ranked from public profile, language, and repository signals.</p>

        {status === 'loading' && <p className="similar-modal__state">Mapping nearby developer profiles...</p>}
        {status === 'missing' && <p className="similar-modal__state">This profile has not been indexed for similarity yet.</p>}
        {status === 'error' && <p className="similar-modal__state similar-modal__state--error">{error}</p>}
        {status === 'ready' && results.length === 0 && <p className="similar-modal__state">No similar indexed profiles were found yet.</p>}

        {results.length > 0 && (
          <div className="similar-results" aria-live="polite">
            {results.map(developer => (
              <button type="button" className="similar-result" key={developer.login} onClick={() => onSelect(developer)}>
                <img src={developer.avatarUrl || '/devglobe.png'} alt="" />
                <span className="similar-result__identity">
                  <strong>{developer.name}</strong>
                  <small>@{developer.login}{developer.location ? ` · ${developer.location}` : ''}</small>
                  <span className="similar-result__reasons">{developer.reasons.join(' · ')}</span>
                </span>
                <span className="similar-result__band">{developer.similarity}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}