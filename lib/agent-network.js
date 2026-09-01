import { AI_TOOLS, getPublicAiProfile } from './ai-profile.js';
import { extractCountry, normalizeCountry } from './country.js';

export const AGENT_NETWORK_PRIVACY_THRESHOLD = 3;
export const AGENT_RELATIONSHIP_LIMIT_PER_TOOL = 20;

export const AGENT_GLOBE_NODES = [
  { id: 'github-copilot', name: 'GitHub Copilot', lat: 16, lng: -28, color: '#2f81f7' },
  { id: 'claude-code', name: 'Claude Code', lat: 46, lng: -24, color: '#d97757' },
  { id: 'cursor', name: 'Cursor', lat: -18, lng: -38, color: '#f8fafc' },
  { id: 'openai-codex', name: 'OpenAI Codex', lat: -44, lng: -14, color: '#10a37f' },
  { id: 'gemini-cli', name: 'Gemini CLI', lat: 2, lng: 58, color: '#8e75b2' },
  { id: 'windsurf', name: 'Windsurf', lat: -32, lng: 76, color: '#00c4b4' },
  { id: 'custom-agent', name: 'Custom agent', lat: 58, lng: 34, color: '#00b0d8' },
];
const AGENT_GLOBE_NODE_IDS = new Set(AGENT_GLOBE_NODES.map(node => node.id));

function repositoryToolIds(developer) {
  const ids = Array.isArray(developer.repositoryAgentTools)
    ? developer.repositoryAgentTools
    : (developer.repositoryAgentSignals?.signals || []).map(signal => signal.id);
  return [...new Set(ids.filter(id => AGENT_GLOBE_NODE_IDS.has(id)))];
}

export function isAgentReadyDeveloper(developer) {
  const profile = getPublicAiProfile(developer.aiProfile);
  return developer.claimed === true
    && profile?.acceptsAgentRequests === true
    && profile.contactPolicy === 'verified-agents';
}

export function projectAgentReadiness(developer) {
  const profile = getPublicAiProfile(developer.aiProfile);
  const agentReady = developer.claimed === true
    && profile?.acceptsAgentRequests === true
    && profile.contactPolicy === 'verified-agents';
  const repositoryAgentTools = repositoryToolIds(developer);
  const { aiProfile, repositoryAgentSignals, ...publicDeveloper } = developer;
  return {
    ...publicDeveloper,
    agentReady,
    agentTools: agentReady ? profile.tools.map(tool => tool.id) : [],
    repositoryAgentTools,
  };
}

