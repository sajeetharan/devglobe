'use client';

import { useEffect, useState } from 'react';
import { getIntroductionLifecycle } from '../lib/agent-network.js';

const STATUS_FILTERS = ['all', 'pending', 'accepted', 'declined', 'expired'];

function getAuditTrail(request, status) {
  if (request.auditTrail?.length) return request.auditTrail;
  const events = [{ status: 'pending', at: request.createdAt, actor: 'requester-agent' }];
  if (status !== 'pending') {
    events.push({
      status,
      at: status === 'expired' ? request.expiresAt : request.respondedAt,
      actor: status === 'expired' ? 'system' : 'developer',
    });
  }
  return events.filter(event => event.at);
}

export default function IntroductionInboxModal({ onClose, onEditPreferences }) {
  const [requests, setRequests] = useState([]);
  const [profile, setProfile] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/introductions', { cache: 'no-store' }),
      fetch('/api/ai-profile', { cache: 'no-store' }),
    ])
      .then(async ([requestsResponse, profileResponse]) => {
        const [requestsData, profileData] = await Promise.all([requestsResponse.json(), profileResponse.json()]);
        if (!requestsResponse.ok) throw new Error(requestsData.error || 'Failed to load agent requests');
        if (!profileResponse.ok) throw new Error(profileData.error || 'Failed to load collaboration preferences');
        if (!cancelled) {
          setRequests(requestsData.requests);
          setProfile(profileData.profile);
        }
      })
      .catch(loadError => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const decide = async (id, status) => {
    setUpdatingId(id);
    setError('');
    try {
      const response = await fetch('/api/introductions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update request');
      setRequests(current => current.map(item => item.id === id
        ? { ...item, ...data.request }
        : item));
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const displayStatus = request => request.status === 'pending' && request.expiresAt <= new Date().toISOString()
    ? 'expired'
    : request.status;
  const counts = requests.reduce((result, request) => {
    result[displayStatus(request)] += 1;
    return result;
  }, { pending: 0, accepted: 0, declined: 0, expired: 0 });
  const visibleRequests = filter === 'all' ? requests : requests.filter(request => displayStatus(request) === filter);
  const acceptingRequests = profile?.acceptsAgentRequests === true;
  const preferences = profile?.opportunityPreferences;

  const pauseRequests = async () => {
    if (!profile || !window.confirm('Pause new agent requests? Existing requests will stay in your inbox.')) return;
    setPausing(true);
    setError('');
    try {
      const response = await fetch('/api/ai-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: {
          ...profile,
          acceptsAgentRequests: false,
          contactPolicy: 'nobody',
          opportunityPreferences: { enabled: false },
        } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to pause requests');
      setProfile(data.profile);
    } catch (pauseError) {
      setError(pauseError.message);
    } finally {
      setPausing(false);
    }
  };

  return (
    <div className="introduction-inbox__backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="introduction-inbox" role="dialog" aria-modal="true" aria-labelledby="introduction-inbox-title">
        <button type="button" className="introduction-inbox__close" onClick={onClose} aria-label="Close agent requests">&times;</button>
        <span className="introduction-inbox__eyebrow">CONSENT INBOX</span>
        <h2 id="introduction-inbox-title">Agent requests</h2>
        <p className="introduction-inbox__intro">Review verified-agent introduction requests. Acceptance shares only your public GitHub profile.</p>

        {!loading && profile && (
          <div className={`introduction-inbox__availability introduction-inbox__availability--${acceptingRequests ? 'active' : 'paused'}`}>
            <div>
              <span>Availability</span>
              <strong>{acceptingRequests ? 'Accepting verified-agent requests' : 'New requests paused'}</strong>
              <small>{preferences?.enabled
                ? `${preferences.types?.join(', ')} · ${preferences.workModes?.join(', ')}`
                : 'Collaboration channels and constraints are managed in AI preferences.'}</small>
            </div>
            <div className="introduction-inbox__availability-actions">
              <button type="button" onClick={onEditPreferences}>Edit preferences</button>
              {acceptingRequests && <button type="button" className="introduction-inbox__pause" disabled={pausing} onClick={pauseRequests}>{pausing ? 'Pausing...' : 'Pause requests'}</button>}
            </div>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="introduction-inbox__filters" role="group" aria-label="Filter requests by status">
            {STATUS_FILTERS.map(status => (
              <button
                type="button"
                className={filter === status ? 'introduction-inbox__filter--active' : ''}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
                key={status}
              >
                {status}<span>{status === 'all' ? requests.length : counts[status]}</span>
              </button>
            ))}
          </div>
        )}

        {loading && <p className="introduction-inbox__empty">Loading requests...</p>}
        {!loading && requests.length === 0 && !error && <p className="introduction-inbox__empty">No agent requests yet.</p>}
        {!loading && requests.length > 0 && visibleRequests.length === 0 && <p className="introduction-inbox__empty">No {filter} requests. Other requests remain available in their status filters.</p>}
        {error && <p className="introduction-inbox__error" role="alert">{error}</p>}

        <div className="introduction-inbox__list">
          {visibleRequests.map(request => {
            const status = displayStatus(request);
            const auditTrail = getAuditTrail(request, status);
            return (
              <article className="introduction-request" key={request.id}>
                <header>
                  <div>
                    <strong>{request.requesterAgent.name}</strong>
                    <span>{request.requesterAgent.owner}</span>
                  </div>
                  <small className={`introduction-request__status introduction-request__status--${status}`}>{status}</small>
                </header>
                <ol className="introduction-request__timeline" aria-label={`Request status: ${status}`}>
                  {getIntroductionLifecycle(request.status, request.expiresAt).map(stage => (
                    <li className={`introduction-request__stage introduction-request__stage--${stage.state}`} key={stage.id}>
                      <i aria-hidden="true" />
                      <span>{stage.label}</span>
                    </li>
                  ))}
                </ol>
                <dl>
                  <div><dt>Project</dt><dd>{request.project}</dd></div>
                  <div><dt>Reason</dt><dd>{request.reason}</dd></div>
                </dl>
                {status !== 'pending' && (
                  <p className="introduction-request__outcome">
                    {status === 'accepted' && 'Accepted. The requester can now see your public GitHub profile.'}
                    {status === 'declined' && 'Declined. The requester was not given private contact details.'}
                    {status === 'expired' && 'Expired without a response. The requester was not given contact details.'}
                  </p>
                )}
                {auditTrail.length > 0 && (
                  <details className="introduction-request__audit">
                    <summary>Request history</summary>
                    <ol>
                      {auditTrail.map((event, index) => (
                        <li key={`${event.status}-${event.at}-${index}`}>
                          <span>{event.status}</span>
                          <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {status === 'pending' && (
                  <div className="introduction-request__actions">
                    <button type="button" disabled={updatingId === request.id} onClick={() => decide(request.id, 'declined')}>Decline</button>
                    <button type="button" className="introduction-request__accept" disabled={updatingId === request.id} onClick={() => decide(request.id, 'accepted')}>Accept</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
