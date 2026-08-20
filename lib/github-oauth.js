const GITHUB_LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function resolveGitHubCallbackBaseUrl(requestUrl, siteUrl, production = false) {
  if (!production) return new URL(requestUrl).origin;

  try {
    return new URL(siteUrl).origin;
  } catch {
    return new URL(requestUrl).origin;
  }
}

export function buildGitHubAuthorizationUrl(clientId, login = '') {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', 'read:user user:email');
  if (GITHUB_LOGIN_RE.test(login)) url.searchParams.set('login', login);
  return url.toString();
}