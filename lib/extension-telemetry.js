import { createEngagementEvent } from './engagement.js';
import { getEngagementContainer, saveEngagementEvent } from './engagement-store.js';

export async function recordExtensionEvent(eventName, actorKey, properties = {}, options = {}) {
  const secret = options.secret || process.env.ENGAGEMENT_HASH_SECRET || process.env.SESSION_SECRET;
  const container = options.container === undefined ? getEngagementContainer() : options.container;
  if (!secret || !container || !actorKey) return false;

  const anonymousActor = `extension:${String(actorKey).trim().toLowerCase()}`;
  const event = createEngagementEvent({ eventName, properties }, {
    session: anonymousActor,
    privacyKey: anonymousActor,
    secret,
    now: options.now,
  });
  return saveEngagementEvent(container, event);
}