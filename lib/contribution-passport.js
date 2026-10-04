import { parseMissionIssueUrl } from './github-issue-url.js';
import { contributionGuideUrl } from './contribution-task.js';

export const SAVED_CONTRIBUTION_KEY = 'devglobe-saved-contribution:v1';
export const SAVED_CONTRIBUTION_EVENT = 'devglobe-saved-contribution-changed';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function savedContribution(opportunity, now = Date.now()) {
  const issue = parseMissionIssueUrl(opportunity?.url);
  if (!issue || !opportunity?.id || !opportunity?.title) throw new Error('This contribution cannot be saved: invalid issue details');
  const repository = `${issue.owner}/${issue.repository}`;
  return {
    version: 1, id: String(opportunity.id).slice(0, 120),
    title: String(opportunity.title).replace(/[\r\n]/g, ' ').slice(0, 240),
    url: `https://github.com/${repository}/issues/${issue.issueNumber}`,
    repository, savedAt: now,
    contributionGuideUrl: contributionGuideUrl({}, { full_name: repository }, opportunity.contributionGuideUrl),
    guideRead: false, started: false,
  };
}

export function parseSavedContribution(value, now = Date.now()) {
  if (!value) return null;
  const item = JSON.parse(value);
  if (item?.version !== 1 || !Number.isFinite(item.savedAt) || item.savedAt > now || now - item.savedAt > MAX_AGE_MS) {
    throw new Error('Your saved contribution has expired or is invalid. Remove it and save a fresh issue.');
  }
  return {
    ...savedContribution(item, item.savedAt),
    guideRead: item.guideRead === true, started: item.started === true,
  };
}

function calendarText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/[\r\n]+/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function calendarDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldCalendarLine(line) {
  const encoder = new TextEncoder();
  let current = '';
  let bytes = 0;
  const lines = [];
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      lines.push(current);
      current = ' ';
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  return [...lines, current].join('\r\n');
}

export function contributionReminder(opportunity, when, now = new Date()) {
  if (!parseMissionIssueUrl(opportunity?.url)) throw new Error('Invalid contribution reminder issue');
  const start = new Date(when);
  if (!Number.isFinite(start.getTime()) || start <= now || start.getTime() - now.getTime() > 366 * 86400000) {
    throw new Error('Choose a reminder time in the next year');
  }
  const url = opportunity.url;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DevGlobe//Contribution Passport//EN',
    'BEGIN:VEVENT', `UID:${calendarDate(start)}-${encodeURIComponent(url)}@devglobe.dev`,
    `DTSTAMP:${calendarDate(now)}`, `DTSTART:${calendarDate(start)}`,
    `DTEND:${calendarDate(new Date(start.getTime() + 15 * 60000))}`,
    `SUMMARY:${calendarText('Continue your open-source contribution')}`,
    `DESCRIPTION:${calendarText(`${opportunity.title}\n${url}\nResume: https://www.devglobe.dev/?feature=today\nCheck current issue availability before starting. This calendar event does not reserve an issue.`)}`,
    `URL:${calendarText(url)}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY',
    'DESCRIPTION:Continue your contribution', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldCalendarLine).join('\r\n');
}

export function reminderPreset(preset, now = new Date()) {
  const when = new Date(now);
  if (preset === 'tomorrow') when.setDate(when.getDate() + 1);
  else if (preset === 'weekend') {
    when.setDate(when.getDate() + ((6 - when.getDay() + 7) % 7 || 7));
    when.setHours(9, 0, 0, 0);
  } else throw new Error('Choose a supported reminder time');
  return when;
}
