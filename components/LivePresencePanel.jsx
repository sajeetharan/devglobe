'use client';

import { track } from '../lib/analytics.js';
import { getLanguageColor } from '../lib/language-colors.js';

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  return seconds < 45 ? 'now' : `${Math.floor(seconds / 60)}m`;
}

export default function LivePresencePanel({
  developers,
  connection,
  language,
  platform,
  languages,
  platforms,
  onLanguageChange,
  onPlatformChange,
  onSelectLogin,
}) {
  const liveCount = developers.filter(developer => developer.presenceState === 'live').length;
  const recentCount = developers.length - liveCount;

  return (
    <section className="live-presence-panel" aria-label="Developers coding now">
      <div className="live-presence-panel__header">
        <div>
          <h2>Live coding</h2>
          <p role="status" aria-live="polite">
            {connection === 'live'
              ? `${liveCount} live, ${recentCount} recent`
              : connection === 'unavailable' ? 'Live presence is unavailable' : 'Connecting to live presence'}
          </p>
        </div>
        <span className="live-presence-panel__signal" data-state={connection} aria-hidden="true" />
      </div>

      <div className="live-presence-panel__filters" aria-label="Filter live developers">
        <label>
          <span>Language</span>
          <select value={language} onChange={event => onLanguageChange(event.target.value)}>
            <option value="">All languages</option>
            {languages.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Platform</span>
          <select value={platform} onChange={event => onPlatformChange(event.target.value)}>
            <option value="">All platforms</option>
            {platforms.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <div className="live-presence-panel__list">
        {developers.map(developer => (
          <button
            key={developer.id}
            type="button"
            className="live-presence-row"
            data-presence={developer.presenceState}
            onClick={() => onSelectLogin(developer.login, developer)}
          >
            <img src={developer.avatarUrl || '/devglobe.png'} alt="" />
            <span className="live-presence-row__identity">
              <strong>{developer.name || developer.login}</strong>
              <small>
                <i style={{ background: getLanguageColor(developer.activeLanguage) || 'var(--accent-blue)' }} aria-hidden="true" />
                {developer.activeLanguage} · {developer.presenceState === 'live' ? 'Live now' : 'Recently coding'}
              </small>
            </span>
            <time dateTime={developer.lastHeartbeat}>{relativeTime(developer.lastHeartbeat)}</time>
          </button>
        ))}
        {connection === 'live' && developers.length === 0 ? (
          <p className="live-presence-panel__empty">No developers match these filters.</p>
        ) : null}
        {connection === 'unavailable' ? (
          <p className="live-presence-panel__empty">Live presence is temporarily unavailable. Try again shortly.</p>
        ) : null}
      </div>

      <div className="live-presence-panel__join">
        <strong>Appear on the globe</strong>
        <span>Opt in from VS Code. Source code and file names stay private.</span>
        <a
          href={MARKETPLACE_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => track('extension_install_clicked', { source: 'home_live_panel' })}
        >
          Install extension
        </a>
      </div>
    </section>
  );
}