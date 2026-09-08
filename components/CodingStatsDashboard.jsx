'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import styles from './CodingStatsDashboard.module.css';

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';
const WEEKLY_GOAL_KEY = 'devglobe.codingStats.weeklyGoalHours';
const WEEKLY_GOALS = [5, 10, 20, 40];

function duration(seconds) {
  const minutes = Math.floor(Number(seconds || 0) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function Breakdown({ title, items }) {
  const maximum = Math.max(...items.map(item => item.seconds), 1);
  return (
    <section className={styles.breakdown} aria-labelledby={`${title.toLowerCase()}-title`}>
      <h2 id={`${title.toLowerCase()}-title`}>{title}</h2>
      {items.length ? items.map(item => (
        <div className={styles.breakdownRow} key={item.name}>
          <span>{item.name}</span>
          <i aria-hidden="true"><b style={{ width: `${Math.max(4, item.seconds / maximum * 100)}%` }} /></i>
          <strong>{duration(item.seconds)}</strong>
        </div>
      )) : <p>No activity recorded this week.</p>}
    </section>
  );
}

export default function CodingStatsDashboard() {
  const [status, setStatus] = useState('loading');
  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState('');
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(5);
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    track('coding_stats_viewed', { source: 'coding_dashboard' });
    const controller = new AbortController();
    fetch('/api/coding-stats', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) {
          const error = new Error(result.error || 'Unable to load coding stats');
          error.status = response.status;
          throw error;
        }
        setStats(result);
        setStatus('ready');
      })
      .catch(error => {
        if (error.name === 'AbortError') return;
        setMessage(error.message);
        setStatus(error.status === 401 ? 'signed-out' : 'error');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(WEEKLY_GOAL_KEY));
    if (WEEKLY_GOALS.includes(saved)) setWeeklyGoalHours(saved);
  }, []);

  function updateWeeklyGoal(event) {
    const hours = Number(event.target.value);
    if (!WEEKLY_GOALS.includes(hours)) return;
    setWeeklyGoalHours(hours);
    window.localStorage.setItem(WEEKLY_GOAL_KEY, String(hours));
  }

  async function shareSummary() {
    const channel = navigator.share ? 'native_share' : 'copy_link';
    const topLanguage = stats.languages[0]?.name;
    const text = `I coded ${duration(stats.weekSeconds)} this week${topLanguage ? `, led by ${topLanguage}` : ''}, with a ${stats.currentStreak}-day streak on DevGlobe.`;
    const url = `${window.location.origin}/space?utm_source=coding_stats_share&utm_medium=${channel}`;
    try {
      if (navigator.share) await navigator.share({ title: 'My DevGlobe coding week', text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      setShareStatus(channel === 'native_share' ? 'Shared' : 'Summary copied');
      track('coding_stats_shared', { source: 'coding_dashboard', channel });
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Unable to share');
    }
  }

  if (status === 'loading') return <main className={styles.state}><p>Loading your coding activity...</p></main>;
  if (status === 'signed-out') return (
    <main className={styles.state}>
      <h1>Your coding activity</h1>
      <p>Sign in with GitHub to view private coding totals collected while presence sharing is enabled.</p>
      <a className={styles.primaryAction} href="/api/auth/github">Sign in with GitHub</a>
      <Link href="/space">Back to the live globe</Link>
    </main>
  );
  if (status === 'error') return (
    <main className={styles.state}>
      <h1>Coding stats are unavailable</h1>
      <p>{message}</p>
      <Link className={styles.primaryAction} href="/space">Back to the live globe</Link>
    </main>
  );

  const hasActivity = stats.allSeconds > 0;
  const maximumDay = Math.max(...stats.timeline.map(day => day.seconds), 1);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/space" className={styles.brand}><img src="/devglobe.png" alt="" />DevGlobe</Link>
        <span>Private to @{stats.login}</span>
      </header>

      <section className={styles.intro}>
        <div>
          <p>Coding activity</p>
          <h1>Your time in motion</h1>
          <span>Calculated from opt-in presence heartbeats. No source code, files, repositories, branches, or keystrokes are collected.</span>
        </div>
        <div className={styles.introActions}>
          {hasActivity ? <button type="button" className={styles.primaryAction} onClick={shareSummary}>Share summary</button> : null}
          <a className={styles.secondaryAction} href={MARKETPLACE_URL} target="_blank" rel="noreferrer" onClick={() => track('extension_install_clicked', { source: 'coding_dashboard' })}>Manage extension</a>
          <span role="status" aria-live="polite">{shareStatus}</span>
        </div>
      </section>

      {!hasActivity ? (
        <section className={styles.empty}>
          <h2>Start your first tracked session</h2>
          <p>Install the extension, choose “DevGlobe.dev: Go Live on the Developer Globe,” and keep coding. Your first totals appear after the second heartbeat.</p>
          <a className={styles.primaryAction} href={MARKETPLACE_URL} target="_blank" rel="noreferrer" onClick={() => track('extension_install_clicked', { source: 'coding_dashboard_empty' })}>Install for VS Code</a>
        </section>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Coding time summary">
            <div><span>Today</span><strong>{duration(stats.todaySeconds)}</strong></div>
            <div><span>Last 7 days</span><strong>{duration(stats.weekSeconds)}</strong></div>
            <div><span>Last 30 days</span><strong>{duration(stats.monthSeconds)}</strong></div>
            <div><span>Current streak</span><strong>{stats.currentStreak}d</strong></div>
          </section>

          <section className={styles.activity} aria-labelledby="activity-title">
            <div><h2 id="activity-title">Last 30 days</h2><span>{duration(stats.monthSeconds)} total</span></div>
            <div className={styles.chart} role="img" aria-label={`Coding activity over the last 30 days, totaling ${duration(stats.monthSeconds)}`}>
              {stats.timeline.map(day => (
                <i key={day.day} title={`${day.day}: ${duration(day.seconds)}`}>
                  <b style={{ height: `${day.seconds ? Math.max(8, day.seconds / maximumDay * 100) : 2}%` }} />
                </i>
              ))}
            </div>
          </section>

          <section className={styles.momentum} aria-label="Weekly goal and achievements">
            <div className={styles.goal}>
              <div>
                <h2>Weekly goal</h2>
                <label>Target
                  <select value={weeklyGoalHours} onChange={updateWeeklyGoal}>
                    {WEEKLY_GOALS.map(hours => <option key={hours} value={hours}>{hours} hours</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.goalProgress}>
                <span>{duration(stats.weekSeconds)} of {weeklyGoalHours}h</span>
                <i role="progressbar" aria-label="Weekly coding goal" aria-valuemin="0" aria-valuemax={weeklyGoalHours * 3600} aria-valuenow={Math.min(stats.weekSeconds, weeklyGoalHours * 3600)}>
                  <b style={{ width: `${Math.min(100, stats.weekSeconds / (weeklyGoalHours * 3600) * 100)}%` }} />
                </i>
              </div>
            </div>
            <div className={styles.achievements}>
              <h2>Achievements</h2>
              <div>
                {stats.achievements.map(achievement => (
                  <article key={achievement.id} data-earned={achievement.earned}>
                    <span>{achievement.earned ? 'Earned' : 'In progress'}</span>
                    <strong>{achievement.title}</strong>
                    <p>{achievement.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <div className={styles.breakdowns}>
            <Breakdown title="Languages" items={stats.languages} />
            <Breakdown title="Editors" items={stats.editors} />
          </div>
        </>
      )}
    </main>
  );
}