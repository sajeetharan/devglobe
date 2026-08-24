import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createDevGlobeMcpClient } from './devglobe-mcp-client.js';
import { createDevGlobeMcpServer } from './devglobe-mcp-server.js';
import { describeMcpRequest, recordMcpMetric } from './mcp-observability.js';
import { getSiteUrl } from './site.js';

function getAllowedOrigins() {
  const configured = (process.env.DEVGLOBE_MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return new Set([getSiteUrl(), ...configured]);
}

export function isMcpOriginAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production' && origin === new URL(request.url).origin) return true;
  return getAllowedOrigins().has(origin);
}

function withSecurityHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Vary', 'Origin');
  headers.set('Link', [
    `</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"`,
    `</docs/mcp-server>; rel="service-doc"; type="text/markdown"`,
    `</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"`,
  ].join(', '));
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'mcp-protocol-version');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleMcpOptions(request) {
  if (!isMcpOriginAllowed(request)) return new Response(null, { status: 403 });
  const origin = request.headers.get('origin');
  const response = new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
  return withSecurityHeaders(response, origin);
}

export async function handleRemoteMcpRequest(request, {
  fetchImpl = fetch,
  metricRecorder = recordMcpMetric,
  apiBaseUrl = process.env.DEVGLOBE_API_URL || process.env.NEXT_PUBLIC_API_URL,
} = {}) {
  if (!isMcpOriginAllowed(request)) {
    return withSecurityHeaders(new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Origin not allowed' },
      id: null,
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  if (request.method !== 'POST') {
    return withSecurityHeaders(new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Stateless MCP accepts POST requests only' },
      id: null,
    }), {
      status: 405,
      headers: {
        Allow: 'POST, OPTIONS',
        'Content-Type': 'application/json',
      },
    }), request.headers.get('origin'));
  }

  const authorization = request.headers.get('authorization') || '';
  const startedAt = performance.now();
  const requestDescription = describeMcpRequest(await request.clone().json().catch(() => null));
  const agentToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const client = createDevGlobeMcpClient({
    baseUrl: new URL(request.url).origin,
    publicApiBaseUrl: apiBaseUrl || new URL(request.url).origin,
    agentToken,
    fetchImpl,
  });
  const server = createDevGlobeMcpServer({ client });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const responseBody = await response.clone().json().catch(() => null);
  metricRecorder({
    ...requestDescription,
    outcome: response.status >= 400 || responseBody?.error || responseBody?.result?.isError ? 'error' : 'success',
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    resultCount: responseBody?.result?.structuredContent?.resultCount,
  });
  return withSecurityHeaders(response, request.headers.get('origin'));
}