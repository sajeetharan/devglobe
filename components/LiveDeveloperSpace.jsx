'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../lib/analytics.js';
import { getLanguageColor } from '../lib/language-colors.js';
import { useLivePresence } from './useLivePresence.js';
import styles from './LiveDeveloperSpace.module.css';

const LiveDeveloperGlobe = dynamic(() => import('./LiveDeveloperGlobe.jsx'), { ssr: false });
const STATUS_LABELS = Object.freeze({
  building: 'Building',
  debugging: 'Debugging',
  reviewing: 'Reviewing',
  learning: 'Learning',
  'open-source': 'Contributing to open source',
  pairing: 'Available to pair',
});

function uniqueValues(developers, field) {
  return [...new Set(developers.map(developer => developer[field]).filter(Boolean))].sort();
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  return seconds < 45 ? 'now' : `${Math.floor(seconds / 60)}m`;
}

function buildFocusConnections(developers) {
  const activeFocus = developers.filter(developer => (
    developer.presenceState === 'live'
    && Date.parse(developer.focusEndsAt || '') > Date.now()
  ));
  const byLanguage = new Map();
  for (const developer of activeFocus) {
    const group = byLanguage.get(developer.activeLanguage) || [];
    group.push(developer);
    byLanguage.set(developer.activeLanguage, group);
  }
  const connections = [];
  for (const group of byLanguage.values()) {
    const ordered = group.toSorted((left, right) => left.login.localeCompare(right.login));
    for (let index = 1; index < ordered.length && connections.length < 16; index += 1) {
      connections.push({
        from: ordered[index - 1],
        to: ordered[index],
        color: getLanguageColor(ordered[index].activeLanguage) || '#3b82f6',
      });
    }
  }
  return connections;
}

