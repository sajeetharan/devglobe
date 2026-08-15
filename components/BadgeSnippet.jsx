'use client';

import { useState } from 'react';

const STAT_OPTIONS = [
  { value: 'globalRank', label: 'Global Rank' },
  { value: 'countryRank', label: 'Country Rank' },
  { value: 'cityRank', label: 'City Rank' },
  { value: 'score', label: 'Score' },
  { value: 'stars', label: 'Stars' },
];

export default function BadgeSnippet({ login, siteUrl }) {
  const [stat, setStat] = useState('globalRank');
  const [format, setFormat] = useState('markdown');
  const [copied, setCopied] = useState(false);

  const statQuery = stat === 'globalRank' ? '' : `?stat=${stat}`;
  const badgeUrl = `${siteUrl}/api/badge/${encodeURIComponent(login)}.svg${statQuery}`;
  const profileUrl = `${siteUrl}/share/${encodeURIComponent(login)}`;

  const snippets = {
    markdown: `[![devglobe](${badgeUrl})](${profileUrl})`,
    html: `<a href="${profileUrl}"><img src="${badgeUrl}" alt="devglobe badge" /></a>`,
  };

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippets[format]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail silently (permissions, insecure context);
      // the snippet is still selectable text, so no further action needed.
    }
  }

  return (
    <section className="badge-card" id="get-your-badge">
      <span className="badge-card__eyebrow">Embeddable badge</span>
      <h2 className="badge-card__title">Get your badge</h2>
      <p className="badge-card__subtitle">
        Embed a live-updating rank badge in your GitHub README or personal site. It refreshes automatically as your DevGlobe stats update.
      </p>

      <div className="badge-card__stats" role="tablist" aria-label="Badge stat">
        {STAT_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={stat === option.value}
            className={`badge-card__stat${stat === option.value ? ' badge-card__stat--active' : ''}`}
            onClick={() => setStat(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="badge-card__format">
        {['markdown', 'html'].map(option => (
          <button
            key={option}
            type="button"
            className={`badge-card__format-btn${format === option ? ' badge-card__format-btn--active' : ''}`}
            onClick={() => setFormat(option)}
          >
            {option === 'markdown' ? 'Markdown' : 'HTML'}
          </button>
        ))}
      </div>

      <div className="badge-card__snippet">
        <code>{snippets[format]}</code>
        <button type="button" className="badge-card__copy" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
