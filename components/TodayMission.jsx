'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics.js';

export default function TodayMission({ active, onOpenContributions }) {
  const [mission, setMission] = useState(null);
  const [completedMissions, setCompletedMissions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [claimLogin, setClaimLogin] = useState('');
  const [updating, setUpdating] = useState(false);
  const retryTimerRef = useRef(null);
  const requestVersionRef = useRef(0);

  async function load() {
    const requestVersion = ++requestVersionRef.current;
    clearTimeout(retryTimerRef.current);
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/daily-mission', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (requestVersion !== requestVersionRef.current) return;
      if (response.status === 401) {
        setStatus('signed-out');
        setMessage(data.error);
        return;
      }
      if (response.status === 403) {
        setStatus('claim-required');
        setMessage(data.error);
        setClaimLogin(data.login || '');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Unable to load today’s mission');
      setMission(data.mission);
      setCompletedMissions(Array.isArray(data.completedMissions) ? data.completedMissions : []);
      setStatus(data.unavailable ? 'unavailable' : data.mission ? 'ready' : 'empty');
      if (data.unavailable) {
        track('mission_unavailable', { journey: 'daily_mission' });
        if (data.retryAfterSeconds) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(load, data.retryAfterSeconds * 1000);
        }
      }
      else if (data.mission) track('mission_viewed', { journey: 'daily_mission' });
      else track('mission_exhausted', { journey: 'daily_mission' });
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) return;
      setStatus('error');
      setMessage(error.message);
    }
  }

  useEffect(() => {
    if (!active) return undefined;
    load();
    let dayTimer;
    function scheduleNextDay() {
      const now = new Date();
      const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      dayTimer = setTimeout(async () => {
        await load();
        scheduleNextDay();
      }, Math.max(1000, nextUtcDay - now.getTime() + 1000));
    }
    scheduleNextDay();
    return () => {
      clearTimeout(dayTimer);
      clearTimeout(retryTimerRef.current);
    };
  }, [active]);

  async function update(action) {
    const requestVersion = ++requestVersionRef.current;
    clearTimeout(retryTimerRef.current);
    setUpdating(true);
    setMessage('');
    try {
      const response = await fetch('/api/daily-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, missionId: mission.id }),
      });
      const data = await response.json();
      if (requestVersion !== requestVersionRef.current) return;
      if (response.status === 422) {
        setMessage(data.error || 'GitHub does not show a completed contribution for this mission yet.');
        return;
      }
      if (response.status === 409) {
        await load();
        throw new Error(data.error);
      }
      if (!response.ok) throw new Error(data.error || 'Unable to update today’s mission');
      setMission(data.mission);
      setCompletedMissions(Array.isArray(data.completedMissions) ? data.completedMissions : []);
      setStatus(data.mission ? 'ready' : 'empty');
      track(`mission_${action === 'complete' ? 'completed' : `${action}ed`}`, { journey: 'daily_mission' });
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) return;
      setMessage(error.message);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="today-mission" aria-labelledby="today-mission-title" aria-busy={status === 'loading' || updating}>
      <div className="today-mission__heading">
        <div>
          <span>FOLLOW THE SUN</span>
          <h2 id="today-mission-title">Today’s Mission</h2>
        </div>
        <div className="today-mission__heading-actions">
          <strong>{mission?.durationMinutes || 15} min</strong>
          {onOpenContributions && !['signed-out', 'claim-required'].includes(status) && <button type="button" onClick={onOpenContributions}>Tune mission</button>}
        </div>
      </div>

      {status === 'loading' && <p className="today-mission__state" role="status">Matching one small mission to your skills...</p>}
      {status === 'signed-out' && (
        <div className="today-mission__state">
          <span>{message}</span>
          <a href="/api/auth/github">Sign in with GitHub</a>
        </div>
      )}
      {status === 'claim-required' && (
        <div className="today-mission__state">
          <span>{message}</span>
          <a href={claimLogin ? `/developer/${encodeURIComponent(claimLogin)}` : '/'}>Claim your profile</a>
        </div>
      )}
      {['unavailable', 'error'].includes(status) && (
        <div className="today-mission__state" role={status === 'error' ? 'alert' : 'status'}>
          <span>{message || 'Mission matching is taking a break.'}</span>
          <button type="button" onClick={load}>Try again</button>
        </div>
      )}
      {status === 'empty' && (
        <p className="today-mission__state">You’ve explored today’s available matches. A fresh mission arrives tomorrow.</p>
      )}

      {status === 'ready' && mission && (
        <div className="today-mission__content">
          <div className="today-mission__meta">
            <span>{mission.type}</span>
            <span className={`today-mission__status today-mission__status--${mission.status}`} aria-live="polite">{updating ? 'checking' : mission.status}</span>
          </div>
          <h3>{mission.opportunity.title}</h3>
          <p>{mission.opportunity.repository}{mission.opportunity.language ? ` · ${mission.opportunity.language}` : ''}</p>
          {mission.opportunity.reasons?.length > 0 && (
            <ul className="today-mission__reasons" aria-label="Why this mission matches">
              {mission.opportunity.reasons.map(reason => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          <div className="today-mission__actions">
            {mission.status === 'offered' && <button type="button" className="today-mission__primary" onClick={() => update('accept')} disabled={updating}>Accept</button>}
            {mission.status === 'accepted' && <button type="button" className="today-mission__primary" onClick={() => update('complete')} disabled={updating}>Verify completion</button>}
            {['offered', 'accepted'].includes(mission.status) && <button type="button" onClick={() => update('pass')} disabled={updating}>Pass</button>}
            <a href={mission.opportunity.url} target="_blank" rel="noopener noreferrer" onClick={() => track('next_action_selected', { action: 'open_daily_mission', journey: 'daily_mission' })}>Open issue</a>
            {mission.status === 'completed' && mission.completionEvidence?.url && <a href={mission.completionEvidence.url} target="_blank" rel="noopener noreferrer">View merged PR</a>}
          </div>
          {message && <p className="today-mission__error" role="alert">{message}</p>}
        </div>
      )}

      {completedMissions.length > 0 && (
        <section className="today-mission__history" aria-labelledby="completed-missions-title">
          <div className="today-mission__history-heading">
            <h3 id="completed-missions-title">Completed missions</h3>
            <span>{completedMissions.length}</span>
          </div>
          <ul>
            {completedMissions.map(completed => (
              <li key={completed.id}>
                <div>
                  <a href={completed.opportunity?.url} target="_blank" rel="noopener noreferrer">
                    {completed.opportunity?.title || 'Completed issue'}
                  </a>
                  <span>{completed.opportunity?.repository || 'GitHub'} · {new Date(completed.completedAt).toLocaleDateString()}</span>
                </div>
                {completed.completionEvidence?.url && (
                  <a href={completed.completionEvidence.url} target="_blank" rel="noopener noreferrer">View PR</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}