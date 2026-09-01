// Best-effort abuse control for the badge endpoint. The CDN cache
// (Cache-Control: s-maxage) is the primary defense against hotlinking and
// scraping — most requests never reach this code because they're served
// from the edge. This limiter is a secondary guard against a single client
// hammering the origin (e.g. bypassing the cache with cache-busting query
// params) within one warm serverless instance. It intentionally does not
// use a shared store: it resets whenever the instance recycles, so it
// should not be relied on as the only protection.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const MAX_TRACKED_KEYS = 5_000;

const hits = new Map();

function firstHeaderValue(value) {
  return value?.split(',')[0].trim() || '';
}

/** Best-effort client identifier from proxy headers; falls back to a shared bucket. */
export function getClientKey(request) {
  const forwardedFor = firstHeaderValue(request.headers.get('x-forwarded-for'));
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Returns { limited: boolean, retryAfterSeconds } for the given key.
 * Uses a fixed-window counter, cheap and adequate for a soft origin guard.
 */
export function checkBadgeRateLimit(key) {
  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const bucketKey = `${key}:${windowStart}`;

  if (hits.size > MAX_TRACKED_KEYS) hits.clear();

  const count = (hits.get(bucketKey) || 0) + 1;
  hits.set(bucketKey, count);

  if (count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - now) / 1000);
    return { limited: true, retryAfterSeconds };
  }
  return { limited: false, retryAfterSeconds: 0 };
}
