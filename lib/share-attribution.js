const CAMPAIGN = 'identity_card';
const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

function trackingParams(params = {}) {
  return TRACKING_KEYS.reduce((result, key) => {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) result.set(key, value.trim());
    return result;
  }, new URLSearchParams());
}

export function identityCardShareUrl(siteUrl, login, channel, version) {
  const url = new URL(`/share/${encodeURIComponent(login)}`, siteUrl);
  if (version) url.searchParams.set('v', version);
  url.searchParams.set('utm_source', channel);
  url.searchParams.set('utm_medium', channel === 'copy_link' ? 'referral' : 'social');
  url.searchParams.set('utm_campaign', CAMPAIGN);
  return url.toString();
}

export function developerInviteUrl(siteUrl, login, channel) {
  const url = new URL('/', siteUrl);
  url.searchParams.set('ref', login);
  url.searchParams.set('utm_source', channel);
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'developer_invite');
  return url.toString();
}

export function attributedGlobePath(login, params = {}) {
  const query = trackingParams(params);
  if (login) query.set('dev', login);
  const value = query.toString();
  return value ? `/?${value}` : '/';
}