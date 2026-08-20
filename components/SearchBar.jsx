'use client';

import React, { useState, useRef, useCallback } from 'react';
import SpecialTags from './SpecialTags.jsx';
import { countryKey } from '../lib/country.js';
import { publicApiUrl } from '../lib/public-api.js';

const SAMPLES_BY_MODE = {
  text: [
    { query: 'torvalds', label: '@torvalds' },
    { query: 'sindresorhus', label: '@sindresorhus' },
    { query: 'San Francisco', label: 'San Francisco' },
    { query: 'Bengaluru', label: 'Bengaluru' },
  ],
  vector: [
    { query: 'developer building AI agents and MCP tools', label: 'AI agent builders' },
    { query: 'open source maintainer looking for collaborators', label: 'Open-source maintainers' },
    { query: 'developer working on LLM infrastructure and evaluation', label: 'LLM infrastructure' },
    { query: 'developer advocate growing technical communities', label: 'Community builders' },
  ],
  hybrid: [
    { query: 'MCP and TypeScript developer in Europe', label: 'MCP + TypeScript' },
    { query: 'AI agent builder in India', label: 'AI builders in India' },
    { query: 'Python open source maintainer', label: 'Python maintainers' },
    { query: 'cloud native developer open to collaboration', label: 'Cloud collaborators' },
  ],
};

export default function SearchBar({ developers, onResults, onReset, onSelectDeveloper, onGenerateCard, onSearchState, onOpenCardFeature, onOpenReadmeFeature, readmeTooltip = 'Generate a README for your GitHub profile', onOpenCompareFeature, compareCount = 0 }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('text');
  const [topN, setTopN] = useState(50);
  const [searching, setSearching] = useState(false);
  const [resultCount, setResultCount] = useState(null);
  const [singleResult, setSingleResult] = useState(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const doSearch = useCallback(async (q, m) => {
    if (!q.trim()) {
      onReset();
      setResultCount(null);
      setSingleResult(null);
      return;
    }

    if (m === 'text') {
      const lower = q.trim().toLowerCase();
      const locationKey = countryKey(q.trim());
      let results = developers.filter(d =>
        (d.login && d.login.toLowerCase().includes(lower)) ||
        (d.name && d.name.toLowerCase().includes(lower)) ||
        (d.location && countryKey(d.location).includes(locationKey))
      );

      if (results.length === 0) {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setSearching(true);
        try {
          const response = await fetch(
            publicApiUrl(`/api/search?q=${encodeURIComponent(q)}&mode=text&top=${topN}`),
            { signal: controller.signal }
          );
          const data = await response.json();
          if (controller.signal.aborted) return;
          results = data.results || [];
        } catch (error) {
          if (error.name === 'AbortError') return;
          console.error('Text search fallback failed:', error);
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      }

      onResults(results);
      setResultCount(results.length);
      setSingleResult(results.length === 1 ? results[0] : null);
      onSearchState?.({ query: q.trim(), results });
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);

    try {
      const res = await fetch(
        publicApiUrl(`/api/search?q=${encodeURIComponent(q)}&mode=${m}&top=${topN}`),
        { signal: controller.signal }
      );
      const data = await res.json();
      if (!controller.signal.aborted) {
        const results = data.results || [];
        onResults(results);
        setResultCount(results.length);
        const matchedDeveloper = results.length === 1
          ? developers.find(developer => developer.login === results[0].login) || results[0]
          : null;
        setSingleResult(matchedDeveloper);
        onSearchState?.({ query: q.trim(), results });
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Search failed:', e);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [developers, onResults, onReset, onSearchState, topN]);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSingleResult(null);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val, mode), 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timerRef.current);
      doSearch(query, mode);
    }
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  const handleModeChange = (e) => {
    const m = e.target.value;
    setMode(m);
    if (query.trim()) doSearch(query, m);
  };

  const handleTopNChange = (e) => {
    const n = parseInt(e.target.value);
    setTopN(n);
    if (query.trim()) doSearch(query, mode);
  };

  const handleSample = (q) => {
    setQuery(q);
    doSearch(q, mode);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setQuery('');
    setResultCount(null);
    setSingleResult(null);
    onReset();
    inputRef.current?.focus();
  };

  return (
    <div className="search-bar" id="search-bar">
      <div className="search-bar__inner">
        {searching ? (
          <div className="search-bar__spinner" />
        ) : (
          <svg className="search-bar__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={mode === 'text' ? 'Find a developer by name, username, or location...' : mode === 'vector' ? 'Describe your ideal developer or agent collaborator...' : 'Combine skills, interests, and location...'}
          autoComplete="off"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className="search-bar__clear" onClick={handleClear} title="Clear search (Esc)">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <select value={mode} onChange={handleModeChange} title="Search mode">
          <option value="text">Text</option>
          <option value="vector">Vector (AI)</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <select value={topN} onChange={handleTopNChange} title="Max results">
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
          <option value={50}>Top 50</option>
        </select>
        <div className="search-bar__features" role="group" aria-label="Developer tools">
          <button
            type="button"
            className="feature-action feature-action--card"
            onClick={onOpenCardFeature}
            aria-label="Generate your developer identity card"
            title="Generate your developer identity card"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>
          <button
            type="button"
            className="feature-action feature-action--readme"
            onClick={onOpenReadmeFeature}
            aria-label={readmeTooltip}
            title={readmeTooltip}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 3h11l5 5v13H4z" />
              <path d="M14 3v6h6" />
              <path d="M8 13h8" />
              <path d="M8 17h6" />
            </svg>
          </button>
          <button
            type="button"
            className={`feature-action feature-action--compare${compareCount ? ' feature-action--active' : ''}`}
            onClick={onOpenCompareFeature}
            aria-label={`Compare contributions${compareCount ? `, ${compareCount} of 2 selected` : ''}`}
            title="Compare contributions"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 7h11l-3-3" />
              <path d="M17 17H6l3 3" />
              <path d="M18 7l-3 3" />
              <path d="M6 17l3-3" />
            </svg>
            {compareCount > 0 && <strong>{compareCount}/2</strong>}
          </button>
        </div>
      </div>
      {resultCount !== null && query && (
        <div className="search-bar__feedback">
          <div className="search-bar__results">
            <span>{resultCount === 0 ? 'No developers found' : `${resultCount} developer${resultCount !== 1 ? 's' : ''} found`}</span>
            <button className="search-bar__reset" onClick={handleClear} title="Clear filter and show all">
              ✕ Clear
            </button>
          </div>
          {singleResult && (
            <div className="search-bar__card-suggestion">
              <button
                type="button"
                className="search-bar__profile-result"
                onClick={() => onSelectDeveloper(singleResult)}
                aria-label={`Open ${singleResult.name || singleResult.login}'s profile`}
              >
                <img src={singleResult.avatarUrl} alt="" />
                <span className="search-bar__card-identity">
                  <strong>
                    {singleResult.name || singleResult.login}
                    <SpecialTags tags={singleResult.specialTags} compact />
                  </strong>
                  <span>
                    @{singleResult.login}
                    {singleResult.globalRank ? ` · Global #${singleResult.globalRank}` : ''}
                  </span>
                </span>
              </button>
              <button type="button" className="search-bar__card-action" onClick={() => onGenerateCard(singleResult)}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Generate Card
              </button>
            </div>
          )}
        </div>
      )}
      <div className={`search-bar__samples${query ? ' hidden' : ''}`}>
        <span>Try:</span>
        {SAMPLES_BY_MODE[mode].map(s => (
          <button key={s.label} onClick={() => handleSample(s.query)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
