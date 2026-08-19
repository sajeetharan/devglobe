const { CosmosClient } = require('@azure/cosmos');

const PUBLIC_FILTER = '(NOT IS_DEFINED(c.nomination) OR c.nomination.status = "approved")';
let client;

function environmentValue(value) {
  let result = String(value || '').trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (result.startsWith('\\"') && result.endsWith('\\"')) {
      result = result.slice(2, -2).trim();
      continue;
    }
    if (result.startsWith('"') && result.endsWith('"')) {
      try {
        const parsed = JSON.parse(result);
        if (typeof parsed === 'string') {
          result = parsed.trim();
          continue;
        }
      } catch {
        result = result.slice(1, -1).trim();
        continue;
      }
    }
    break;
  }
  return result;
}

function getClient() {
  if (client) return client;
  const endpoint = environmentValue(process.env.COSMOS_ENDPOINT);
  const key = environmentValue(process.env.COSMOS_KEY);
  if (!endpoint || !key) throw new Error('COSMOS_ENDPOINT and COSMOS_KEY are required');
  client = new CosmosClient({ endpoint, key });
  return client;
}

function getContainer(name = process.env.COSMOS_CONTAINER || 'developers') {
  return getClient().database(process.env.COSMOS_DATABASE || 'devglobe').container(name);
}

function publicAiProfile(profile) {
  if (!profile || profile.visibility !== 'public') return undefined;
  return {
    tools: Array.isArray(profile.tools) ? profile.tools.map(tool => ({ id: tool.id, usage: tool.usage, source: 'self-declared' })) : [],
    acceptsAgentRequests: profile.acceptsAgentRequests === true,
    visibility: 'public',
    contactPolicy: profile.acceptsAgentRequests === true ? profile.contactPolicy : 'nobody',
    updatedAt: profile.updatedAt,
  };
}

function projectDeveloper(developer) {
  const { aiProfile, embedding, nomination, ...publicDeveloper } = developer;
  const profile = publicAiProfile(aiProfile);
  return {
    ...publicDeveloper,
    ...(profile ? { aiProfile: profile } : {}),
    agentReady: developer.claimed === true && profile?.acceptsAgentRequests === true && profile.contactPolicy === 'verified-agents',
  };
}

module.exports = { PUBLIC_FILTER, environmentValue, getContainer, projectDeveloper };