'use client';

import React, { useMemo, useState } from 'react';
import { extractCountry, extractCity, normalizeCountry, normalizeCity, countryKey, cityKey } from '../lib/country.js';

const TOP_PER_CITY = 5;
const CITY_LIMIT = 12;

// Local leaderboards (#25): "who's #1 in my city/country" — a companion to the
// aggregate /countries stats page (#3), which shows counts and averages but
// not an actual ranked list of people. Reuses the countryRank/cityRank
// already computed by addDeveloperRanks (lib/ranking.js), so this is a pure
// client-side derivation of data already on `developers` — no new fetch.
export default function LocalPanel({ developers, onSelectLogin }) {
  const [query, setQuery] = useState('');

  const countryOptions = useMemo(() => {
    const counts = new Map();
    developers.forEach(d => {
      if (!d.location) return;
      const country = normalizeCountry(extractCountry(d.location));
      const key = countryKey(country);
      if (!key) return;
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { name: country, count: 1 });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [developers]);

  const filteredCountryOptions = useMemo(() => {
    if (!query.trim()) return countryOptions;
    const q = query.trim().toLowerCase();
    return countryOptions.filter(c => c.name.toLowerCase().includes(q));
  }, [countryOptions, query]);

  const [selectedCountry, setSelectedCountry] = useState('');

  const countryDevs = useMemo(() => {
    if (!selectedCountry) return [];
    const wanted = countryKey(selectedCountry);
    return developers
      .filter(d => d.location && countryKey(extractCountry(d.location)) === wanted)
      .sort((a, b) => (a.countryRank ?? Infinity) - (b.countryRank ?? Infinity));
  }, [developers, selectedCountry]);

  const cityGroups = useMemo(() => {
    const groups = new Map();
    countryDevs.forEach(d => {
      const city = normalizeCity(extractCity(d.location));
      const key = cityKey(city) || '__unknown__';
      if (!groups.has(key)) groups.set(key, { city: city || 'Other', devs: [] });
      groups.get(key).devs.push(d);
    });
    return [...groups.values()]
      .map(group => ({ ...group, devs: group.devs.sort((a, b) => (a.cityRank ?? Infinity) - (b.cityRank ?? Infinity)) }))
      .sort((a, b) => b.devs.length - a.devs.length)
      .slice(0, CITY_LIMIT);
  }, [countryDevs]);

  if (!selectedCountry) {
    return (
      <div className="local-panel">
        <header className="local-panel__header">
          <span>LOCAL PRIDE</span>
          <h2>Local leaderboards</h2>
          <p>Pick a country to see who's leading there, broken down by city.</p>
        </header>
        <div className="local-panel__search">
          <input
            type="text"
            placeholder="Search countries…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search countries"
          />
        </div>
        {filteredCountryOptions.length === 0 ? (
          <div className="local-panel__state">No countries match "{query}".</div>
        ) : (
          <ul className="local-panel__country-list">
            {filteredCountryOptions.map(country => (
              <li key={country.name}>
                <button type="button" onClick={() => setSelectedCountry(country.name)}>
                  <span>{country.name}</span>
                  <span className="local-panel__country-count">{country.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="local-panel">
      <header className="local-panel__header local-panel__header--detail">
        <button type="button" className="local-panel__back" onClick={() => setSelectedCountry('')}>
          ← All countries
        </button>
        <h2>{selectedCountry}</h2>
        <p>{countryDevs.length} developer{countryDevs.length === 1 ? '' : 's'} tracked here.</p>
      </header>

      {cityGroups.length === 0 ? (
        <div className="local-panel__state">No developers found for {selectedCountry} yet.</div>
      ) : (
        cityGroups.map(group => (
          <section key={group.city} className="local-panel__section">
            <h3>{group.city} <span>({group.devs.length})</span></h3>
            <ul className="trending-panel__list">
              {group.devs.slice(0, TOP_PER_CITY).map((dev, index) => (
                <li key={dev.login} className="trending-item" onClick={() => onSelectLogin?.(dev.login)}>
                  <span className="trending-item__rank">{index + 1}</span>
                  <img className="trending-item__avatar" src={dev.avatarUrl} alt={dev.login} loading="lazy" />
                  <div className="trending-item__info">
                    <div className="trending-item__name">{dev.name || dev.login}</div>
                    <div className="trending-item__meta">{dev.topLanguage || ''}</div>
                  </div>
                  <div className="trending-item__stats">
                    <span className="local-panel__badge">#{dev.cityRank} in {group.city}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
