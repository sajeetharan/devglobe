import { getSiteUrl } from '../../lib/site.js';

export function GET() {
  const siteUrl = getSiteUrl();
  return Response.json({
    openapi: '3.1.0',
    info: {
      title: 'DevGlobe Public API',
      version: '1.0.0',
      description: 'The open-source talent graph for humans and AI agents. Public discovery and stateless MCP access; private contact details are never returned.',
    },
    servers: [{ url: siteUrl }],
    components: {
      securitySchemes: {
        agentBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'DevGlobe agent token',
          description: 'Pre-issued agent credential. Permission names are published in RFC 9728 protected-resource metadata.',
        },
      },
      schemas: {
        SearchMatch: {
          type: 'object',
          required: ['score', 'label', 'reasons', 'signals', 'method', 'disclaimer'],
          properties: {
            score: { type: 'integer', minimum: 0, maximum: 100, description: 'Ordinal discovery relevance, not a probability or suitability rating.' },
            label: { type: 'string', enum: ['Strong match', 'Good match', 'Related match'] },
            reasons: { type: 'array', maxItems: 3, items: { type: 'string' } },
            signals: { type: 'array', items: { type: 'string', enum: ['text', 'semantic'] } },
            method: { type: 'string', enum: ['text', 'semantic', 'hybrid'] },
            disclaimer: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          required: ['error', 'code', 'hint'],
          properties: {
            error: { type: 'string', description: 'Human-readable error message retained for backward compatibility.' },
            code: { type: 'string', description: 'Stable machine-readable error code.' },
            hint: { type: 'string', description: 'Actionable recovery guidance.' },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Invalid request',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    'x-protected-resource-metadata': `${siteUrl}/.well-known/oauth-protected-resource`,
    'x-scopes-supported': ['developers:read', 'introductions:read', 'introductions:write'],
    paths: {
      '/api/search': {
        get: {
          operationId: 'searchDevelopers',
          summary: 'Search public developer profiles',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'mode', in: 'query', schema: { type: 'string', enum: ['text', 'vector', 'hybrid'], default: 'hybrid' } },
            { name: 'top', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } },
          ],
          security: [],
          'x-required-scope': 'developers:read',
          responses: {
            200: {
              description: 'Public developer search results with explainable ordinal match signals',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      query: { type: 'string' },
                      mode: { type: 'string' },
                      count: { type: 'integer' },
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { match: { $ref: '#/components/schemas/SearchMatch' } },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
          },
        },
      },
      '/api/developer': {
        get: {
          operationId: 'getDeveloperProfile',
          summary: 'Get one public developer profile',
          parameters: [
            { name: 'id', in: 'query', required: true, schema: { type: 'string' } },
          ],
          security: [],
          'x-required-scope': 'developers:read',
          responses: {
            200: { description: 'Public developer profile' },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/repository-matches': {
        get: {
          operationId: 'matchDevelopersToRepository',
          summary: 'Match indexed public developers to a public GitHub repository',
          parameters: [
            { name: 'repository', in: 'query', required: true, schema: { type: 'string', pattern: '^[^/]+/[^/]+$' } },
            { name: 'top', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } },
          ],
          security: [],
          'x-required-scope': 'developers:read',
          responses: {
            200: { description: 'Evidence-backed public developer matches' },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/mcp': {
        post: {
          operationId: 'callMcp',
          summary: 'Call the stateless DevGlobe Streamable HTTP MCP server',
          security: [{ agentBearer: [] }, {}],
          'x-scopes-supported': ['developers:read', 'introductions:read', 'introductions:write'],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'MCP JSON-RPC response' } },
        },
      },
    },
  }, {
    headers: {
      'Content-Type': 'application/openapi+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}