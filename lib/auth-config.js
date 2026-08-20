export const SESSION_COOKIE_NAME = 'devglobe_session_v2';

// Older deployments issued this cookie name; still honor it so existing logins
// are recognized without forcing a re-login.
export const LEGACY_SESSION_COOKIE_NAMES = ['devglobe_session'];

export function selectSessionToken(getCookieValue) {
  for (const name of [SESSION_COOKIE_NAME, ...LEGACY_SESSION_COOKIE_NAMES]) {
    const value = getCookieValue(name);
    if (value) return value;
  }
  return null;
}

export function resolveSessionCookieDomain(siteUrl, production = false) {
  if (!production) return undefined;

  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice(4) : undefined;
  } catch {
    return undefined;
  }
}
