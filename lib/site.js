const DEFAULT_SITE_URL = 'https://www.devglobe.dev';
export const SOCIAL_PREVIEW_VERSION = '11';
export const IDENTITY_CARD_VERSION = '5';

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) return DEFAULT_SITE_URL;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(configuredUrl)
    ? configuredUrl
    : `https://${configuredUrl}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return DEFAULT_SITE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getSiteHostname() {
  return new URL(getSiteUrl()).hostname;
}