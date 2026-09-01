import { getSiteUrl } from '../../../../lib/site.js';

export function GET() {
  const siteUrl = getSiteUrl();
  return Response.json({
    serverInfo: { name: 'devglobe', version: '1.5.0' },
    description: 'The open-source talent graph for humans and AI agents. Search public profiles and request consent-gated introductions.',
    homepage: `${siteUrl}/agents`,
    repository: {
      url: 'https://github.com/sajeetharan/devglobe',
      source: 'github',
      issues: 'https://github.com/sajeetharan/devglobe/issues',
      contributing: 'https://github.com/sajeetharan/devglobe/blob/main/CONTRIBUTING.md',
    },
    transport: {
      type: 'streamable-http',
      endpoint: `${siteUrl}/mcp`,
    },
    capabilities: {
      tools: {
        listChanged: false,
        names: [
          'search_developers',
          'get_developer_profile',
          'find_similar_developers',
          'match_developers_to_repository',
          'get_trending_developers',
          'preview_contribution_mission',
          'request_introduction',
          'get_introduction_status',
        ],
      },
      resources: {
        listChanged: true,
        uris: ['devglobe://project'],
      },
      prompts: {
        listChanged: true,
        names: ['find-developers', 'find-collaborators', 'find-contribution'],
      },
    },
    authentication: {
      publicTools: ['search_developers', 'get_developer_profile', 'find_similar_developers', 'match_developers_to_repository', 'get_trending_developers', 'preview_contribution_mission'],
      protectedTools: ['request_introduction', 'get_introduction_status'],
      scheme: 'bearer',
      scopes: {
        developersRead: 'developers:read',
        introductionsRead: 'introductions:read',
        introductionsWrite: 'introductions:write',
      },
      protectedResourceMetadata: `${siteUrl}/.well-known/oauth-protected-resource`,
      documentation: `${siteUrl}/docs/mcp-server`,
    },
    discovery: {
      apiCatalog: `${siteUrl}/.well-known/api-catalog`,
      agentSkills: `${siteUrl}/.well-known/agent-skills/index.json`,
      llms: `${siteUrl}/llms.txt`,
      openapi: `${siteUrl}/openapi.json`,
    },
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}