const ATTRIBUTION = Object.freeze({
  utm_source: 'vscode_extension',
  utm_medium: 'marketplace',
});
const CODING_ACTIVITY_WINDOW_MS = 60_000;

function isCodingActivityRecent(lastActivityAt, now = Date.now()) {
  return Number.isFinite(lastActivityAt)
    && now >= lastActivityAt
    && now - lastActivityAt <= CODING_ACTIVITY_WINDOW_MS;
}

function editorName(appName) {
  const name = String(appName || '').toLowerCase();
  if (name.includes('cursor')) return 'Cursor';
  if (name.includes('windsurf')) return 'Windsurf';
  if (name.includes('vscodium')) return 'VSCodium';
  if (name.includes('positron')) return 'Positron';
  if (name.includes('void')) return 'Void';
  if (name.includes('antigravity')) return 'Antigravity';
  if (name.includes('insider')) return 'VS Code Insiders';
  return 'VS Code';
}

function resolveBaseUrl(value) {
  const candidate = String(value || '').trim().replace(/\/$/, '');
  let url;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error('DevGlobe base URL is invalid.');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('DevGlobe base URL must use HTTPS.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('DevGlobe base URL must be an origin without credentials, query, or fragment.');
  }

  return url.origin;
}

function buildUrl(baseUrl, pathname, parameters = {}) {
  const url = new URL(pathname, `${resolveBaseUrl(baseUrl)}/`);
  Object.entries({ ...ATTRIBUTION, ...parameters }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function profileUrl(baseUrl, login) {
  return buildUrl(baseUrl, `/developer/${encodeURIComponent(normalizeLogin(login))}`);
}

function identityCardUrl(baseUrl, login) {
  return buildUrl(baseUrl, `/share/${encodeURIComponent(normalizeLogin(login))}`);
}

function searchUrl(baseUrl, query, limit = 10) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Enter a developer, language, or location to search.');
  return buildUrl(baseUrl, '/api/search', {
    q: normalizedQuery,
    mode: 'text',
    top: Math.min(Math.max(Number(limit) || 10, 1), 20),
  });
}

function agentSetupUrl(baseUrl) {
  return buildUrl(baseUrl, '/agents');
}

function codingStatsUrl(baseUrl) {
  return buildUrl(baseUrl, '/coding-stats');
}

function liveGlobeUrl(baseUrl) {
  return buildUrl(baseUrl, '/space');
}

function presenceTokenUrl(baseUrl) {
  return new URL('/api/presence/token', `${resolveBaseUrl(baseUrl)}/`).toString();
}

function presenceUrl(baseUrl) {
  return new URL('/api/presence', `${resolveBaseUrl(baseUrl)}/`).toString();
}

function mcpConfiguration(baseUrl) {
  return JSON.stringify({
    servers: {
      devglobe: {
        type: 'http',
        url: `${resolveBaseUrl(baseUrl)}/mcp`,
      },
    },
  }, null, 2);
}

function normalizeLogin(value) {
  const login = String(value || '').trim().replace(/^@/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) {
    throw new Error('Configure a valid GitHub login in DevGlobe settings.');
  }
  return login;
}

function normalizeResults(payload) {
  if (!payload || !Array.isArray(payload.results)) {
    throw new Error('DevGlobe returned an unexpected search response.');
  }

  return payload.results.flatMap((developer) => {
    try {
      const login = normalizeLogin(developer?.login);
      return [{
        login,
        name: typeof developer.name === 'string' ? developer.name.trim() : '',
        location: typeof developer.location === 'string' ? developer.location.trim() : '',
        language: typeof developer.topLanguage === 'string' ? developer.topLanguage.trim() : '',
        score: Number.isFinite(Number(developer.score)) ? Number(developer.score) : null,
      }];
    } catch {
      return [];
    }
  });
}

module.exports = {
  CODING_ACTIVITY_WINDOW_MS,
  agentSetupUrl,
  codingStatsUrl,
  editorName,
  identityCardUrl,
  isCodingActivityRecent,
  liveGlobeUrl,
  mcpConfiguration,
  normalizeLogin,
  normalizeResults,
  presenceTokenUrl,
  presenceUrl,
  profileUrl,
  resolveBaseUrl,
  searchUrl,
};