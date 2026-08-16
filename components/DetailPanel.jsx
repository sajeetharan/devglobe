'use client';

import React, { useEffect, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import * as d3 from 'd3';
import { formatNum, formatRelativeTime, isStaleData } from '../lib/format.js';
import { DIMENSIONS, SCORE_METHODOLOGY } from '../lib/scoring.js';
import { SOCIAL_PREVIEW_VERSION } from '../lib/site.js';
import { classifyAgent } from '../lib/agent-class.js';
import { AI_TOOLS } from '../lib/ai-profile.js';
import SpecialTags from './SpecialTags.jsx';

export default function DetailPanel({ dev, onClose, onCardGenerated, claimedLogins, user, openCardOnMount = false, claimSuccess = false }) {
  const [fullData, setFullData] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const [followState, setFollowState] = useState('idle');
  const [followError, setFollowError] = useState('');
  const radarRef = useRef(null);
  const heatmapRef = useRef(null);
  const langRef = useRef(null);

  const handleGenerateCard = () => {
    track('card_generated', { login: dev.login });
    onCardGenerated?.(dev.login);
    setShowCard(true);
  };

  useEffect(() => {
    if (openCardOnMount) setShowCard(true);
  }, [openCardOnMount]);

  useEffect(() => {
    if (!user || user.login.toLowerCase() === dev.login.toLowerCase()) return;
    let cancelled = false;
    setFollowState('loading');
    fetch('/api/watchlist/developers', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load follows');
        const result = await response.json();
        if (!cancelled) {
          setFollowState(result.developers.includes(dev.login.toLowerCase()) ? 'following' : 'not-following');
        }
      })
      .catch(() => {
        if (!cancelled) setFollowState('not-following');
      });
    return () => { cancelled = true; };
  }, [dev.login, user]);

  const handleFollow = async () => {
    if (!user) {
      window.location.assign('/api/auth/github');
      return;
    }
    const wasFollowing = followState === 'following';
    setFollowState('saving');
    setFollowError('');
    try {
      const response = await fetch('/api/watchlist/developers', {
        method: wasFollowing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: dev.login }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update follow');
      const following = result.developers.includes(dev.login.toLowerCase());
      setFollowState(following ? 'following' : 'not-following');
      track(following ? 'developer_followed' : 'developer_unfollowed', { login: dev.login });
    } catch (error) {
      setFollowState(wasFollowing ? 'following' : 'not-following');
      setFollowError(error.message);
    }
  };

  // Fetch full details on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchFull() {
      try {
        const res = await fetch(`/api/developer?id=${encodeURIComponent(dev.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setFullData(data);
        }
      } catch { /* use existing data */ }
    }
    fetchFull();
    return () => { cancelled = true; };
  }, [dev.id]);

  // Radar chart
  useEffect(() => {
    if (!dev.scoreDimensions || !radarRef.current) return;
    renderRadar(radarRef.current, dev.scoreDimensions);
  }, [dev.scoreDimensions]);

  // Heatmap
  useEffect(() => {
    if (!heatmapRef.current) return;
    renderHeatmap(heatmapRef.current, dev.totalCommits || 500);
  }, [dev.totalCommits]);

  // Languages donut
  useEffect(() => {
    if (!langRef.current) return;
    const langs = fullData?.languages || (dev.topLanguage ? [{ name: dev.topLanguage, percent: 100 }] : []);
    renderLanguages(langRef.current, langs);
  }, [fullData, dev.topLanguage]);

  const merged = { ...dev, ...fullData };
  const repos = merged.topRepos || [];
  const soRep = merged.soReputation || 0;
  const soAnswers = merged.soAnswers || 0;
  const soAcceptRate = merged.soAcceptRate || 0;
  const soBadges = merged.soBadges || 0;

  return (
    <div className="detail-panel open">
      <button className="detail-panel__close" onClick={onClose}>&times;</button>

      {/* Header */}
      <div className="detail-panel__header">
        <div className="detail-header">
          <img className="detail-header__avatar" src={dev.avatarUrl} alt={dev.login} />
          <div>
            <div className="detail-header__name">
              {dev.name || dev.login}
              {(dev.claimed || claimedLogins?.has(dev.login)) && (
                <span className="verified-badge" title="Claimed profile">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                    <path d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-3.97-3.03a.75.75 0 00-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 00-1.06 1.06L6.97 11.03a.75.75 0 001.079-.02l3.992-4.99a.75.75 0 00-.01-1.05z" />
                  </svg>
                  Verified
                </span>
              )}
            </div>
            <div className="detail-header__location">📍 {dev.location || 'Unknown location'}</div>
            <SpecialTags tags={merged.specialTags} />
            <div className="detail-header__badges">
              <span
                className="detail-header__score-badge"
                title={dev.scoreHasSO === false ? `${SCORE_METHODOLOGY.short} ${SCORE_METHODOLOGY.noSO}` : SCORE_METHODOLOGY.short}
              >
                Score: {dev.score}/100
              </span>
              {dev.globalRank && (
                <span
                  className="rank-badge rank-badge--global"
                  title={`Ranked by DevGlobe score among ${formatNum(dev.globalTotal)} developers`}
                >
                  Global #{formatNum(dev.globalRank)}
                </span>
              )}
              {dev.countryRank && (
                <div className="rank-badge-stack">
                  <span
                    className="rank-badge rank-badge--country"
                    title={`Ranked ${formatNum(dev.countryRank)} of ${formatNum(dev.countryTotal)} developers in ${dev.country}`}
                  >
                    #{formatNum(dev.countryRank)} in {dev.country}
                  </span>
                  {dev.cityRank && (
                    <span
                      className="rank-badge rank-badge--city"
                      title={`Ranked ${formatNum(dev.cityRank)} of ${formatNum(dev.cityTotal)} developers in ${dev.city}`}
                    >
                      #{formatNum(dev.cityRank)} in {dev.city}
                    </span>
                  )}
                </div>
              )}
            </div>
            <p className="detail-header__score-note">
              {SCORE_METHODOLOGY.short}
            </p>
            <div className="detail-header__links">
              {user?.login.toLowerCase() !== dev.login.toLowerCase() && (
                <button
                  type="button"
                  className={`btn btn--follow${followState === 'following' ? ' btn--follow-active' : ''}`}
                  onClick={handleFollow}
                  disabled={followState === 'loading' || followState === 'saving'}
                  aria-pressed={followState === 'following'}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {followState === 'following' ? <path d="m5 12 4 4L19 6" /> : <><path d="M15 19a6 6 0 00-12 0" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>}
                  </svg>
                  {followState === 'following' ? 'Following' : followState === 'saving' ? 'Saving...' : 'Follow'}
                </button>
              )}
              <a href={merged.githubUrl || `https://github.com/${dev.login}`} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
              {merged.soUserId && (
                <a href={`https://stackoverflow.com/users/${merged.soUserId}`} target="_blank" rel="noreferrer">StackOverflow ↗</a>
              )}
                <a href={`/developer/${encodeURIComponent(dev.login)}`}>Impact History</a>
                <a href={`/share/${encodeURIComponent(dev.login)}#get-your-badge`} target="_blank" rel="noopener noreferrer">Get Badge ↗</a>
                <button
                className="btn btn--share"
                onClick={handleGenerateCard}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Generate Identity Card
              </button>
            </div>
            {followError && <div className="detail-header__follow-error" role="status">{followError}</div>}
          </div>
        </div>
      </div>

      {merged.aiProfile && <AiCollaborationProfile dev={merged} profile={merged.aiProfile} />}

      {/* Stats */}
      <div className="detail-panel__stats">
        <div className="stats-grid">
          <StatCard label="Stars" value={formatNum(merged.totalStars || 0)} />
          <StatCard label="Commits" value={formatNum(merged.totalCommits || 0)} />
          <StatCard label="Followers" value={formatNum(merged.followers || 0)} />
          <StatCard label="SO Reputation" value={formatNum(soRep)} className="stat-card--so" />
          <StatCard label="SO Answers" value={formatNum(soAnswers)} className="stat-card--so" />
          <StatCard label="SO Badges" value={soBadges || 0} className="stat-card--so" />
        </div>
      </div>

      {/* Charts */}
      <div className="detail-panel__charts">
        <div className="chart-section">
          <h3>Score Breakdown</h3>
          <div ref={radarRef} />
          <ScoreExplanation dev={dev} />
        </div>

        <div className="chart-section">
          <h3>StackOverflow Activity</h3>
          {soRep || soAnswers ? (
            <SOBars rep={soRep} answers={soAnswers} acceptRate={soAcceptRate} badges={soBadges} userId={merged.soUserId} />
          ) : (
            <div className="so-empty">No StackOverflow profile linked</div>
          )}
        </div>

        <div className="chart-section">
          <h3>Contribution Activity</h3>
          <div ref={heatmapRef} />
        </div>

        <div className="chart-section">
          <h3>Languages</h3>
          <div ref={langRef} />
        </div>

        <div className="chart-section">
          <h3>Top Repositories</h3>
          <div>
            {repos.slice(0, 5).map(repo => (
              <div className="repo-item" key={repo.name}>
                <a
                  className="repo-item__name"
                  href={repo.url || `https://github.com/${encodeURIComponent(merged.login)}/${encodeURIComponent(repo.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${repo.name} on GitHub`}
                >
                  {repo.name}<span aria-hidden="true"> ↗</span>
                </a>
                <span className="repo-item__stats">
                  <span>⭐ {formatNum(repo.stars)}</span>
                  <span>🍴 {formatNum(repo.forks)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card Modal */}
      {showCard && (
        <CardModal dev={dev} claimSuccess={claimSuccess} onClose={() => setShowCard(false)} />
      )}
    </div>
  );
}

function AiCollaborationProfile({ dev, profile }) {
  const [shareStatus, setShareStatus] = useState('');
  const toolNames = new Map(AI_TOOLS.map(tool => [tool.id, tool.name]));

  const shareAgentProfile = async () => {
    const tools = profile.tools.map(tool => toolNames.get(tool.id) || tool.id).join(' · ');
    const url = `${window.location.origin}/share/${encodeURIComponent(dev.login)}`;
    const text = `${dev.name || `@${dev.login}`} is open to verified AI agent collaborations on DevGlobe.${tools ? ` ${tools}.` : ''}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${dev.name || dev.login} on DevGlobe`, text, url });
        setShareStatus('Shared');
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareStatus('Copied');
      }
      track('agent_profile_shared', { login: dev.login });
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Unable to share');
    }
  };

  return (
    <section className="ai-collaboration" aria-labelledby="ai-collaboration-title">
      <div className="ai-collaboration__heading">
        <div>
          <span>SELF-DECLARED</span>
          <h3 id="ai-collaboration-title">AI collaboration</h3>
        </div>
        {profile.acceptsAgentRequests && <strong>Open to verified agents</strong>}
      </div>
      {profile.tools.length > 0 ? (
        <div className="ai-collaboration__tools">
          {profile.tools.map(tool => (
            <div className="ai-collaboration__tool" key={tool.id}>
              <span>{toolNames.get(tool.id) || tool.id}</span>
              <small>{tool.usage}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="ai-collaboration__empty">No AI tools listed.</p>
      )}
      {profile.acceptsAgentRequests && (
        <>
          <p className="ai-collaboration__note">Agent introductions will require developer approval. Contact details remain private.</p>
          <div className="ai-collaboration__share">
            <button type="button" onClick={shareAgentProfile}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 10.5 6.8-4" />
                <path d="m8.6 13.5 6.8 4" />
              </svg>
              Share agent profile
            </button>
            <span role="status" aria-live="polite">{shareStatus}</span>
          </div>
        </>
      )}
    </section>
  );
}

function ScoreExplanation({ dev }) {
  const dimensions = dev.scoreDimensions;
  const weights = dev.scoreWeights;
  if (!dimensions || !weights) return null;

  const freshLabel = formatRelativeTime(dev.metricsUpdatedAt);
  const stale = isStaleData(dev.metricsUpdatedAt);

  return (
    <div className="score-explain">
      <p className="score-explain__methodology">{SCORE_METHODOLOGY.short}</p>
      {dev.scoreHasSO === false && (
        <p className="score-explain__redistribute">{SCORE_METHODOLOGY.noSO}</p>
      )}

      <ul className="score-explain__list">
        {DIMENSIONS.map(({ key, label, description }) => {
          const normalized = dimensions[key] || 0;
          const weight = weights[key] || 0;
          const points = Math.round(normalized * weight * 100);
          return (
            <li className="score-explain__row" key={key}>
              <div className="score-explain__row-top">
                <span className="score-explain__label" title={description}>{label}</span>
                <span className="score-explain__points">{points} pts</span>
              </div>
              <div className="score-explain__track">
                <div className="score-explain__fill" style={{ width: `${Math.round(normalized * 100)}%` }} />
              </div>
              <span className="score-explain__weight">{Math.round(weight * 100)}% weight</span>
            </li>
          );
        })}
      </ul>

      {typeof dev.scorePercentile === 'number' && (
        <p className="score-explain__percentile">
          Higher than {dev.scorePercentile}% of developers currently indexed by DevGlobe.
        </p>
      )}

      <p className={`score-explain__freshness${stale ? ' score-explain__freshness--stale' : ''}`}>
        {freshLabel ? `Metrics last refreshed ${freshLabel}${stale ? ' — may be out of date' : ''}.` : 'Metrics freshness unknown.'}
      </p>
    </div>
  );
}

function StatCard({ label, value, className = '' }) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

function SOBars({ rep, answers, acceptRate, badges, userId }) {
  const metrics = [
    { label: 'Reputation', value: rep, max: 1000000, color: '#f48024' },
    { label: 'Answers', value: answers, max: 10000, color: '#ff9f4a' },
    { label: 'Accept Rate', value: acceptRate, max: 100, color: '#ffcc80', suffix: '%' },
    { label: 'Badges', value: badges, max: 500, color: '#ffe0b2' },
  ];

  return (
    <div>
      <div className="so-bars">
        {metrics.map(m => {
          const pct = Math.min((m.value / m.max) * 100, 100);
          const display = m.suffix ? m.value + m.suffix : formatNum(m.value);
          return (
            <div className="so-bar" key={m.label}>
              <div className="so-bar__label">{m.label}</div>
              <div className="so-bar__track">
                <div className="so-bar__fill" style={{ width: `${pct}%`, background: m.color }} />
              </div>
              <div className="so-bar__value">{display}</div>
            </div>
          );
        })}
      </div>
      {userId && (
        <a className="so-profile-link" href={`https://stackoverflow.com/users/${userId}`} target="_blank" rel="noreferrer">
          View full SO profile ↗
        </a>
      )}
    </div>
  );
}

function renderRadar(container, dims) {
  container.innerHTML = '';
  const data = [
    { axis: 'Stars', value: dims.stars },
    { axis: 'Commits', value: dims.commits },
    { axis: 'Reach', value: dims.repoReach },
    { axis: 'SO Rep', value: dims.soReputation },
    { axis: 'SO Engage', value: dims.soEngagement },
    { axis: 'Community', value: dims.community },
  ];

  const width = 260, height = 260;
  const radius = Math.min(width, height) / 2 - 30;
  const levels = 5;
  const angleSlice = (Math.PI * 2) / data.length;

  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .append('g')
    .attr('transform', `translate(${width / 2}, ${height / 2})`);

  for (let i = 1; i <= levels; i++) {
    svg.append('circle')
      .attr('r', (radius / levels) * i)
      .attr('fill', 'none')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 0.5);
  }

  data.forEach((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    svg.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', radius * Math.cos(angle))
      .attr('y2', radius * Math.sin(angle))
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 0.5);

    svg.append('text')
      .attr('x', (radius + 16) * Math.cos(angle))
      .attr('y', (radius + 16) * Math.sin(angle))
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text(d.axis);
  });

  const line = d3.lineRadial()
    .radius(d => d.value * radius)
    .angle((d, i) => i * angleSlice)
    .curve(d3.curveLinearClosed);

  svg.append('path')
    .datum(data)
    .attr('d', line)
    .attr('fill', 'rgba(59, 130, 246, 0.2)')
    .attr('stroke', '#3b82f6')
    .attr('stroke-width', 2);

  data.forEach((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    svg.append('circle')
      .attr('cx', d.value * radius * Math.cos(angle))
      .attr('cy', d.value * radius * Math.sin(angle))
      .attr('r', 4)
      .attr('fill', '#3b82f6');
  });
}

function renderHeatmap(container, totalCommits) {
  container.innerHTML = '';
  const days = 364;
  const data = [];
  const avg = totalCommits / days;
  for (let i = 0; i < days; i++) {
    const isWeekend = (i % 7 === 0 || i % 7 === 6);
    const base = isWeekend ? avg * 0.3 : avg * 1.4;
    data.push(Math.max(0, Math.round(base + (Math.random() - 0.5) * avg * 2)));
  }

  const cellSize = 11;
  const weeks = 52;
  const width = weeks * (cellSize + 2) + 40;
  const height = 7 * (cellSize + 2) + 20;

  const colorScale = d3.scaleQuantize()
    .domain([0, d3.max(data)])
    .range(['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']);

  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%');

  data.forEach((value, i) => {
    const week = Math.floor(i / 7);
    const day = i % 7;
    svg.append('rect')
      .attr('x', week * (cellSize + 2) + 20)
      .attr('y', day * (cellSize + 2))
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 2)
      .attr('fill', colorScale(value));
  });

  ['Mon', 'Wed', 'Fri'].forEach((label, i) => {
    svg.append('text')
      .attr('x', 0)
      .attr('y', (i * 2 + 1) * (cellSize + 2) + cellSize / 2)
      .attr('fill', '#64748b')
      .attr('font-size', '9px')
      .attr('dominant-baseline', 'middle')
      .text(label);
  });
}

function renderLanguages(container, languages) {
  container.innerHTML = '';
  if (!languages.length) return;

  const width = 120, height = 120;
  const radius = Math.min(width, height) / 2;
  const colors = ['#3b82f6', '#8b5cf6', '#f48024', '#2ea44f', '#64748b'];

  const pie = d3.pie().value(d => d.percent).sort(null);
  const arc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius);

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(${width / 2}, ${height / 2})`);

  svg.selectAll('path')
    .data(pie(languages))
    .join('path')
    .attr('d', arc)
    .attr('fill', (d, i) => colors[i % colors.length]);

  const legend = d3.select(container)
    .append('div')
    .style('font-size', '11px');

  languages.forEach((lang, i) => {
    legend.append('div')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('gap', '6px')
      .style('margin-bottom', '4px')
      .html(`<span style="width:8px;height:8px;border-radius:50%;background:${colors[i % colors.length]};display:inline-block"></span>
             <span style="color:#e2e8f0">${lang.name}</span>
             <span style="color:#64748b">${lang.percent}%</span>`);
  });
}

/* ─── Card Modal ─── */

function CardModal({ dev, claimSuccess, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [linkedinCopied, setLinkedinCopied] = useState(false);
  const { login } = dev;
  const name = dev.name || login;
  const cardUrl = `/api/card?login=${encodeURIComponent(login)}`;
  const sharePath = `/share/${encodeURIComponent(login)}?v=${SOCIAL_PREVIEW_VERSION}`;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${sharePath}` : sharePath;

  const rankText = dev.globalRank ? `Global #${dev.globalRank} of ${dev.globalTotal}` : 'Ranked on DevGlobe';
  const agent = classifyAgent(dev);
  const shareHashtags = ['buildinpublic', 'DevGlobe', 'OpenSource', 'DeveloperCommunity', 'GitHub'];
  const hashtagText = shareHashtags.map(hashtag => `#${hashtag}`).join(' ');
  const shareText = `I mapped my open-source identity on DevGlobe: ${rankText}. Generate yours and see where you rank.\n\n${hashtagText}`;
  const linkedinCaption = `I mapped my open-source contributions on DevGlobe and discovered my developer identity: ${agent.name}. ${rankText}. Build your card and see where your work places you in the global developer community.\n\n${hashtagText}`;

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    reddit: `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(`My DevGlobe Developer Card - ${name} ${hashtagText}`)}`,
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(cardUrl);
      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
        throw new Error('Card image is unavailable');
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error('Card image is empty');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devglobe-${login}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setLoading(false);
      setError(true);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  const handleLinkedInShare = () => {
    navigator.clipboard?.writeText(linkedinCaption).then(() => setLinkedinCopied(true)).catch(() => {});
    window.open(shareLinks.linkedin, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="card-modal-backdrop" onClick={onClose}>
      <div className="card-modal" onClick={e => e.stopPropagation()}>
        <button className="card-modal__close" onClick={onClose}>&times;</button>
        {claimSuccess && (
          <div className="card-modal__success" role="status">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.7a1 1 0 00-1.4-1.4L9 10.2 7.7 8.9a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
            </svg>
            <div><strong>Profile claimed</strong><span>Share your verified DevGlobe identity with your network.</span></div>
          </div>
        )}
        <div className="card-modal__heading">
          <div>
            <div className="card-modal__eyebrow">DEVGLOBE IDENTITY</div>
            <h3 className="card-modal__title">{name}&apos;s Developer Card</h3>
          </div>
          {dev.globalRank && (
            <button
              className="card-modal__rank-info"
              title={`Global rank compares DevGlobe score across ${formatNum(dev.globalTotal)} developers${dev.countryRank ? `. Country rank compares ${formatNum(dev.countryTotal)} developers in ${dev.country}` : ''}.`}
              aria-label="How DevGlobe ranks are calculated"
            >
              ?
            </button>
          )}
        </div>

        {dev.globalRank && (
          <div className="card-modal__rank-strip">
            <div><strong>#{formatNum(dev.globalRank)}</strong><span>Global rank</span></div>
            {dev.countryRank && <div><strong>#{formatNum(dev.countryRank)}</strong><span>in {dev.country}</span></div>}
          </div>
        )}

        <div className="card-modal__preview">
          {loading && !error && <div className="card-modal__loading">Generating card...</div>}
          {error && <div className="card-modal__error" role="alert">Card unavailable. Please try again later.</div>}
          <img
            src={cardUrl}
            alt={`DevAgent card for ${name}`}
            className="card-modal__image"
            style={{ display: loading || error ? 'none' : 'block' }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        </div>

        <div className="card-modal__actions">
          <button className="card-modal__btn card-modal__btn--download" onClick={handleDownload} disabled={loading || error}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download
          </button>
          <button className="card-modal__btn card-modal__btn--copy" onClick={handleCopyLink}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Copy Link
          </button>
        </div>

        <div className="card-modal__share">
          <span className="card-modal__share-label">Share on:</span>
          <a href={shareLinks.twitter} target="_blank" rel="noreferrer" className="card-modal__social card-modal__social--twitter" title="Share on X/Twitter">
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M13.5 1h-3.7L8 3.6 6.2 1H2.5L6.6 6.5 2.3 13h1.7l2.5-3.2L9 13h4.2l-4.5-6.7L13.5 1zm-1.1 11h-1L4.5 2h1l6.9 10z" />
            </svg>
          </a>
          <a href={shareLinks.facebook} target="_blank" rel="noreferrer" className="card-modal__social card-modal__social--facebook" title="Share on Facebook" aria-label="Share on Facebook">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M13.5 22v-9h3l.5-3.5h-3.5V7.25c0-1 .3-1.75 1.75-1.75H17V2.38A23.7 23.7 0 0014.44 2C11.9 2 10 3.55 10 6.4v3.1H7V13h3v9h3.5z" />
            </svg>
          </a>
          <button type="button" onClick={handleLinkedInShare} className="card-modal__social card-modal__social--linkedin" title="Copy caption and share on LinkedIn" aria-label="Copy caption and share on LinkedIn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </button>
          <a href={shareLinks.reddit} target="_blank" rel="noreferrer" className="card-modal__social card-modal__social--reddit" title="Share on Reddit">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.463.327.327 0 00-.462 0c-.545.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.205-.094z" />
            </svg>
          </a>
          {linkedinCopied && <span className="card-modal__share-status" role="status">Caption and tags copied. Paste them into your LinkedIn post.</span>}
        </div>
      </div>
    </div>
  );
}
