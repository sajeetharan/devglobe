import { buildOutreachMessage, selectActivationCandidates } from './activation-campaign.js';
import { getSiteUrl } from './site.js';

export const MAINTAINER_OUTREACH_LIMIT = 10;
export const MAINTAINER_OUTREACH_MAX_ATTEMPTS = 2;
export const MAINTAINER_OUTREACH_FOLLOW_UP_DAYS = 4;

function loginOf(value) {
  return String(value || '').trim().toLowerCase();
}

function profileUrl(developer, siteUrl) {
  return `${siteUrl}/developer/${encodeURIComponent(developer.login)}?utm_source=manual_outreach&utm_medium=community&utm_campaign=developer_activation`;
}

function followUpMessage(developer, siteUrl) {
  const name = String(developer.name || developer.login).trim();
  return `Hi ${name}, one quick follow-up about your DevGlobe profile: ${profileUrl(developer, siteUrl)}\n\nIf it is not useful, no reply is needed and I will not follow up again. Feedback is welcome.`;
}

function isFollowUpDue(record, now) {
  return record?.status === 'sent'
    && record.attempt < MAINTAINER_OUTREACH_MAX_ATTEMPTS
    && record.followUpDueAt
    && record.followUpDueAt <= now.toISOString();
}

export function selectMaintainerOutreachDrafts({ developers = [], records = [], now = new Date(), limit = MAINTAINER_OUTREACH_LIMIT, siteUrl = getSiteUrl() } = {}) {
  const recordsByLogin = new Map(records.map(record => [loginOf(record.login), record]));
  const candidates = selectActivationCandidates(developers, developers.length);
  const drafts = [];

  for (const developer of candidates) {
    const login = loginOf(developer.login);
    const existing = recordsByLogin.get(login);
    if (existing && !isFollowUpDue(existing, now)) continue;
    const attempt = existing ? existing.attempt + 1 : 1;
    drafts.push({
      id: login,
      login,
      documentType: 'maintainer-outreach',
      status: 'pending',
      attempt,
      delivery: 'manual_review_only',
      selectedAt: now.toISOString(),
      profileUrl: profileUrl(developer, siteUrl),
      message: attempt === 1
        ? buildOutreachMessage(developer, siteUrl)
        : followUpMessage(developer, siteUrl),
    });
    if (drafts.length >= Math.max(0, limit)) break;
  }

  return drafts;
}

export function followUpDueAt(sentAt) {
  const due = new Date(sentAt);
  due.setUTCDate(due.getUTCDate() + MAINTAINER_OUTREACH_FOLLOW_UP_DAYS);
  return due.toISOString();
}

export function summarizeMaintainerOutreach(records = [], engagementEvents = []) {
  const contacted = new Set(records
    .filter(record => record.status === 'sent' || record.attempt > 1 || record.attemptHistory?.length)
    .map(record => loginOf(record.login)));
  const viewed = new Set(engagementEvents.filter(event => event.eventName === 'profile_viewed').map(event => loginOf(event.targetLogin)));
  const claimed = new Set(engagementEvents.filter(event => event.eventName === 'profile_claimed').map(event => loginOf(event.targetLogin)));
  return {
    selected: records.length,
    pending: records.filter(record => record.status === 'pending').length,
    approved: records.filter(record => record.status === 'approved').length,
    contacted: contacted.size,
    profileViewed: [...viewed].filter(login => contacted.has(login)).length,
    claimed: [...claimed].filter(login => contacted.has(login)).length,
  };
}