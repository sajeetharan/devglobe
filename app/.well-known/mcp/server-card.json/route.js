import { getSiteUrl } from '../../../../lib/site.js';

export function GET() {
  const siteUrl = getSiteUrl();
  return Response.json({
    serverInfo: { name: 'devglobe', version: '1.0.0' },
    description: 'Search public developer profiles and request consent-gated introductions.',
    homepage: `${siteUrl}/agents`,
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
          'request_introduction',
          'get_introduction_status',
        ],
      },
      resources: false,
      prompts: false,
    },
    authentication: {
      publicTools: ['search_developers', 'get_developer_profile'],
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