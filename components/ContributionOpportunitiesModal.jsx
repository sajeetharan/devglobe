'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics.js';

const INTEREST_LABELS = {
  accessibility: 'Accessibility',
  'bug-fixes': 'Bug fixes',
  'developer-tooling': 'Developer tooling',
  documentation: 'Documentation',
  features: 'Features',
  testing: 'Testing',
};
const CAMPAIGN_LABELS = {
  all: 'All opportunities',
  'hacktoberfest-2026': 'Hacktoberfest 2026',
};

export default function ContributionOpportunitiesModal({ onClose }) {
  const [result, setResult] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const modalRef = useRef(null);

  async function load() {
    setStatus('loading');
    setError('');
    try {
      const response = await fetch('/api/contribution-opportunities', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok && response.status !== 429) throw new Error(data.error || 'Unable to load recommendations');
      setResult(data);
      setPreferences(data.preferences);
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }

  useEffect(() => {
    track('recommendation_opened', { journey: 'contribution' });
    load();
    const previouslyFocused = document.activeElement;
    const modal = modalRef.current;
    modal?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !modal) return;
      const focusable = [...modal.querySelectorAll('button, a[href], input, select')].filter(element => !element.disabled);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  function toggleInterest(interest) {
    setPreferences(current => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter(item => item !== interest)
        : [...current.interests, interest],
    }));
  }

  function toggleLanguage(language) {
    setPreferences(current => ({
      ...current,
      languages: current.languages.includes(language)
        ? current.languages.filter(item => item !== language)
        : [...current.languages, language].slice(0, 5),
    }));
  }

  function selectCampaign(campaign) {
    setPreferences(current => ({ ...current, campaign }));
    track('contribution_campaign_selected', { campaign, journey: 'contribution' });
  }

  async function savePreferences(event) {
    event.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const response = await fetch('/api/contribution-opportunities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save preferences');
      await load();
    } catch (saveError) {
      setError(saveError.message);
      setStatus('ready');
    }
  }

  async function dismiss(issueId) {
    setResult(current => ({ ...current, opportunities: current.opportunities.filter(item => item.id !== issueId) }));
    try {
      const response = await fetch('/api/contribution-opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId }),
      });
      if (!response.ok) throw new Error('Unable to dismiss recommendation');
    } catch (dismissError) {
      await load();
      setError(dismissError.message);
    }
  }

  const isHacktoberfest = preferences?.campaign === 'hacktoberfest-2026';

  return (
    <div className="contribution-modal__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="contribution-modal" role="dialog" aria-modal="true" aria-labelledby="contribution-title" ref={modalRef} tabIndex="-1">
        <button type="button" className="contribution-modal__close" onClick={onClose} aria-label="Close contribution opportunities">&times;</button>
        <span className="contribution-modal__eyebrow">{isHacktoberfest ? 'HACKTOBERFEST 2026' : 'OPEN SOURCE, READY FOR HELP'}</span>
        <h2 id="contribution-title">{isHacktoberfest ? 'Open Source Passport' : 'Contribution opportunities'}</h2>
        <p className="contribution-modal__intro">
          {isHacktoberfest
            ? 'Find fresh, contribution-ready Hacktoberfest issues matched to your skills. Choose meaningful work and follow each project’s contribution guide.'
            : 'Fresh, unassigned issues from public repositories with contribution guidance.'}
        </p>

        {preferences && result && (
          <form className="contribution-preferences" onSubmit={savePreferences}>
            <fieldset className="contribution-campaign">
              <legend>Campaign</legend>
              <div className="contribution-campaign__options">
                {result.options.campaigns.map(campaign => (
                  <label key={campaign}>
                    <input
                      type="radio"
                      name="contribution-campaign"
                      value={campaign}
                      checked={preferences.campaign === campaign}
                      onChange={() => selectCampaign(campaign)}
                    />
                    <span>{CAMPAIGN_LABELS[campaign]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="contribution-preferences__group">
              <strong>Interests</strong>
              <div className="contribution-preferences__choices">
                {result.options.interests.map(interest => (
                  <label key={interest}>
                    <input type="checkbox" checked={preferences.interests.includes(interest)} onChange={() => toggleInterest(interest)} />
                    <span>{INTEREST_LABELS[interest]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="contribution-preferences__group contribution-preferences__languages">
              <strong>Preferred languages</strong>
              <div className="contribution-preferences__choices contribution-preferences__choices--languages">
                {result.options.languages.map(language => (
                  <label key={language}>
                    <input type="checkbox" checked={preferences.languages.includes(language)} onChange={() => toggleLanguage(language)} disabled={!preferences.languages.includes(language) && preferences.languages.length >= 5} />
                    <span>{language}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="contribution-preferences__field">
              <strong>Difficulty</strong>
              <select value={preferences.difficulty} onChange={event => setPreferences(current => ({ ...current, difficulty: event.target.value }))}>
                {result.options.difficulties.map(difficulty => <option value={difficulty} key={difficulty}>{difficulty}</option>)}
              </select>
            </label>
            <button type="submit" className="btn contribution-preferences__save" disabled={status === 'saving'}>{status === 'saving' ? 'Updating...' : 'Update matches'}</button>
          </form>
        )}

        {status === 'loading' && <p className="contribution-modal__state">{isHacktoberfest ? 'Finding Hacktoberfest issues for your passport...' : 'Finding contribution-ready issues...'}</p>}
        {status === 'error' && <p className="contribution-modal__state contribution-modal__state--error">{error}</p>}
        {error && status !== 'error' && <p className="contribution-modal__state contribution-modal__state--error">{error}</p>}
        {status === 'ready' && result?.unavailable && <p className="contribution-modal__state">Recommendations are temporarily unavailable. Your preferences are still saved.</p>}
        {status === 'ready' && !result?.unavailable && result?.opportunities.length === 0 && (
          <p className="contribution-modal__state">
            {isHacktoberfest
              ? 'No Hacktoberfest issues match these preferences yet. Try another language or difficulty, or check all opportunities.'
              : 'No contribution-ready issues match these preferences yet. Try another language or difficulty.'}
          </p>
        )}

        {result?.opportunities.length > 0 && (
          <div className="contribution-results" aria-live="polite">
            {result.opportunities.map(opportunity => (
              <article className="contribution-result" key={opportunity.id}>
                <div className="contribution-result__heading">
                  <span>{opportunity.repository}</span>
                  <button type="button" onClick={() => dismiss(opportunity.id)} aria-label={`Dismiss ${opportunity.title}`} title="Dismiss recommendation">&times;</button>
                </div>
                {opportunity.labels.includes('hacktoberfest') && <span className="contribution-result__campaign">Hacktoberfest 2026</span>}
                <h3>{opportunity.title}</h3>
                <div className="contribution-result__reasons">
                  {opportunity.reasons.map(reason => <span key={reason}>{reason}</span>)}
                </div>
                <a href={opportunity.url} target="_blank" rel="noopener noreferrer" onClick={() => track('next_action_selected', { action: 'open_contribution_issue', campaign: result.preferences.campaign, journey: 'contribution' })}>Open issue on GitHub</a>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}