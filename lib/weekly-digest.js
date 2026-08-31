import { createHmac, timingSafeEqual } from 'node:crypto';
import { getCosmosContainer } from './cosmos.js';
import {
  iterateWeeklyDigestContacts,
  recordWeeklyDigestBaseline,
  recordWeeklyDigestDelivery,
} from './developer-contact-store.js';
import { addDeveloperRanks } from './ranking.js';
import { scoreAll } from './scoring.js';
import { getSiteUrl } from './site.js';
import { sendLifecycleEmail } from './lifecycle-email.js';

const REPOSITORY_URL = 'https://github.com/sajeetharan/devglobe';
const TAGLINE = 'Where Developers and AI Agents Connect';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getDigestWeekKey(date = new Date()) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function preferenceSecret() {
  return process.env.EMAIL_PREFERENCE_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || '';
}

export function createDigestPreferenceToken(login, secret = preferenceSecret()) {
  if (!login || !secret) return null;
  return createHmac('sha256', secret).update(String(login).toLowerCase()).digest('base64url');
}

export function verifyDigestPreferenceToken(login, token, secret = preferenceSecret()) {
  const expected = createDigestPreferenceToken(login, secret);
  if (!expected || !token || expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

function rankMovement(currentRank, previousRank) {
  if (!Number.isInteger(previousRank)) return 'This is your first weekly ranking snapshot.';
  const change = previousRank - currentRank;
  if (change > 0) return `You moved up ${change} place${change === 1 ? '' : 's'} this week.`;
  if (change < 0) return `Your rank changed by ${Math.abs(change)} place${change === -1 ? '' : 's'} this week.`;
  return 'Your global rank held steady this week.';
}

export function selectWeeklyDigestUpdate({ developer, previousRank, pendingIntroductionCount = 0, now = new Date() }) {
  if (pendingIntroductionCount > 0) {
    return { type: 'introduction_request', count: pendingIntroductionCount };
  }

  const mission = developer?.dailyMission;
  const missionAge = Date.parse(mission?.day);
  const missionIsFresh = Number.isFinite(missionAge)
    && missionAge >= now.getTime() - (7 * 24 * 60 * 60 * 1000);
  if (missionIsFresh && ['offered', 'accepted'].includes(mission.status) && mission.opportunity?.url) {
    return { type: 'contribution_opportunity', opportunity: mission.opportunity };
  }

  if (!Number.isInteger(previousRank)) return null;
  if (developer?.globalRank !== previousRank) return { type: 'rank_movement' };
  return null;
}

function addDigestBranding(message, login) {
  const siteUrl = getSiteUrl();
  const logoUrl = `${siteUrl}/devglobe.png`;
  const cardUrl = `${siteUrl}/share/${encodeURIComponent(login)}`;
  const inviteUrl = `${siteUrl}/?ref=${encodeURIComponent(login)}`;
  const brandHeader = `<tr><td style="padding:24px 32px 12px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px"><img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="DevGlobe" style="display:block;width:48px;height:48px;object-fit:contain;border:0"></td><td><strong style="display:block;font-size:18px;line-height:1.2">DevGlobe</strong><span style="color:#5c6b62;font-size:12px;line-height:1.4">${TAGLINE}</span></td></tr></table></td></tr>`;
  const secondaryActions = `<div style="margin-top:10px"><a href="${escapeHtml(cardUrl)}" style="display:inline-block;margin-right:8px;color:#117a4b;padding:10px 13px;border:1px solid #117a4b;text-decoration:none;font-weight:700">Generate identity card</a><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;margin-right:8px;color:#117a4b;padding:10px 13px;border:1px solid #117a4b;text-decoration:none;font-weight:700">Invite a developer</a><a href="${REPOSITORY_URL}" style="display:inline-block;color:#17211b;padding:10px 13px;border:1px solid #9aa8a0;text-decoration:none;font-weight:700">Star the repo</a></div>`;
  return {
    ...message,
    text: `DevGlobe - ${TAGLINE}\n\n${message.text}\n\nGenerate identity card: ${cardUrl}\nInvite a developer: ${inviteUrl}\nStar DevGlobe on GitHub: ${REPOSITORY_URL}`,
    html: message.html
      .replace('<tr><td style="padding:28px 32px 8px">', `${brandHeader}<tr><td style="padding:12px 32px 8px">`)
      .replace('</a></td></tr><tr><td style="padding:20px 32px;border-top', `</a>${secondaryActions}</td></tr><tr><td style="padding:20px 32px;border-top`),
  };
}

function buildWeeklyDigestTemplate({ developer, previousRank, unsubscribeUrl }) {
  const siteUrl = getSiteUrl();
  const profileUrl = `${siteUrl}/developer/${encodeURIComponent(developer.login)}`;
  const movement = rankMovement(developer.globalRank, previousRank);
  const locationRank = developer.countryRank
    ? `<td style="padding:16px;border-left:1px solid #dce5df"><strong style="display:block;font-size:24px">#${developer.countryRank}</strong><span style="color:#5c6b62;font-size:12px">${escapeHtml(developer.country)} rank</span></td>`
    : '';
  const unsubscribe = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#5c6b62">Unsubscribe from weekly emails</a>`
    : 'Manage weekly emails from your DevGlobe user menu.';

  const message = {
    subject: `Your weekly DevGlobe rank: #${developer.globalRank}`,
    text: `Hi ${developer.name || developer.login},\n\nYour global rank is #${developer.globalRank} of ${developer.globalTotal}. ${movement}\n\nWhat's new on DevGlobe:\n- Rankings now reflect the latest indexed developer activity.\n- Claimed profiles can share AI collaboration preferences.\n- Agent introduction requests connect developers and AI agents.\n\nExplore DevGlobe: ${profileUrl}\n\n${unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : 'Manage weekly emails from your DevGlobe user menu.'}`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f3f6f4;color:#17211b;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f4;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce5df"><tr><td style="padding:28px 32px 8px"><span style="color:#117a4b;font-size:12px;font-weight:700;text-transform:uppercase">Your week on DevGlobe</span><h1 style="margin:8px 0 0;font-size:28px">Hi ${escapeHtml(developer.name || developer.login)}</h1></td></tr><tr><td style="padding:16px 32px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce5df"><tr><td style="padding:16px"><strong style="display:block;font-size:24px">#${developer.globalRank}</strong><span style="color:#5c6b62;font-size:12px">Global rank of ${developer.globalTotal}</span></td>${locationRank}<td style="padding:16px;border-left:1px solid #dce5df"><strong style="display:block;font-size:24px">${developer.score}</strong><span style="color:#5c6b62;font-size:12px">Relative score</span></td></tr></table><p style="font-size:15px;line-height:1.6">${escapeHtml(movement)}</p></td></tr><tr><td style="padding:4px 32px 24px"><h2 style="font-size:19px">What's new on DevGlobe</h2><ul style="padding-left:20px;font-size:15px;line-height:1.7"><li>Rankings reflect the latest indexed developer activity.</li><li>Claimed profiles can share AI collaboration preferences.</li><li>Agent introduction requests connect developers and AI agents.</li></ul><a href="${escapeHtml(profileUrl)}" style="display:inline-block;background:#117a4b;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Explore DevGlobe</a></td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e7ece9;color:#5c6b62;font-size:12px;line-height:1.5">You receive this because you opted in to weekly DevGlobe updates.<br>${unsubscribe}</td></tr></table></td></tr></table></body></html>`,
    ...(unsubscribeUrl ? {
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    } : {}),
  };
  return addDigestBranding(message, developer.login);
}

function digestDestination(developer, update, weekKey) {
  const path = update.type === 'introduction_request'
    ? '/?open=introductions'
    : update.type === 'contribution_opportunity'
      ? '/?open=contributions'
      : `/developer/${encodeURIComponent(developer.login)}`;
  const url = new URL(path, getSiteUrl());
  url.searchParams.set('utm_source', 'weekly_digest');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', 'weekly_impact');
  url.searchParams.set('utm_content', update.type);
  url.searchParams.set('utm_term', weekKey);
  return url.toString();
}

function digestUpdateContent(developer, previousRank, update) {
  if (update.type === 'introduction_request') {
    const requests = `${update.count} pending introduction request${update.count === 1 ? '' : 's'}`;
    return { heading: 'An agent wants to connect', detail: `You have ${requests} waiting for your review.`, action: 'Review requests' };
  }
  if (update.type === 'contribution_opportunity') {
    return { heading: 'A contribution opportunity is ready', detail: update.opportunity.title, action: 'Review opportunity' };
  }
  return {
    heading: 'Your ranking changed',
    detail: `Your global rank is #${developer.globalRank} of ${developer.globalTotal}. ${rankMovement(developer.globalRank, previousRank)}`,
    action: 'View impact history',
  };
}

export function buildWeeklyDigestEmail({ developer, previousRank, unsubscribeUrl, update, weekKey = getDigestWeekKey() }) {
  const content = digestUpdateContent(developer, previousRank, update);
  const destination = digestDestination(developer, update, weekKey);
  const template = buildWeeklyDigestTemplate({ developer, previousRank, unsubscribeUrl });
  const updateHtml = `<h2 style="font-size:19px">${escapeHtml(content.heading)}</h2><p style="font-size:15px;line-height:1.7">${escapeHtml(content.detail)}</p>`;
  return {
    ...template,
    subject: update.type === 'rank_movement'
      ? `Your weekly DevGlobe rank: #${developer.globalRank}`
      : `${content.heading}: ${developer.name || developer.login}`,
    text: `Hi ${developer.name || developer.login},\n\n${content.heading}\n${content.detail}\n\n${content.action}: ${destination}\n\n${unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : 'Manage weekly emails from your DevGlobe user menu.'}`,
    html: template.html
      .replace(/<h2 style="font-size:19px">What's new on DevGlobe<\/h2><ul[\s\S]*?<\/ul>/, updateHtml)
      .replace(/href="[^"]+" style="display:inline-block;background:#117a4b/, `href="${escapeHtml(destination)}" style="display:inline-block;background:#117a4b`)
      .replace('>Explore DevGlobe</a>', `>${escapeHtml(content.action)}</a>`),
  };
}

export async function loadPendingIntroductionCounts(options = {}) {
  const container = options.container === undefined
    ? getCosmosContainer(process.env.COSMOS_INTRODUCTIONS_CONTAINER || 'agent-introductions')
    : options.container;
  if (!container) return new Map();
  try {
    const { resources = [] } = await container.items.query({
      query: `SELECT VALUE c.developerLogin FROM c WHERE c.status = "pending" AND c.expiresAt > @now`,
      parameters: [{ name: '@now', value: (options.now || new Date()).toISOString() }],
    }).fetchAll();
    return resources.reduce((counts, login) => {
      const key = String(login || '').toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
  } catch {
    return new Map();
  }
}

export async function loadWeeklyRankings(options = {}) {
  const container = options.container || getCosmosContainer(process.env.COSMOS_CONTAINER || 'developers');
  if (!container) throw new Error('Developer data is not configured');
  const { resources } = await container.items.query(`SELECT c.login, c.name, c.location, c.totalStars, c.totalForks, c.totalWatchers, c.totalCommits, c.followers, c.soUserId, c.soReputation, c.soAnswers, c.soAcceptRate, c.soBadges, c.dailyMission FROM c WHERE NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved'`).fetchAll();
  return addDeveloperRanks(scoreAll(resources));
}

export async function sendWeeklyDigests(options = {}) {
  const now = options.now || new Date();
  const sentAt = now.toISOString();
  const weekKey = getDigestWeekKey(now);
  const developers = options.developers || await loadWeeklyRankings({ container: options.developersContainer });
  const developerByLogin = new Map(developers.map(developer => [developer.login.toLowerCase(), developer]));
  const contacts = options.contacts || iterateWeeklyDigestContacts({ container: options.contactsContainer });
  const pendingIntroductionCounts = options.pendingIntroductionCounts || await loadPendingIntroductionCounts({
    container: options.introductionsContainer,
    now,
  });
  const sendEmail = options.sendEmail || sendLifecycleEmail;
  const recordBaseline = options.recordBaseline || ((login, rank) => recordWeeklyDigestBaseline(login, rank, {
    container: options.contactsContainer,
    now: sentAt,
  }));
  const recordDelivery = options.recordDelivery || ((login, delivery) => recordWeeklyDigestDelivery(login, delivery, { container: options.contactsContainer }));
  const summary = {
    eligible: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    providerAccepted: 0,
    providerFailed: 0,
    reasons: {
      alreadySent: 0,
      baselineCreated: 0,
      missingDeveloper: 0,
      noMeaningfulUpdate: 0,
      missingRecipient: 0,
      providerNotConfigured: 0,
      providerRejected: 0,
      deliveryRecordFailed: 0,
    },
  };

  for await (const contact of contacts) {
    summary.eligible += 1;
    if (contact.lastWeeklyDigestWeek === weekKey) {
      summary.skipped += 1;
      summary.reasons.alreadySent += 1;
      continue;
    }
    const developer = developerByLogin.get(contact.login.toLowerCase());
    if (!developer) {
      summary.skipped += 1;
      summary.reasons.missingDeveloper += 1;
      continue;
    }
    const update = selectWeeklyDigestUpdate({
      developer,
      previousRank: contact.lastWeeklyDigestRank,
      pendingIntroductionCount: pendingIntroductionCounts.get(contact.login.toLowerCase()) || 0,
      now,
    });
    if (!Number.isInteger(contact.lastWeeklyDigestRank) && !update) {
      try {
        await recordBaseline(contact.login, developer.globalRank);
        summary.skipped += 1;
        summary.reasons.baselineCreated += 1;
      } catch {
        summary.failed += 1;
        summary.reasons.deliveryRecordFailed += 1;
      }
      continue;
    }
    if (!update) {
      summary.skipped += 1;
      summary.reasons.noMeaningfulUpdate += 1;
      continue;
    }

    const token = createDigestPreferenceToken(contact.login, options.preferenceSecret);
    const unsubscribeUrl = token
      ? `${getSiteUrl()}/api/contact/unsubscribe?login=${encodeURIComponent(contact.login)}&token=${encodeURIComponent(token)}`
      : null;
    try {
      const delivery = await sendEmail({
        to: contact.email,
        message: buildWeeklyDigestEmail({ developer, previousRank: contact.lastWeeklyDigestRank, unsubscribeUrl, update, weekKey }),
        idempotencyKey: `weekly-digest-${contact.id}-${weekKey}`,
      });
      if (!delivery.sent) {
        summary.failed += 1;
        summary.providerFailed += 1;
        if (delivery.reason === 'missing_recipient') summary.reasons.missingRecipient += 1;
        else summary.reasons.providerNotConfigured += 1;
        continue;
      }
      summary.providerAccepted += 1;
    } catch {
      summary.failed += 1;
      summary.providerFailed += 1;
      summary.reasons.providerRejected += 1;
      continue;
    }

    try {
      await recordDelivery(contact.login, { rank: developer.globalRank, weekKey, sentAt, updateType: update.type });
      summary.sent += 1;
    } catch {
      summary.failed += 1;
      summary.reasons.deliveryRecordFailed += 1;
    }
  }

  return summary;
}