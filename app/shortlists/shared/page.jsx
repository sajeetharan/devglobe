'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatNum } from '../../../lib/format.js';

export default function SharedShortlistPage() {
  const [data, setData] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const owner = params.get('owner');
    const token = params.get('token');
    fetch(`/api/shortlists/shared?owner=${encodeURIComponent(owner || '')}&token=${encodeURIComponent(token || '')}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load shared shortlist');
        return body;
      })
      .then(async body => {
        if (cancelled) return;
        setData(body);
        const results = await Promise.all(body.shortlist.entries.map(async entry => {
          const response = await fetch(`/api/developer?id=${encodeURIComponent(entry.login)}`, { cache: 'no-store' });
          return [entry.login, response.ok ? await response.json() : null];
        }));
        if (!cancelled) setProfiles(Object.fromEntries(results));
      })
      .catch(loadError => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="shared-shortlist-page">
      <header className="shared-shortlist-header">
        <Link href="/" referrerPolicy="no-referrer" aria-label="Return to DevGlobe"><img src="/devglobe.png" alt="" />DevGlobe</Link>
        <span>READ-ONLY SHORTLIST</span>
      </header>
      {!data && !error && <p className="shared-shortlist-state">Loading shared shortlist...</p>}
      {error && (
        <section className="shared-shortlist-state">
          <h1>Link unavailable</h1>
          <p>This shortlist was revoked, deleted, or the link is invalid.</p>
          <Link href="/">Explore developers</Link>
        </section>
      )}
      {data && (
        <section className="shared-shortlist-content">
          <div className="shared-shortlist-title">
            <div><span>SHARED BY @{data.owner}</span><h1>{data.shortlist.name}</h1></div>
            <strong>{data.shortlist.entries.length} developers</strong>
          </div>
          <p className="shared-shortlist-notice">This snapshot is read-only. The owner chose to include the notes shown here; only they can change entries or revoke access.</p>
          <div className="shared-shortlist-table" role="table" aria-label={`${data.shortlist.name} developer comparison`}>
            <div className="shared-shortlist-row shared-shortlist-row--header" role="row">
              <span role="columnheader">Developer</span><span role="columnheader">Language</span><span role="columnheader">Score</span><span role="columnheader">Stars</span><span role="columnheader">Private note shared by owner</span>
            </div>
            {data.shortlist.entries.map(entry => {
              const profile = profiles[entry.login];
              return (
                <div className="shared-shortlist-row" role="row" key={entry.login}>
                  <span role="cell"><Link href={`/developer/${encodeURIComponent(entry.login)}`} referrerPolicy="no-referrer">@{entry.login}</Link><small>{profile?.name || 'Public profile'}</small></span>
                  <span role="cell" data-label="Language">{profile?.topLanguage || '—'}</span>
                  <span role="cell" data-label="Score">{profile?.score ?? '—'}</span>
                  <span role="cell" data-label="Stars">{profile ? formatNum(profile.totalStars || 0) : '—'}</span>
                  <span role="cell" data-label="Note">{entry.note || 'No note'}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}