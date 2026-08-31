import { createHmac, timingSafeEqual } from 'node:crypto';

export const ENGAGEMENT_EVENTS = new Set([
  'activation_action_selected',
  'activation_completed',
  'activation_started',
  'card_generated',
  'comparison_started',
  'mission_accepted',
  'mission_completed',
  'mission_exhausted',
  'mission_onboarding_completed',
  'mission_passed',
  'mission_preview_requested',
  'mission_preview_shown',
  'mission_preview_signin_selected',
  'mission_unavailable',
  'mission_viewed',
  'next_action_selected',
  'profile_primary_action_viewed',
  'profile_shared',
  'profile_claimed',
  'profile_viewed',
  'personalized_profile_viewed',
  'recommendation_opened',
  'search_appearance',
  'session_restored',
]);

export const ENGAGEMENT_RETENTION_DAYS = 180;
export const ENGAGEMENT_DEDUPLICATION_MS = 30 * 60 * 1000;
export const INSIGHTS_PRIVACY_THRESHOLD = 3;
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const BOT_PATTERN = /bot|crawler|spider|preview|slurp|facebookexternalhit|linkedinbot|twitterbot|whatsapp|discordbot/i;
const ALLOWED_PROPERTIES = new Set(['action', 'channel', 'journey', 'source']);

export class EngagementValidationError extends Error {}

export function isAutomatedUserAgent(userAgent) {
  return !userAgent || BOT_PATTERN.test(String(userAgent));
}

function normalizeTargetLogin(value) {
  const login = String(value || '').trim().toLowerCase();
  if (!login) return null;
  if (!LOGIN_PATTERN.test(login)) throw new EngagementValidationError('Invalid target login');
  return login;
}

function normalizeProperties(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new EngagementValidationError('Invalid event properties');
  }
  const properties = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (typeof rawValue !== 'string') throw new EngagementValidationError(`Invalid ${key}`);
    const normalized = rawValue.trim().slice(0, 40);
    if (normalized) properties[key] = normalized;
  }
  return properties;
}

export function normalizeEngagementEvent(input) {
  const eventName = String(input?.eventName || '').trim();
  if (!ENGAGEMENT_EVENTS.has(eventName)) throw new EngagementValidationError('Unsupported engagement event');
  const targetLogin = normalizeTargetLogin(input.targetLogin);
  if (['activation_completed', 'card_generated', 'personalized_profile_viewed', 'profile_claimed', 'profile_primary_action_viewed', 'profile_shared', 'profile_viewed', 'search_appearance'].includes(eventName) && !targetLogin) {
    throw new EngagementValidationError('Target login is required');
  }
  return { eventName, targetLogin, properties: normalizeProperties(input.properties) };
}

export function createEngagementEvent(input, options = {}) {
  const normalized = normalizeEngagementEvent(input);
  const now = options.now ? new Date(options.now) : new Date();
  const secret = String(options.secret || 'development-engagement-secret');
  const session = String(options.session || '');
  if (!session) throw new EngagementValidationError('Session is required');
  const sessionHash = createHmac('sha256', secret).update(session).digest('base64url');
  const privacyHash = createHmac('sha256', secret).update(`privacy:${options.privacyKey || 'unknown'}`).digest('base64url');
  const window = Math.floor(now.getTime() / ENGAGEMENT_DEDUPLICATION_MS);
  const qualifier = normalized.eventName === 'profile_shared'
    ? normalized.properties.channel || ''
    : ['next_action_selected', 'profile_primary_action_viewed'].includes(normalized.eventName)
      ? normalized.properties.action || ''
      : normalized.eventName === 'recommendation_opened'
        ? normalized.properties.journey || ''
        : '';
  const eventKey = [sessionHash, normalized.eventName, normalized.targetLogin || '', qualifier, window].join(':');
  const id = createHmac('sha256', secret).update(eventKey).digest('base64url');
  const day = now.toISOString().slice(0, 10);

  return {
    id,
    documentType: 'engagement-event',
    day,
    createdAt: now.toISOString(),
    eventName: normalized.eventName,
    targetLogin: normalized.targetLogin,
    partitionKey: normalized.targetLogin || `day:${day}`,
    sessionHash,
    privacyHash,
    properties: normalized.properties,
    actorType: 'human',
    ttl: ENGAGEMENT_RETENTION_DAYS * 24 * 60 * 60,
    schemaVersion: 1,
  };
}

