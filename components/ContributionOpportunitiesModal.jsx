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
  const [notice, setNotice] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
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
    setNotice('');
    try {
      const response = await fetch('/api/contribution-opportunities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save preferences');
      await load();
      setNotice('Matches updated');
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
  const hasPreferenceChanges = Boolean(preferences && result?.preferences
    && JSON.stringify(preferences) !== JSON.stringify(result.preferences));
  const visibleLanguages = preferences && result
    ? result.options.languages
      .filter(language => language.includes(languageQuery.trim().toLowerCase()))
      .sort((left, right) => Number(preferences.languages.includes(right)) - Number(preferences.languages.includes(left)) || left.localeCompare(right))
    : [];

  return (
    <div className="contribution-modal__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="contribution-modal" role="dialog" aria-modal="true" aria-labelledby="contribution-title" aria-describedby="contribution-intro" ref={modalRef} tabIndex="-1">
        <button type="button" className="contribution-modal__close" onClick={onClose} aria-label="Close contribution opportunities"><span aria-hidden="true" /></button>
        <header className="contribution-modal__header">
          <span className="contribution-modal__eyebrow">{isHacktoberfest ? 'HACKTOBERFEST 2026' : 'OPEN SOURCE, READY FOR HELP'}</span>
          <h2 id="contribution-title">{isHacktoberfest ? 'Open Source Passport' : 'Contribution opportunities'}</h2>
          <p className="contribution-modal__intro" id="contribution-intro">
            {isHacktoberfest
              ? 'Find contribution-ready Hacktoberfest issues matched to your skills and interests.'
              : 'Fresh, unassigned issues from public repositories with contribution guidance.'}
          </p>
        </header>

        {preferences && result && (
          <form className="contribution-preferences" onSubmit={savePreferences}>
            <div className="contribution-preferences__heading">
              <div><strong>Tune your matches</strong><span>Recommendations refresh only when you apply changes.</span></div>
              <span>{preferences.interests.length + preferences.languages.length} preferences selected</span>
            </div>
            <fieldset className="contribution-campaign">
              <legend><span>Campaign</span><small>Choose a focused event or browse everything</small></legend>
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
            <fieldset className="contribution-preferences__group">
              <legend className="contribution-preferences__section-heading">
                <strong>Interests</strong>
                <span>Optional</span>
              </legend>
              <div className="contribution-preferences__choices">
                {result.options.interests.map(interest => (
                  <label key={interest}>
                    <input type="checkbox" checked={preferences.interests.includes(interest)} onChange={() => toggleInterest(interest)} />
                    <span>{INTEREST_LABELS[interest]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="contribution-preferences__group contribution-preferences__languages">
              <legend className="contribution-preferences__languages-heading">
                <strong>Preferred languages</strong>
                <span aria-live="polite">{preferences.languages.length}/5 selected</span>
              </legend>
              <div className="contribution-preferences__language-tools">
                <input
                  type="search"
                  value={languageQuery}
                  onChange={event => setLanguageQuery(event.target.value)}
                  placeholder="Filter languages"
                  aria-label="Filter preferred languages"
                />
                {preferences.languages.length > 0 && (
                  <button type="button" onClick={() => setPreferences(current => ({ ...current, languages: [] }))}>Clear</button>
                )}
              </div>
              <div className="contribution-preferences__choices contribution-preferences__choices--languages">
                {visibleLanguages.map(language => (
                  <label key={language}>
                    <input type="checkbox" checked={preferences.languages.includes(language)} onChange={() => toggleLanguage(language)} disabled={!preferences.languages.includes(language) && preferences.languages.length >= 5} />
                    <span>{language}</span>
                  </label>
                ))}
                {visibleLanguages.length === 0 && <span className="contribution-preferences__no-languages">No matching languages</span>}
              </div>
            </fieldset>
            <div className="contribution-preferences__actions">
              <label className="contribution-preferences__field">
                <strong>Difficulty</strong>
                <select value={preferences.difficulty} onChange={event => setPreferences(current => ({ ...current, difficulty: event.target.value }))}>
                  {result.options.difficulties.map(difficulty => <option value={difficulty} key={difficulty}>{difficulty}</option>)}
                </select>
              </label>
              <div className="contribution-preferences__submit">
                <span aria-live="polite">{hasPreferenceChanges ? 'Changes not applied' : notice}</span>
                <button type="submit" className="btn contribution-preferences__save" disabled={status === 'saving' || !hasPreferenceChanges}>
                  {status === 'saving' ? 'Updating matches...' : 'Update matches'}
                </button>
              </div>
            </div>
          </form>
        )}

        {status === 'loading' && (
          <div className="contribution-modal__state contribution-modal__state--loading" role="status">
            <span className="contribution-modal__spinner" aria-hidden="true" />
            <div>
              <strong>{isHacktoberfest ? 'Building your passport' : 'Finding contribution-ready issues'}</strong>
              <span>{isHacktoberfest ? 'Checking fresh Hacktoberfest issues against your preferences.' : 'Checking fresh public issues against your preferences.'}</span>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="contribution-modal__state contribution-modal__state--error" role="alert">
            <div><strong>Could not load opportunities</strong><span>{error}</span></div>
            <button type="button" onClick={load}>Try again</button>
          </div>
        )}
        {error && status !== 'error' && <p className="contribution-modal__state contribution-modal__state--error">{error}</p>}
        {status === 'ready' && result?.unavailable && (
          <div className="contribution-modal__state" role="status">
            <div><strong>Recommendations are taking a break</strong><span>Your preferences are saved. Try refreshing in a moment.</span></div>
            <button type="button" onClick={load}>Refresh</button>
          </div>
        )}
        {status === 'ready' && !result?.unavailable && result?.opportunities.length === 0 && (
          <div className="contribution-modal__state contribution-modal__state--empty" role="status">
            <div>
              <strong>No matches yet</strong>
              <span>{isHacktoberfest ? 'Try broader preferences or browse all contribution opportunities.' : 'Try another language, interest, or difficulty.'}</span>
            </div>
            {isHacktoberfest && <button type="button" onClick={() => selectCampaign('all')}>Browse all</button>}
          </div>
        )}

        {result?.opportunities.length > 0 && (
          <div className="contribution-results" aria-live="polite">
            <div className="contribution-results__header">
              <div><strong>Your matches</strong><span>{result.opportunities.length} contribution-ready {result.opportunities.length === 1 ? 'issue' : 'issues'}</span></div>
              <span>Fresh and unassigned</span>
            </div>
            <div className="contribution-results__list">
              {result.opportunities.map(opportunity => (
                <article className="contribution-result" key={opportunity.id}>
                  <div className="contribution-result__content">
                    <div className="contribution-result__heading">
                      <span>{opportunity.repository}</span>
                      {opportunity.labels.includes('hacktoberfest') && <span className="contribution-result__campaign">Hacktoberfest 2026</span>}
                    </div>
                    <h3>{opportunity.title}</h3>
                    <div className="contribution-result__reasons">
                      {opportunity.reasons.map(reason => <span key={reason}>{reason}</span>)}
                    </div>
                  </div>
                  <div className="contribution-result__actions">
                    <a href={opportunity.url} target="_blank" rel="noopener noreferrer" onClick={() => track('next_action_selected', { action: 'open_contribution_issue', campaign: result.preferences.campaign, journey: 'contribution' })}>Open on GitHub</a>
                    <button type="button" onClick={() => dismiss(opportunity.id)} aria-label={`Dismiss ${opportunity.title}`} title="Dismiss recommendation">Dismiss</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}