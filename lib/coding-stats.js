import { LIVE_PRESENCE_TTL_SECONDS } from './live-presence.js';

export const CODING_STATS_RETENTION_DAYS = 400;

function utcDay(value) {
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString().slice(0, 10) : null;
}

function boundedDimension(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback;
}

export function buildCodingDelta(previous, current) {
  if (!previous || !current || previous.login !== current.login) return null;
  if (!previous.sessionStartedAt || previous.sessionStartedAt !== current.sessionStartedAt) return null;

  const startedAt = Date.parse(previous.lastHeartbeat || '');
  const endedAt = Date.parse(current.lastHeartbeat || '');
  const seconds = Math.floor((endedAt - startedAt) / 1000);
  const day = utcDay(current.lastHeartbeat);
  if (!day || day !== utcDay(previous.lastHeartbeat) || seconds <= 0 || seconds > LIVE_PRESENCE_TTL_SECONDS) return null;

  return {
    login: current.login,
    day,
    seconds,
    language: boundedDimension(previous.activeLanguage, 'Unknown'),
    editor: boundedDimension(previous.editor, 'Unknown'),
    updatedAt: current.lastHeartbeat,
  };
}

export function mergeCodingDay(document, delta) {
  const base = document || {
    id: `${delta.login}:${delta.day}`,
    type: 'coding-stats-day',
    login: delta.login,
    day: delta.day,
    activeSeconds: 0,
    heartbeatCount: 0,
    languages: {},
    editors: {},
    ttl: CODING_STATS_RETENTION_DAYS * 24 * 60 * 60,
  };
  return {
    ...base,
    activeSeconds: base.activeSeconds + delta.seconds,
    heartbeatCount: base.heartbeatCount + 1,
    languages: {
      ...base.languages,
      [delta.language]: (base.languages[delta.language] || 0) + delta.seconds,
    },
    editors: {
      ...base.editors,
      [delta.editor]: (base.editors[delta.editor] || 0) + delta.seconds,
    },
    updatedAt: delta.updatedAt,
  };
}

function sumDimensions(days, field) {
  const totals = {};
  for (const day of days) {
    for (const [name, seconds] of Object.entries(day[field] || {})) {
      totals[name] = (totals[name] || 0) + Number(seconds || 0);
    }
  }
  return Object.entries(totals)
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((left, right) => right.seconds - left.seconds || left.name.localeCompare(right.name));
}

export function buildCodingStats(documents, now = new Date()) {
  const currentDay = utcDay(now);
  const byDay = new Map(documents.map(document => [document.day, document]));
  const timeline = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(`${currentDay}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const day = utcDay(date);
    timeline.push({ day, seconds: Number(byDay.get(day)?.activeSeconds || 0) });
  }
  const last7Days = timeline.slice(-7);
  const recentDays = documents.filter(document => last7Days.some(item => item.day === document.day));
  const total = days => days.reduce((sum, day) => sum + Number(day.activeSeconds ?? day.seconds ?? 0), 0);

  let streak = 0;
  const cursor = new Date(`${currentDay}T00:00:00.000Z`);
  if (!byDay.get(currentDay)?.activeSeconds) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (byDay.get(utcDay(cursor))?.activeSeconds > 0) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    todaySeconds: Number(byDay.get(currentDay)?.activeSeconds || 0),
    weekSeconds: total(last7Days),
    monthSeconds: total(timeline),
    allSeconds: total(documents),
    currentStreak: streak,
    languages: sumDimensions(recentDays, 'languages').slice(0, 5),
    editors: sumDimensions(recentDays, 'editors').slice(0, 5),
    timeline,
  };
}