export function buildAgentRelationshipGraph(
  developers,
  limitPerTool = AGENT_RELATIONSHIP_LIMIT_PER_TOOL,
  privacyThreshold = AGENT_NETWORK_PRIVACY_THRESHOLD,
) {
  const nodesById = new Map(AGENT_GLOBE_NODES.map(node => [node.id, node]));
  const cohortCounts = new Map();
  const counts = new Map();
  const links = [];
  const linkedDevelopers = new Map();
  const uniqueDevelopers = new Map();

  for (const developer of developers) {
    const login = String(developer.login || '').trim().toLowerCase();
    if (!login) continue;
    const current = uniqueDevelopers.get(login);
    uniqueDevelopers.set(login, current ? {
      ...current,
      ...developer,
      agentReady: current.agentReady || developer.agentReady,
      agentTools: [...new Set([...(current.agentTools || []), ...(developer.agentTools || [])])],
      repositoryAgentTools: [...new Set([...(current.repositoryAgentTools || []), ...(developer.repositoryAgentTools || [])])],
    } : developer);
  }

  for (const developer of uniqueDevelopers.values()) {
    if (developer.lat == null || developer.lng == null) continue;
    const toolIds = new Set([...(developer.agentTools || []), ...(developer.repositoryAgentTools || [])]);
    for (const toolId of toolIds) {
      if (nodesById.has(toolId)) cohortCounts.set(toolId, (cohortCounts.get(toolId) || 0) + 1);
    }
  }

  for (const developer of uniqueDevelopers.values()) {
    if (developer.lat == null || developer.lng == null) continue;
    const login = developer.login.toLowerCase();
    const toolIds = new Set([...(developer.agentTools || []), ...(developer.repositoryAgentTools || [])]);
    for (const toolId of toolIds) {
      const node = nodesById.get(toolId);
      const count = counts.get(toolId) || 0;
      if (!node || (cohortCounts.get(toolId) || 0) < privacyThreshold || count >= limitPerTool) continue;
      const source = developer.agentTools?.includes(toolId) ? 'self-declared' : 'public-repository';
      counts.set(toolId, count + 1);
      linkedDevelopers.set(login, {
        id: developer.id || developer.login,
        login: developer.login,
        name: developer.name || developer.login,
        avatarUrl: developer.avatarUrl,
        lat: developer.lat,
        lng: developer.lng,
        markerLat: developer.lat,
        markerLng: developer.lng,
        markerType: 'developer',
        agentReady: developer.agentReady === true,
        repositoryDetected: source === 'public-repository',
        score: developer.score || 0,
      });
      links.push({
        id: `${toolId}:${login}`,
        toolId,
        toolName: node.name,
        developerLogin: login,
        startLat: node.lat,
        startLng: node.lng,
        endLat: developer.lat,
        endLng: developer.lng,
        color: [node.color, 'rgba(34, 211, 238, 0.72)'],
        source,
        label: source === 'self-declared'
          ? `${node.name} is publicly listed by @${developer.login}`
          : `${node.name} configuration detected in @${developer.login}'s public repositories`,
      });
    }
  }

  const activeToolIds = new Set(links.map(link => link.toolId));
  return {
    nodes: AGENT_GLOBE_NODES.filter(node => activeToolIds.has(node.id)),
    developers: [...linkedDevelopers.values()],
    links,
  };
}

function reportMetric(value, threshold) {
  return value >= threshold
    ? { value, suppressed: false }
    : { value: null, suppressed: true };
}

export function getIntroductionLifecycle(status, expiresAt, now = new Date()) {
  const expired = status === 'pending' && expiresAt && expiresAt <= now.toISOString();
  const terminal = expired ? 'expired' : status;

  return [
    { id: 'requested', label: 'Requested', state: 'complete' },
    {
      id: 'review',
      label: 'Review',
      state: terminal === 'pending' ? 'current' : 'complete',
    },
    {
      id: terminal === 'pending' ? 'connect' : terminal,
      label: terminal === 'pending' ? 'Connect' : terminal.charAt(0).toUpperCase() + terminal.slice(1),
      state: terminal === 'pending' ? 'upcoming' : 'current',
    },
  ];
}

export function buildAgentNetworkSnapshot({ developers = [], introductionCounts = {} }, threshold = AGENT_NETWORK_PRIVACY_THRESHOLD) {
  const toolNames = new Map(AI_TOOLS.map(tool => [tool.id, tool.name]));
  const toolCounts = new Map();
  const countries = new Set();

  const openDevelopers = developers.filter(isAgentReadyDeveloper);
  const repositoryDevelopers = developers.filter(developer => repositoryToolIds(developer).length > 0);

  for (const developer of developers) {
    const toolIds = new Set();
    if (isAgentReadyDeveloper(developer)) {
      const country = normalizeCountry(extractCountry(developer.location || ''));
      if (country) countries.add(country.toLowerCase());
      for (const tool of developer.aiProfile.tools) toolIds.add(tool.id);
    }
    for (const toolId of repositoryToolIds(developer)) toolIds.add(toolId);

    for (const toolId of toolIds) toolCounts.set(toolId, (toolCounts.get(toolId) || 0) + 1);
  }

  const tools = [...toolCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([id, count]) => ({ id, name: toolNames.get(id) || id, count }))
    .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name));

  return {
    privacyThreshold: threshold,
    metrics: {
      openDevelopers: reportMetric(openDevelopers.length, threshold),
      repositoryDevelopers: reportMetric(repositoryDevelopers.length, threshold),
      acceptedConnections: reportMetric(introductionCounts.accepted || 0, threshold),
      pendingRequests: reportMetric(introductionCounts.pending || 0, threshold),
      countries: reportMetric(countries.size, threshold),
    },
    tools,
  };
}
