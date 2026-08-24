'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatNum } from '../lib/format.js';
import { getLanguageColor } from '../lib/language-colors.js';

const SORTERS = {
  developers: (a, b) => b.developerCount - a.developerCount,
  score: (a, b) => b.avgScore - a.avgScore,
};

export default function CountryStatsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('developers');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/country-stats', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load country statistics');
        if (!cancelled) setData(body);
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const countries = useMemo(() => {
    if (!data?.countries) return [];
    const filtered = query.trim()
      ? data.countries.filter(c => c.country.toLowerCase().includes(query.trim().toLowerCase()))
      : data.countries;
    return [...filtered].sort(SORTERS[sortBy]);
  }, [data, sortBy, query]);

  const maxDeveloperCount = data?.countries?.[0]?.developerCount || 1;

  return (
    <main className="activity-page">
      <header className="activity-page__nav">
        <Link href="/" className="activity-page__brand">
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <Link href="/" className="activity-page__back">Back to globe</Link>
      </header>

      {!data && !error && <div className="activity-page__state">Loading country statistics...</div>}
      {error && <div className="activity-page__state">{error}</div>}

      {data && (
        <div className="activity-page__content country-stats">
          <header className="country-stats__header">
            <h1>Country &amp; region statistics</h1>
            <p>
              {formatNum(data.totalDevelopers)} developers across {formatNum(data.countries.length)} countries,
              by developer count, average score, and top languages.
            </p>
          </header>

          <div className="country-stats__controls">
            <input
              type="search"
              placeholder="Filter by country..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Filter countries"
            />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort countries by">
              <option value="developers">Sort by developer count</option>
              <option value="score">Sort by average score</option>
            </select>
          </div>

          {countries.length === 0 ? (
            <div className="country-stats__empty">No countries match "{query}".</div>
          ) : (
            <table className="country-stats__table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Country</th>
                  <th scope="col">Developers</th>
                  <th scope="col">Avg score</th>
                  <th scope="col">Top languages</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((entry, index) => (
                  <tr key={entry.country}>
                    <td className="country-stats__rank">{index + 1}</td>
                    <td>
                      <Link href={`/?country=${encodeURIComponent(entry.country)}`} className="country-stats__name">
                        {entry.country}
                      </Link>
                    </td>
                    <td>
                      <div className="country-stats__bar-cell">
                        <span className="country-stats__bar-value">{formatNum(entry.developerCount)}</span>
                        <div className="country-stats__bar-track">
                          <div
                            className="country-stats__bar-fill"
                            style={{ width: `${Math.max(4, (entry.developerCount / maxDeveloperCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="country-stats__score">{entry.avgScore}</td>
                    <td>
                      <div className="country-stats__languages">
                        {entry.topLanguages.length === 0 && <span className="country-stats__no-lang">—</span>}
                        {entry.topLanguages.map(({ language, count }) => (
                          <span
                            key={language}
                            className="country-stats__lang-chip"
                            style={{ '--lang-color': getLanguageColor(language) }}
                            title={`${count} developer${count === 1 ? '' : 's'}`}
                          >
                            {language}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}
