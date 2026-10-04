'use client';

import { useEffect, useState } from 'react';
import { githubFeatureAuthUrl } from '../lib/public-activation.js';
import {
  SAVED_CONTRIBUTION_KEY, SAVED_CONTRIBUTION_EVENT, savedContribution, parseSavedContribution,
} from '../lib/contribution-passport.js';
import { track } from '../lib/analytics.js';
import ContributionReminder from './ContributionReminder.jsx';
import styles from './ContributionPassport.module.css';

export function notifySavedContributionChange() {
  window.dispatchEvent(new Event(SAVED_CONTRIBUTION_EVENT));
}

export function SaveContributionButton({ opportunity }) {
  const [replace, setReplace] = useState(false);
  const [message, setMessage] = useState('');
  function save() {
    try {
      const existing = parseSavedContribution(localStorage.getItem(SAVED_CONTRIBUTION_KEY));
      if (existing && existing.url !== opportunity.url && !replace) {
        setReplace(true);
        setMessage('You already have a saved contribution. Replace it only if you want to switch.');
        return;
      }
      if (!existing || existing.url !== opportunity.url) {
        localStorage.setItem(SAVED_CONTRIBUTION_KEY, JSON.stringify(savedContribution(opportunity)));
      }
      notifySavedContributionChange();
      setReplace(false);
      setMessage('Saved on this browser. Use the Continue card to return to it.');
      track('mission_saved', { journey: 'contribution_passport' });
    } catch (error) {
      setMessage(`Could not save: ${error.message}. Browser storage must be available.`);
    }
  }
  return (
    <div className={styles.save}>
      <button type="button" onClick={save}>{replace ? 'Replace saved contribution' : 'Save this contribution'}</button>
      {replace && <button type="button" onClick={() => { setReplace(false); setMessage(''); }}>Keep current contribution</button>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export default function SavedContribution({ signedIn = false, onChange }) {
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    function read() {
      try {
        setSaved(parseSavedContribution(localStorage.getItem(SAVED_CONTRIBUTION_KEY)));
        setError('');
      } catch (storageError) {
        setSaved(null);
        setError(storageError.message);
      }
    }
    read();
    window.addEventListener(SAVED_CONTRIBUTION_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(SAVED_CONTRIBUTION_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  function update(action) {
    try {
      if (action === 'remove') localStorage.removeItem(SAVED_CONTRIBUTION_KEY);
      else {
        const current = parseSavedContribution(localStorage.getItem(SAVED_CONTRIBUTION_KEY));
        if (!current || current.url !== saved?.url) throw new Error('Saved contribution changed. Refresh and try again.');
        localStorage.setItem(SAVED_CONTRIBUTION_KEY, JSON.stringify({ ...current, [action]: true }));
        track('mission_progress_updated', { journey: 'contribution_passport', action: action === 'guideRead' ? 'read_guide' : 'started' });
      }
      notifySavedContributionChange();
      onChange?.();
    } catch (storageError) {
      setError(`Could not update saved contribution: ${storageError.message}`);
    }
  }

  if (!saved && !error) return null;
  return (
    <section className={styles.card} aria-label="Saved contribution">
      {saved && <>
        <span className={styles.eyebrow}>Contribution passport · saved on this browser</span>
        <h2>Continue your contribution</h2>
        <h3>{saved.title}</h3>
        <p>{saved.repository}</p>
        <p>Saving does not reserve the issue. Check current instructions and availability before starting.</p>
        <div className={styles.actions}>
          <a href={saved.url} target="_blank" rel="noopener noreferrer" onClick={() => track('mission_resumed', { journey: 'contribution_passport' })}>Continue on GitHub</a>
          {saved.contributionGuideUrl && <a href={saved.contributionGuideUrl} target="_blank" rel="noopener noreferrer">Read contribution guide</a>}
        </div>
        {!signedIn && <>
          <fieldset className={styles.checklist}>
            <legend>Your progress · self-reported, no verified credit</legend>
            <label><input type="checkbox" checked={saved.guideRead} disabled={saved.guideRead} onChange={() => update('guideRead')} /> I read the contribution guide</label>
            <label><input type="checkbox" checked={saved.started} disabled={saved.started} onChange={() => update('started')} /> I started working</label>
          </fieldset>
          <ContributionReminder opportunity={saved} />
          <a href={githubFeatureAuthUrl('today')}>Sign in to track this mission across devices</a>
          <p>Your saved issue will be rechecked after sign-in. A claimed profile is still required for verified mission tracking.</p>
        </>}
      </>}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => update('remove')}>Remove saved contribution</button>
    </section>
  );
}
