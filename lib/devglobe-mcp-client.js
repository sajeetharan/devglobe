function normalizeBaseUrl(value) {
  const url = new URL(value || 'https://www.devglobe.dev');
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('DEVGLOBE_API_URL must use HTTPS');
  }
  return url.origin;
}

export const MCP_METHODOLOGY_DISCLAIMER = 'DevGlobe rankings are comparative discovery signals based on public contribution data, not hiring recommendations or measures of personal worth.';

function publicEvidence(developer) {
  return [
    ['GitHub stars', developer.totalStars],
    ['Public commits', developer.totalCommits],
    ['GitHub followers', developer.followers],
    ['Stack Overflow reputation', developer.soReputation],
  ]
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([label, value]) => ({ label, value: Number(value) }));
}

function explainMatch(developer, input = {}) {
  const reasons = [];
  if (input.language && developer.topLanguage?.toLowerCase() === input.language.toLowerCase()) {
    reasons.push(`Primary language matches ${input.language}`);
  }
  if (input.location && developer.location?.toLowerCase().includes(input.location.toLowerCase())) {
    reasons.push(`Location matches ${input.location}`);
  }
  if (input.opportunityType && developer.aiProfile?.opportunityPreferences?.types?.includes(input.opportunityType)) {
    reasons.push(`Developer is actively open to ${input.opportunityType} opportunities`);
  }
  const query = String(input.query || '').trim();
  if (query) reasons.push(`Matched the public search intent: ${query}`);
  return reasons.length ? reasons : ['Retrieved by GitHub login'];
}

function projectDeveloper(developer, origin, input) {
  const updatedAt = developer.metricsUpdatedAt || null;
  const opportunityPreferences = developer.aiProfile?.opportunityPreferences;
  return {
    login: developer.login,
    name: developer.name || developer.login,
    profileUrl: `${origin}/developer/${encodeURIComponent(developer.login)}`,
    ...(developer.location ? { location: developer.location } : {}),
    ...(developer.topLanguage ? { topLanguage: developer.topLanguage } : {}),
    ...(Number.isFinite(Number(developer.score)) ? { score: Number(developer.score) } : {}),
    ...(Number.isInteger(developer.globalRank) ? { globalRank: developer.globalRank } : {}),
    whyMatched: explainMatch(developer, input),
    publicEvidence: publicEvidence(developer),
    dataFreshness: {
      updatedAt,
      status: updatedAt ? 'reported' : 'unknown',
    },
    availableForAgents: developer.aiProfile?.acceptsAgentRequests === true,
    ...(opportunityPreferences ? { opportunityPreferences } : {}),
    methodologyDisclaimer: MCP_METHODOLOGY_DISCLAIMER,
  };
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The API returns either a plain string error (older/simple routes) or a
    // structured { code, message, retryable, retryAfterSeconds } envelope
    // (routes with a retry/rate-limit contract, e.g. agent introductions).
    const errorInfo = typeof data.error === 'string' ? { message: data.error } : (data.error || {});
    const error = new Error(errorInfo.message || `DevGlobe API returned ${response.status}`);
    error.status = response.status;
    if (errorInfo.code) error.code = errorInfo.code;
    if (typeof errorInfo.retryable === 'boolean') error.retryable = errorInfo.retryable;
    const retryAfterHeader = response.headers.get?.('retry-after');
    const retryAfterSeconds = errorInfo.retryAfterSeconds ?? (retryAfterHeader ? Number(retryAfterHeader) : undefined);
    if (Number.isFinite(retryAfterSeconds)) error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
  return data;
}