export default function LiveDeveloperSpace() {
  const globeRef = useRef(null);
  const { developers, connection } = useLivePresence();
  const [language, setLanguage] = useState('');
  const [platform, setPlatform] = useState('');
  const [codingAgent, setCodingAgent] = useState('');
  const [selected, setSelected] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [waveState, setWaveState] = useState({ state: 'idle', message: '' });
  const deferredDevelopers = useDeferredValue(developers);
  const liveCount = developers.filter(developer => developer.presenceState === 'live').length;
  const recentCount = developers.length - liveCount;
  const focusCount = developers.filter(developer => Date.parse(developer.focusEndsAt || '') > Date.now()).length;
  const languages = useMemo(() => uniqueValues(developers, 'activeLanguage'), [developers]);
  const platforms = useMemo(() => uniqueValues(developers, 'platform'), [developers]);
  const codingAgents = useMemo(() => uniqueValues(developers, 'codingAgent'), [developers]);
  const filtered = useMemo(() => deferredDevelopers
    .filter(developer => !language || developer.activeLanguage === language)
    .filter(developer => !platform || developer.platform === platform)
    .filter(developer => !codingAgent || developer.codingAgent === codingAgent)
    .sort((left, right) => right.lastHeartbeat.localeCompare(left.lastHeartbeat)),
  [codingAgent, deferredDevelopers, language, platform]);
  const connections = useMemo(() => buildFocusConnections(filtered), [filtered]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { signal: controller.signal })
      .then(response => response.ok ? response.json() : { user: null })
      .then(payload => setViewer(payload.user || null))
      .catch(error => {
        if (error.name !== 'AbortError') setViewer(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const updated = developers.find(developer => developer.login === selected.login);
    if (updated) setSelected(updated);
    else setSelected(null);
  }, [developers, selected?.login]);

  const selectDeveloper = (developer) => {
    setSelected(developer);
    setWaveState({ state: 'idle', message: '' });
    globeRef.current?.focus(developer);
  };

  const wave = async () => {
    if (!selected || waveState.state === 'sending') return;
    setWaveState({ state: 'sending', message: 'Sending wave…' });
    try {
      const response = await fetch('/api/presence/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: selected.login }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to send wave');
      setSelected(current => current ? { ...current, waveCount: payload.waveCount } : current);
      setWaveState({ state: 'sent', message: `You waved to @${selected.login}.` });
    } catch (error) {
      setWaveState({ state: 'error', message: error.message });
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="DevGlobe home">
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <div className={styles.title}>
          <h1>Developers coding worldwide</h1>
          <span className={styles.connection} data-state={connection} role="status">
            <i aria-hidden="true" /> {connection === 'live'
              ? `${liveCount} live, ${recentCount} recent`
              : connection === 'unavailable' ? 'Unavailable' : 'Connecting'}
          </span>
          {focusCount > 1 ? <span className={styles.focusCount}>{focusCount} focusing together</span> : null}
        </div>
        <nav className={styles.navigation} aria-label="Live globe actions">
          <Link href="/coding-stats">My stats</Link>
          <Link href="/leaderboard">Directory</Link>
        </nav>
      </header>

      <section className={styles.stage} aria-label="Live developer presence">
        <LiveDeveloperGlobe
          ref={globeRef}
          connections={connections}
          developers={filtered}
          onSelect={selectDeveloper}
        />
      </section>

      <aside className={styles.activity} aria-label="Live and recent developer activity">
        <div className={styles.panelHeading}>
          <h2>Developer activity</h2>
          <span>{filtered.length}</span>
        </div>
        <div className={styles.activityList}>
          {filtered.map(developer => (
            <button key={developer.id} type="button" onClick={() => selectDeveloper(developer)} className={styles.activityRow} data-presence={developer.presenceState}>
              <img src={developer.avatarUrl || '/devglobe.png'} alt="" />
              <span>
                <strong>{developer.name || developer.login}</strong>
                <small><i style={{ background: getLanguageColor(developer.activeLanguage) || '#3b82f6' }} />{developer.activeLanguage} · {STATUS_LABELS[developer.codingStatus] || (developer.presenceState === 'live' ? 'Live now' : 'Recently coding')}</small>
                {developer.codingAgent ? (
                  <small className={styles.agentIdentity}>{developer.codingAgent}{developer.codingModel ? ` · ${developer.codingModel}` : ''}</small>
                ) : null}
              </span>
              <time dateTime={developer.lastHeartbeat}>{relativeTime(developer.lastHeartbeat)}</time>
            </button>
          ))}
          {connection === 'live' && filtered.length === 0 ? (
            <p className={styles.empty}>No matching developers are sharing presence.</p>
          ) : null}
          {connection === 'unavailable' ? (
            <p className={styles.empty}>Live presence is temporarily unavailable.</p>
          ) : null}
        </div>
      </aside>

      <aside className={styles.filters} aria-label="Filter developer activity">
        <label>
          <span>Language</span>
          <select value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="">All languages</option>
            {languages.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Coding agent</span>
          <select value={codingAgent} onChange={event => setCodingAgent(event.target.value)}>
            <option value="">All agents</option>
            {codingAgents.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Platform</span>
          <select value={platform} onChange={event => setPlatform(event.target.value)}>
            <option value="">All platforms</option>
            {platforms.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <div className={styles.join}>
          <strong>Share your presence</strong>
          <span>Opt in from VS Code. No code, paths, repositories, branches, or keystrokes are sent.</span>
          <Link href="/plugins" onClick={() => track('extension_install_clicked', { source: 'live_globe' })}>Choose editor</Link>
        </div>
      </aside>

      {selected ? (
        <aside className={styles.selected} data-presence={selected.presenceState} aria-live="polite">
          <button type="button" className={styles.close} onClick={() => setSelected(null)} aria-label="Close developer details">×</button>
          <img src={selected.avatarUrl || '/devglobe.png'} alt="" />
          <div className={styles.selectedDetails}>
            <strong>{selected.name || selected.login}</strong>
            <span>@{selected.login}</span>
            <p>{selected.activeLanguage} in {selected.editor} on {selected.platform}</p>
            {selected.codingAgent ? (
              <small className={styles.agentIdentity}>
                Using {selected.codingAgent}{selected.codingModel ? ` with ${selected.codingModel}` : ''}
              </small>
            ) : null}
            {selected.codingStatus ? <small>{STATUS_LABELS[selected.codingStatus]}</small> : null}
            {selected.waveCount ? <small>{selected.waveCount} waves received</small> : null}
            {Date.parse(selected.focusEndsAt || '') > Date.now() ? (
              <small className={styles.focusLabel}>Focusing with the globe</small>
            ) : null}
            <small className={styles.presenceLabel}>{selected.presenceState === 'live' ? 'Live now' : 'Recently coding'}</small>
            <small>{selected.location || 'Location not listed'}</small>
          </div>
          <div className={styles.selectedActions}>
            {viewer?.login?.toLowerCase() === selected.login ? null : viewer ? (
              <button type="button" onClick={wave} disabled={waveState.state === 'sending' || waveState.state === 'sent'}>
                {waveState.state === 'sent' ? 'Waved' : 'Wave'}
              </button>
            ) : (
              <a href="/api/auth/github">Sign in to wave</a>
            )}
            {selected.profileAvailable === false ? (
              <a href={`https://github.com/${encodeURIComponent(selected.login)}`} target="_blank" rel="noreferrer">View GitHub</a>
            ) : (
              <Link href={`/developer/${encodeURIComponent(selected.login)}`}>View profile</Link>
            )}
          </div>
          {waveState.message ? (
            <p className={styles.waveMessage} data-state={waveState.state} role="status">{waveState.message}</p>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}