'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { track } from '../lib/analytics.js';
import { getLanguageColor } from '../lib/language-colors.js';
import { useLivePresence } from './useLivePresence.js';
import styles from './LiveDeveloperSpace.module.css';

const LiveDeveloperGlobe = dynamic(() => import('./LiveDeveloperGlobe.jsx'), { ssr: false });
const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';

function uniqueValues(developers, field) {
  return [...new Set(developers.map(developer => developer[field]).filter(Boolean))].sort();
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  return seconds < 45 ? 'now' : `${Math.floor(seconds / 60)}m`;
}

export default function LiveDeveloperSpace() {
  const globeRef = useRef(null);
  const { developers, connection } = useLivePresence();
  const [language, setLanguage] = useState('');
  const [platform, setPlatform] = useState('');
  const [selected, setSelected] = useState(null);
  const deferredDevelopers = useDeferredValue(developers);
  const languages = useMemo(() => uniqueValues(developers, 'activeLanguage'), [developers]);
  const platforms = useMemo(() => uniqueValues(developers, 'platform'), [developers]);
  const filtered = useMemo(() => deferredDevelopers
    .filter(developer => !language || developer.activeLanguage === language)
    .filter(developer => !platform || developer.platform === platform)
    .sort((left, right) => right.lastHeartbeat.localeCompare(left.lastHeartbeat)),
  [deferredDevelopers, language, platform]);

  const selectDeveloper = (developer) => {
    setSelected(developer);
    globeRef.current?.focus(developer);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="DevGlobe home">
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <div className={styles.title}>
          <h1>Who&apos;s coding right now</h1>
          <span className={styles.connection} data-state={connection} role="status">
            <i aria-hidden="true" /> {connection === 'live'
              ? `${developers.length} live`
              : connection === 'unavailable' ? 'Unavailable' : 'Connecting'}
          </span>
        </div>
        <nav className={styles.navigation} aria-label="Live globe actions">
          <Link href="/coding-stats">My stats</Link>
          <Link href="/leaderboard">Directory</Link>
        </nav>
      </header>

      <section className={styles.stage} aria-label="Live developer presence">
        <LiveDeveloperGlobe ref={globeRef} developers={filtered} onSelect={selectDeveloper} />
      </section>

      <aside className={styles.activity} aria-label="Developers online now">
        <div className={styles.panelHeading}>
          <h2>Live activity</h2>
          <span>{filtered.length}</span>
        </div>
        <div className={styles.activityList}>
          {filtered.map(developer => (
            <button key={developer.id} type="button" onClick={() => selectDeveloper(developer)} className={styles.activityRow}>
              <img src={developer.avatarUrl || '/devglobe.png'} alt="" />
              <span>
                <strong>{developer.name || developer.login}</strong>
                <small><i style={{ background: getLanguageColor(developer.activeLanguage) || '#3b82f6' }} />{developer.activeLanguage}</small>
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

      <aside className={styles.filters} aria-label="Filter live developers">
        <label>
          <span>Language</span>
          <select value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="">All languages</option>
            {languages.map(value => <option key={value}>{value}</option>)}
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
          <a href={MARKETPLACE_URL} target="_blank" rel="noreferrer" onClick={() => track('extension_install_clicked', { source: 'live_globe' })}>Install extension</a>
        </div>
      </aside>

      {selected ? (
        <aside className={styles.selected} aria-live="polite">
          <button type="button" className={styles.close} onClick={() => setSelected(null)} aria-label="Close developer details">×</button>
          <img src={selected.avatarUrl || '/devglobe.png'} alt="" />
          <div>
            <strong>{selected.name || selected.login}</strong>
            <span>@{selected.login}</span>
            <p>{selected.activeLanguage} in {selected.editor} on {selected.platform}</p>
            <small>{selected.location || 'Location not listed'}</small>
          </div>
          <Link href={`/developer/${encodeURIComponent(selected.login)}`}>View profile</Link>
        </aside>
      ) : null}
    </main>
  );
}