'use client';

import { useState } from 'react';
import ContributionReminder from './ContributionReminder.jsx';
import styles from './ContributionPassport.module.css';

const BLOCKER_LABELS = {
  setup: 'Setup trouble', instructions: 'Unclear instructions',
  issue_taken: 'Issue already taken', too_large: 'Task is too large',
};

export default function MissionProgress({ mission, updating, onUpdate, onBrowse }) {
  const [showBlockers, setShowBlockers] = useState(false);
  const [blocker, setBlocker] = useState('setup');
  const progress = mission.progress || {};
  const submitted = progress.submittedEvidence;
  return (
    <section className={styles.card} aria-label="Mission progress">
      <h3>Your contribution passport</h3>
      <ol className={styles.stages}>
        <li>Read guide — {progress.guideReadAt ? 'self-reported done' : 'next step'}</li>
        <li>Start working — {progress.startedAt ? 'self-reported started' : 'not recorded'}</li>
        <li>PR submitted — {submitted ? 'verified on GitHub' : 'not verified'}</li>
        <li>{mission.status === 'completed' ? 'Completed — merged PR verified' : submitted?.type === 'merged_pull_request' ? 'Merged — verify completion to record your achievement' : submitted?.type === 'closed_pull_request' ? 'PR closed without merge — review feedback or choose another task' : submitted ? 'Awaiting review — maintainer timing is not your failure' : 'Completion — requires a verified merged PR'}</li>
      </ol>
      {mission.opportunity.contributionGuideUrl && <a href={mission.opportunity.contributionGuideUrl} target="_blank" rel="noopener noreferrer">Read contribution guide</a>}
      {mission.status === 'accepted' && <>
        <div className={styles.actions}>
          {!progress.guideReadAt && <button type="button" disabled={updating} onClick={() => onUpdate('read_guide')}>I read the guide</button>}
          {(!progress.startedAt || progress.blocker) && <button type="button" disabled={updating} onClick={() => onUpdate('started')}>{progress.blocker ? 'I’m continuing' : 'I started working'}</button>}
          <button type="button" disabled={updating} onClick={() => onUpdate('verify_progress')}>{submitted ? 'Refresh PR status' : 'Check for my submitted PR'}</button>
          <button type="button" disabled={updating} onClick={() => setShowBlockers(current => !current)}>I’m stuck</button>
        </div>
        <p>Guide and work steps are self-reported, not verified credit. To verify submission, link this issue from your non-draft PR. Your PR must be authored after mission acceptance.</p>
        {(showBlockers || progress.blocker) && <div>
          <label>What is blocking you?
            <select value={blocker} onChange={event => setBlocker(event.target.value)} disabled={updating}>
              {Object.entries(BLOCKER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" disabled={updating} onClick={() => onUpdate('blocked', blocker)}>Save blocker</button>
          {progress.blocker && <p role="status">Recorded: {BLOCKER_LABELS[progress.blocker]}. {['setup', 'instructions'].includes(progress.blocker) ? 'Review the contribution guide and ask a specific question in the issue.' : 'You can choose another issue without losing completed contributions.'}</p>}
          {onBrowse && <button type="button" onClick={onBrowse}>Browse alternatives</button>}
        </div>}
        {(!submitted || submitted.type === 'closed_pull_request') && <ContributionReminder opportunity={mission.opportunity} />}
      </>}
      {submitted && <>
        <a href={submitted.url} target="_blank" rel="noopener noreferrer">View verified PR</a>
        <p>Status last verified {new Date(submitted.verifiedAt).toLocaleString()}. Refresh to check for changes.</p>
      </>}
      <p>DevGlobe does not reserve GitHub issues or award event credit.</p>
    </section>
  );
}
