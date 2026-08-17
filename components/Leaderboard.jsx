'use client';

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { formatNum } from '../lib/format.js';
import { extractCountry, normalizeCountry, countryKey } from '../lib/country.js';
import { SCORE_METHODOLOGY } from '../lib/scoring.js';
import { compareOssWorth } from '../lib/oss-worth.js';
import SpecialTags from './SpecialTags.jsx';
import GlobalActivityFeed from './GlobalActivityFeed.jsx';
import AgentNetworkPanel from './AgentNetworkPanel.jsx';

const ITEM_HEIGHT = 62;
const BUFFER = 10;

export default function Leaderboard({
  developers,
  selectedLogin,
  onSelectDev,
  countryFilter = '',
  onCountryFilterChange,
  compareLogins = [],
  onToggleCompare,
  onClearCompare,
  claimedLogins,
  open = false,
  onClose,
  activeView = 'leaderboard',
  onViewChange,
  agentGlobeLayerVisible = false,
  onToggleAgentGlobeLayer,
}) {
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(600);

  // Filters (country is owned by App so the globe can drive it too)
  const [langFilter, setLangFilter] = useState('');
  const [sortBy, setSortBy] = useState('score');

  const countries = useMemo(() => {
    const map = new Map();
    developers.forEach(d => {
      if (d.location) {
        const country = normalizeCountry(extractCountry(d.location));
        if (country && country.length > 1) {
          const entry = map.get(country.toLowerCase());
          if (entry) entry.count++;
          else map.set(country.toLowerCase(), { name: country, count: 1 });
        }
      }
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 50);
  }, [developers]);

  // A country picked on the globe may have no developers, or be spelled
  // differently than the option built from developer locations.
  const selectedCountryOption = useMemo(() => {
    if (!countryFilter) return null;
    const key = countryKey(countryFilter);
    return countries.find(c => c.name.toLowerCase() === key) || null;
  }, [countries, countryFilter]);

  const languages = useMemo(() => {
    const set = new Set();
    developers.forEach(d => { if (d.topLanguage) set.add(d.topLanguage); });
    return [...set].sort();
  }, [developers]);

  const filtered = useMemo(() => {
    const wantedCountry = countryKey(countryFilter);
    let result = developers.filter(d => {
      const matchLang = !langFilter || d.topLanguage === langFilter;
      const matchCountry = !wantedCountry || (d.location && countryKey(extractCountry(d.location)) === wantedCountry);
      return matchLang && matchCountry;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'stars': return (b.totalStars || 0) - (a.totalStars || 0);
        case 'commits': return (b.totalCommits || 0) - (a.totalCommits || 0);
        case 'soRep': return (b.soReputation || 0) - (a.soReputation || 0);
        case 'worth': return compareOssWorth(a, b);
        default: return b.score - a.score;
      }
    });

    return result;
  }, [developers, langFilter, countryFilter, sortBy]);

  // Virtual scroll range
  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  const end = Math.min(filtered.length, Math.ceil((scrollTop + viewHeight) / ITEM_HEIGHT) + BUFFER);
  const totalHeight = filtered.length * ITEM_HEIGHT;
  const visibleItems = filtered.slice(start, end);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setViewHeight(el.clientHeight);
    const observer = new ResizeObserver(() => setViewHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Scroll to top when filters change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [countryFilter, langFilter, sortBy, developers]);

  // Scroll to selected
  useEffect(() => {
    if (!selectedLogin || !listRef.current) return;
    const idx = filtered.findIndex(d => d.login === selectedLogin);
    if (idx >= 0) {
      listRef.current.scrollTop = idx * ITEM_HEIGHT - viewHeight / 2;
    }
  }, [selectedLogin, filtered, viewHeight]);

  const hasActiveFilter = countryFilter || langFilter;
  const clearFilters = () => {
    onCountryFilterChange?.('');
    setLangFilter('');
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}${activeView === 'activity' ? ' sidebar--activity' : ''}`} id="sidebar">
      <div className="sidebar__drag-handle" onClick={onClose} aria-hidden="true" />
      <div className="sidebar__tabs" role="tablist" aria-label="Developer views">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'leaderboard'}
          className={activeView === 'leaderboard' ? 'sidebar__tab sidebar__tab--active' : 'sidebar__tab'}
          onClick={() => onViewChange?.('leaderboard')}
        >
          Leaderboard
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'activity'}
          className={activeView === 'activity' ? 'sidebar__tab sidebar__tab--active' : 'sidebar__tab'}
          onClick={() => onViewChange?.('activity')}
        >
          Activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'agents'}
          className={activeView === 'agents' ? 'sidebar__tab sidebar__tab--active' : 'sidebar__tab'}
          onClick={() => onViewChange?.('agents')}
        >
          Agents
        </button>
        <button className="sidebar__close-btn" onClick={onClose} aria-label="Close sidebar" title="Close sidebar">
          &times;
        </button>
      </div>
      {activeView === 'leaderboard' && (
        <>
      <div className="sidebar__header">
        <div className="sidebar__header-row">
          <h2>Leaderboard</h2>
          {hasActiveFilter && (
            <button className="sidebar__clear-btn" onClick={clearFilters} title="Clear all filters">
              ✕ Clear filters
            </button>
          )}
        </div>
        <div className="sidebar__count">
          {filtered.length} developer{filtered.length !== 1 ? 's' : ''}
        </div>
        <div className={`sidebar__compare-control${compareLogins.length ? ' sidebar__compare-control--active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 7h11l-3-3" />
            <path d="M17 17H6l3 3" />
            <path d="M18 7l-3 3" />
            <path d="M6 17l3-3" />
          </svg>
          <span>Compare contributions</span>
          <strong>{compareLogins.length}/2</strong>
          {compareLogins.length > 0 && (
            <button type="button" onClick={onClearCompare}>Clear</button>
          )}
        </div>
        <div className="sidebar__filters">
          <select
            value={selectedCountryOption ? selectedCountryOption.name : countryFilter}
            onChange={e => onCountryFilterChange?.(e.target.value)}
          >
            <option value="">All Countries</option>
            {countryFilter && !selectedCountryOption && (
              <option value={countryFilter}>
                {countryFilter.length > 15 ? countryFilter.slice(0, 14) + '…' : countryFilter} (0)
              </option>
            )}
            {countries.map(({ name, count }) => (
              <option key={name} value={name}>{name.length > 15 ? name.slice(0, 14) + '…' : name} ({count})</option>
            ))}
          </select>
          <select value={langFilter} onChange={e => setLangFilter(e.target.value)}>
            <option value="">All Languages</option>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="score">Score</option>
            <option value="stars">Stars</option>
            <option value="commits">Commits</option>
            <option value="soRep">SO Rep</option>
            <option value="worth">OSS Worth</option>
          </select>
        </div>
        {sortBy === 'score' && (
          <p className="sidebar__score-note" title={SCORE_METHODOLOGY.short}>
            ⓘ Score is relative to this dataset, not an absolute rating — tap a profile for the full breakdown.
          </p>
        )}
      </div>
      <ul className="sidebar__list" ref={listRef} onScroll={handleScroll} style={{ position: 'relative', overflow: 'auto' }}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map((dev, i) => {
            const idx = start + i;
            const isCompareSelected = compareLogins.includes(dev.login);
            const compareDisabled = compareLogins.length >= 2 && !isCompareSelected;

            return (
              <li
                key={dev.login}
                className={`lb-item${dev.login === selectedLogin ? ' active' : ''}${isCompareSelected ? ' compare-selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: idx * ITEM_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ITEM_HEIGHT,
                }}
                onClick={() => onSelectDev(dev)}
              >
                <span className="lb-item__rank">{idx + 1}</span>
                <img className="lb-item__avatar" src={dev.avatarUrl} alt={dev.login} loading="lazy" />
                <div className="lb-item__info">
                  <div className="lb-item__name">
                    {dev.name || dev.login}
                    {(dev.claimed || claimedLogins?.has(dev.login)) && (
                      <span className="verified-badge verified-badge--sm" title="Claimed profile">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-3.97-3.03a.75.75 0 00-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 00-1.06 1.06L6.97 11.03a.75.75 0 001.079-.02l3.992-4.99a.75.75 0 00-.01-1.05z"/></svg>
                      </span>
                    )}
                    <SpecialTags tags={dev.specialTags} compact />
                  </div>
                  <div className="lb-item__meta">{dev.topLanguage || ''} · {dev.location || 'Unknown'}</div>
                  <div className="lb-item__badges">
                    <span className="lb-badge lb-badge--gh" title="GitHub Stars">★ {formatNum(dev.totalStars)}</span>
                    {dev.soReputation ? <span className="lb-badge lb-badge--so" title="SO Reputation">● {formatNum(dev.soReputation)}</span> : null}
                    <span
                      className="lb-badge lb-badge--worth"
                      title={`${dev.ossWorth?.totalCredits?.toLocaleString() || 0} OSS Credits`}
                      aria-label={`${dev.ossWorth?.totalCredits?.toLocaleString() || 0} OSS Credits`}
                    >
                      OSC {formatNum(dev.ossWorth?.totalCredits || 0)}
                    </span>
                  </div>
                </div>
                <div className="lb-item__actions">
                  <button
                    type="button"
                    className={`lb-item__compare-btn${isCompareSelected ? ' lb-item__compare-btn--active' : ''}`}
                    disabled={compareDisabled}
                    aria-pressed={isCompareSelected}
                    aria-label={isCompareSelected ? `Remove ${dev.login} from comparison` : `Add ${dev.login} to comparison`}
                    title={isCompareSelected ? 'Remove from comparison' : 'Add to comparison'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompare?.(dev);
                    }}
                  >
                    {isCompareSelected ? '✓' : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 7h11l-3-3" />
                        <path d="M17 17H6l3 3" />
                      </svg>
                    )}
                  </button>
                  <span
                    className="lb-item__score"
                    title={`Score: ${dev.score}/100 — ${SCORE_METHODOLOGY.short}`}
                    aria-label={`Relative score ${dev.score} out of 100`}
                  >
                    {dev.score}
                  </span>
                </div>
              </li>
            );
          })}
        </div>
      </ul>
        </>
      )}
      {activeView === 'activity' && <GlobalActivityFeed active />}
      {activeView === 'agents' && (
        <AgentNetworkPanel
          globeLayerVisible={agentGlobeLayerVisible}
          onToggleGlobeLayer={onToggleAgentGlobeLayer}
        />
      )}
    </aside>
  );
}