export function createDevGlobeMcpClient({
  baseUrl = process.env.DEVGLOBE_API_URL,
  publicApiBaseUrl = baseUrl,
  agentToken = process.env.DEVGLOBE_AGENT_TOKEN,
  previewIdentity,
  fetchImpl = fetch,
} = {}) {
  const origin = normalizeBaseUrl(baseUrl);
  const publicApiOrigin = normalizeBaseUrl(publicApiBaseUrl);

  return {
    async searchDevelopers({ query, location, language, opportunityType, availableForAgents = false, limit = 10 }) {
      const searchText = [query, location, language].filter(Boolean).join(' ');
      const searchUrl = new URL('/api/search', publicApiOrigin);
      searchUrl.searchParams.set('q', searchText);
      searchUrl.searchParams.set('mode', 'text');
      searchUrl.searchParams.set('top', String(Math.min(limit, 20)));
      const search = await readJson(await fetchImpl(searchUrl));

      const developers = await Promise.all(search.results.map(async result => {
        const profileUrl = new URL('/api/developer', publicApiOrigin);
        profileUrl.searchParams.set('id', result.login || result.id);
        return readJson(await fetchImpl(profileUrl));
      }));

      return developers.filter(developer => {
        const matchesLocation = !location || developer.location?.toLowerCase().includes(location.toLowerCase());
        const matchesLanguage = !language || developer.topLanguage?.toLowerCase() === language.toLowerCase();
        const matchesAvailability = !availableForAgents || developer.aiProfile?.acceptsAgentRequests === true;
        const matchesOpportunity = !opportunityType || developer.aiProfile?.opportunityPreferences?.types?.includes(opportunityType);
        return matchesLocation && matchesLanguage && matchesAvailability && matchesOpportunity;
      }).slice(0, limit).map(developer => projectDeveloper(developer, origin, { query, location, language, opportunityType }));
    },

    async getDeveloperProfile(login) {
      const url = new URL('/api/developer', publicApiOrigin);
      url.searchParams.set('id', login);
      const developer = await readJson(await fetchImpl(url));
      return projectDeveloper(developer, origin);
    },

    async getTrendingDevelopers({ days = 30, limit = 10 } = {}) {
      const url = new URL('/api/trending', origin);
      url.searchParams.set('days', String(days));
      const trending = await readJson(await fetchImpl(url));
      const boundedLimit = Math.min(Math.max(limit, 1), 20);
      return {
        ...trending,
        gainers: (trending.gainers || []).slice(0, boundedLimit).map(developer => ({
          ...developer,
          profileUrl: `${origin}/developer/${encodeURIComponent(developer.login)}`,
        })),
        newEntries: (trending.newEntries || []).slice(0, boundedLimit).map(developer => ({
          ...developer,
          profileUrl: `${origin}/developer/${encodeURIComponent(developer.login)}`,
        })),
      };
    },

    async findSimilarDevelopers({ login, limit = 10 }) {
      const url = new URL('/api/similar-developers', origin);
      url.searchParams.set('login', login);
      url.searchParams.set('top', String(Math.min(Math.max(limit, 1), 20)));
      const similarity = await readJson(await fetchImpl(url));
      return {
        ...similarity,
        results: (similarity.results || []).map(developer => ({
          ...developer,
          profileUrl: `${origin}/developer/${encodeURIComponent(developer.login)}`,
        })),
      };
    },

    async previewContributionMission({ login }) {
      const url = new URL('/api/mission-preview', origin);
      return readJson(await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(previewIdentity ? { 'X-DevGlobe-Mcp-Preview-Identity': previewIdentity } : {}),
        },
        body: JSON.stringify({ login }),
      }));
    },

    async requestIntroduction(input) {
      if (!agentToken) throw new Error('DEVGLOBE_AGENT_TOKEN is required for introduction requests');
      const url = new URL('/api/agent/introductions', origin);
      return readJson(await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      }));
    },

    async getIntroductionStatus({ id, developerLogin }) {
      if (!agentToken) throw new Error('DEVGLOBE_AGENT_TOKEN is required for introduction requests');
      const url = new URL('/api/agent/introductions', origin);
      url.searchParams.set('id', id);
      url.searchParams.set('developerLogin', developerLogin);
      return readJson(await fetchImpl(url, {
        headers: { Authorization: `Bearer ${agentToken}` },
      }));
    },
  };
}