export function resolveEngagementSession(cookieValue, secret, createId) {
  const [id, signature] = String(cookieValue || '').split('.');
  if (id && signature) {
    const expected = createHmac('sha256', secret).update(id).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)) {
      return { id, cookieValue: null };
    }
  }
  const newId = createId();
  const newSignature = createHmac('sha256', secret).update(newId).digest('base64url');
  return { id: newId, cookieValue: `${newId}.${newSignature}` };
}

export function aggregateDailyMissionMetrics(events, { now = new Date(), days = 7, threshold = INSIGHTS_PRIVACY_THRESHOLD } = {}) {
  const end = new Date(now);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const missionEvents = events.filter(event => event.eventName?.startsWith('mission_')
    && Date.parse(event.createdAt) >= start.getTime()
    && Date.parse(event.createdAt) < end.getTime());
  const sessionsFor = eventName => new Set(missionEvents
    .filter(event => event.eventName === eventName)
    .map(event => event.sessionHash)
    .filter(Boolean));
  const viewed = sessionsFor('mission_viewed');
  const accepted = sessionsFor('mission_accepted');
  const passed = sessionsFor('mission_passed');
  const completed = sessionsFor('mission_completed');
  const unavailable = sessionsFor('mission_unavailable');
  const exhausted = sessionsFor('mission_exhausted');
  const attempted = new Set([...viewed, ...unavailable, ...exhausted]);
  const available = new Set([...viewed, ...exhausted]);
  const viewedDays = new Map();
  for (const event of missionEvents.filter(event => event.eventName === 'mission_viewed' && event.sessionHash)) {
    if (!viewedDays.has(event.sessionHash)) viewedDays.set(event.sessionHash, new Set());
    viewedDays.get(event.sessionHash).add(event.createdAt.slice(0, 10));
  }
  const returningSessions = [...viewedDays.values()].filter(sessionDays => sessionDays.size >= 2).length;
  const visible = count => count >= threshold ? count : null;
  const rate = (numerator, denominator) => numerator >= threshold && denominator >= threshold ? numerator / denominator : null;
  const uniqueViewers = visible(viewed.size);
  const uniqueAcceptors = visible(accepted.size);
  const uniquePassers = visible(passed.size);
  const uniqueCompleters = visible(completed.size);
  const visibleReturningSessions = visible(returningSessions);
  return {
    days,
    privacyThreshold: threshold,
    suppressed: [uniqueViewers, uniqueAcceptors, uniquePassers, uniqueCompleters, visibleReturningSessions].some(value => value === null),
    uniqueViewers,
    uniqueAcceptors,
    uniquePassers,
    uniqueCompleters,
    acceptanceRate: rate(accepted.size, viewed.size),
    passRate: rate(passed.size, viewed.size),
    completionRate: rate(completed.size, accepted.size),
    availabilityRate: rate(available.size, attempted.size),
    exhaustedPoolRate: rate(exhausted.size, attempted.size),
    returningSessions: visibleReturningSessions,
    returningUserRate: rate(returningSessions, viewed.size),
  };
}

function metric(events, eventNames, start, end, threshold) {
  const matching = events.filter(event => eventNames.includes(event.eventName)
    && Date.parse(event.createdAt) >= start.getTime()
    && Date.parse(event.createdAt) < end.getTime());
  const uniqueSessions = new Set(matching.map(event => event.privacyHash || event.sessionHash)).size;
  return {
    value: uniqueSessions >= threshold ? matching.length : null,
    uniqueSessions: uniqueSessions >= threshold ? uniqueSessions : null,
    suppressed: uniqueSessions < threshold,
  };
}

export function aggregateProfileInsights(events, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const threshold = options.threshold ?? INSIGHTS_PRIVACY_THRESHOLD;
  const definitions = {
    profileViews: ['profile_viewed'],
    searchAppearances: ['search_appearance'],
    cardGenerations: ['card_generated'],
    shareActions: ['profile_shared'],
  };

  return {
    privacyThreshold: threshold,
    retentionDays: ENGAGEMENT_RETENTION_DAYS,
    periods: [7, 30, 90].map(days => {
      const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);
      const metrics = {};
      for (const [name, eventNames] of Object.entries(definitions)) {
        const current = metric(events, eventNames, currentStart, now, threshold);
        const previous = metric(events, eventNames, previousStart, currentStart, threshold);
        metrics[name] = {
          ...current,
          previousValue: previous.value,
          change: current.value != null && previous.value != null ? current.value - previous.value : null,
        };
      }
      return { days, metrics };
    }),
  };
}

export function isVerifiedProfileOwner(session, developer) {
  return Boolean(session?.login
    && developer?.claimed === true
    && String(session.login).toLowerCase() === String(developer.login || '').toLowerCase());
}