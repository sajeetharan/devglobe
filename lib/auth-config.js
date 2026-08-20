export const SESSION_COOKIE_NAME = 'devglobe_session_v2';

export function resolveSessionCookieDomain(siteUrl, production = false) {
  if (!production) return undefined;

  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice(4) : undefined;
  } catch {
    return undefined;
  }
}
