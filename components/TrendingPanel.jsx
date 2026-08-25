'use client';

import React from 'react';
import { formatNum } from '../lib/format.js';

// Fed by the shared /api/trending fetch in page.jsx (rather than fetching
// itself) so the same data can drive the globe's highlight rings too (#24).
export default function TrendingPanel({ trending, error, onSelectLogin }) {
  if (error) return <div className="trending-panel__state">{error}</div>;
  if (!trending) return <div className="trending-panel__state">Loading trending developers...</div>;

  const { gainers, newEntries, windowDays, hasHistory } = trending;

  if (!hasHistory) {
    return (
      <div className="trending-panel__state">
        Trending needs a bit of history to compare against — check back once score
        snapshots have been captured for a few days.
      </div>
    );
  }

  if (gainers.length === 0 && newEntries.length === 0) {
    return <div className="trending-panel__state">No notable movers in the last {windowDays} days yet.</div>;
  }

  return (
    <div className="trending-panel">
      <header className="trending-panel__header">
        <span>FASTEST RISING</span>
        <h2>Trending</h2>
        <p>Biggest score gains over the last {windowDays} days.</p>
      </header>

      {gainers.length > 0 && (
        <ul className="trending-panel__list">
          {gainers.map((row, index) => (
            <li
              key={row.login}
              className="trending-item"
              onClick={() => onSelectLogin?.(row.login)}
            >
              <span className="trending-item__rank">{index + 1}</span>
              <img className="trending-item__avatar" src={row.avatarUrl} alt={row.login} loading="lazy" />
              <div className="trending-item__info">
                <div className="trending-item__name">{row.name}</div>
                <div className="trending-item__meta">{row.topLanguage || ''} {Number.isInteger(row.globalRank) ? `· Global #${row.globalRank}` : ''}</div>
              </div>
              <div className="trending-item__stats">
                <span className="trending-item__delta">+{formatNum(row.scoreDelta)}</span>
                {row.indicator && (
                  <span className={`trending-item__indicator${row.indicator.startsWith('↑') ? ' trending-item__indicator--up' : row.indicator.startsWith('↓') ? ' trending-item__indicator--down' : ' trending-item__indicator--new'}`}>
                    {row.indicator}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {newEntries.length > 0 && (
        <section className="trending-panel__section">
          <h3>New to the rankings</h3>
          <ul className="trending-panel__list">
            {newEntries.map(row => (
              <li key={row.login} className="trending-item" onClick={() => onSelectLogin?.(row.login)}>
                <span className="trending-item__rank">·</span>
                <img className="trending-item__avatar" src={row.avatarUrl} alt={row.login} loading="lazy" />
                <div className="trending-item__info">
                  <div className="trending-item__name">{row.name}</div>
                  <div className="trending-item__meta">{row.topLanguage || ''} {Number.isInteger(row.globalRank) ? `· Global #${row.globalRank}` : ''}</div>
                </div>
                <div className="trending-item__stats">
                  <span className="trending-item__indicator trending-item__indicator--new">NEW</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
