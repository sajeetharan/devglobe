import { getCosmosContainer } from './cosmos.js';

const QUOTA_ID = 'github-refresh-quota';
const WINDOW_MS = 60 * 1000;
const MAX_REFRESHES = 4;
const MISSION_LEASE_MS = 30 * 1000;

export function getContributionOpportunityStateContainer() {
  return getCosmosContainer(process.env.COSMOS_CONTRIBUTION_STATE_CONTAINER || 'contribution-opportunity-state');
}

export async function reserveGlobalRecommendationRefresh(container, now = new Date()) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let current;
    try {
      ({ resource: current } = await container.item(QUOTA_ID, QUOTA_ID).read());
    } catch (error) {
      if (error.code !== 404 && error.statusCode !== 404) throw error;
    }
    const timestamps = (current?.timestamps || []).filter(timestamp => Date.parse(timestamp) > now.getTime() - WINDOW_MS);
    if (timestamps.length >= MAX_REFRESHES) {
      return Math.max(1, Math.ceil((Date.parse(timestamps[0]) + WINDOW_MS - now.getTime()) / 1000));
    }
    const next = { id: QUOTA_ID, timestamps: [...timestamps, now.toISOString()] };
    try {
      if (current) {
        await container.item(QUOTA_ID, QUOTA_ID).replace(next, {
          accessCondition: { type: 'IfMatch', condition: current._etag },
        });
      } else {
        await container.items.create(next);
      }
      return 0;
    } catch (error) {
      if (![409, 412].includes(error.code) && ![409, 412].includes(error.statusCode)) throw error;
    }
  }
  return 1;
}

export async function acquireDailyMissionLease(container, login, day, now = new Date()) {
  const id = `daily-mission:${String(login).toLowerCase()}`;
  let current;
  try {
    ({ resource: current } = await container.item(id, id).read());
  } catch (error) {
    if (error.code !== 404 && error.statusCode !== 404) throw error;
  }
  if (current && Date.parse(current.expiresAt) > now.getTime()) return false;
  const lease = { id, documentType: 'daily-mission-lease', day, expiresAt: new Date(now.getTime() + MISSION_LEASE_MS).toISOString() };
  try {
    if (current) {
      await container.item(id, id).replace(lease, { accessCondition: { type: 'IfMatch', condition: current._etag } });
    } else {
      await container.items.create(lease);
    }
    return true;
  } catch (error) {
    if ([409, 412].includes(error.code) || [409, 412].includes(error.statusCode)) return false;
    throw error;
  }
}