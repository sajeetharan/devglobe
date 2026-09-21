'use client';

import { track } from '../lib/analytics.js';
import LanguageBadge from './LanguageBadge.jsx';

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';

function relativeTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
  historyConnection = 'idle',
}) {
  const liveCount = developers.filter(developer => developer.presenceState === 'live').length;
  const extensionUserCount = developers.length;

  return (
    <section className="live-presence-panel" aria-label="Developers coding now">
      <div className="live-presence-panel__header">
        <div>
          <h2>Live coding</h2>
          <p role="status" aria-live="polite">
            {connection === 'live'
              ? historyConnection === 'loading'
                ? `${liveCount} live · Loading extension users`
                : `${liveCount} live · ${extensionUserCount} extension users`
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
                <LanguageBadge language={developer.activeLanguage} />
                <span aria-hidden="true">·</span>
                {developer.presenceState === 'live'
                  ? 'Live now'
                  : developer.presenceState === 'recent' ? 'Recently coding' : 'VS Code extension'}
              </small>
            </span>
            <time
              dateTime={developer.lastHeartbeat}
              title={Number.isFinite(Date.parse(developer.lastHeartbeat))
                ? new Date(developer.lastHeartbeat).toLocaleString()
                : undefined}
            >
              {relativeTime(developer.lastHeartbeat)}
            </time>
          </button>
        ))}
        {connection === 'live' && developers.length === 0 ? (
          <p className="live-presence-panel__empty">No developers match these filters.</p>
        ) : null}
        {connection === 'unavailable' ? (
          <p className="live-presence-panel__empty">Live presence is temporarily unavailable. Try again shortly.</p>
        ) : null}
        {historyConnection === 'unavailable' ? (
          <p className="live-presence-panel__notice">Past extension users are temporarily unavailable.</p>
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