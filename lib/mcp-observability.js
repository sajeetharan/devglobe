import { createHmac } from 'node:crypto';

const METHODS = new Set(['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get']);
const RESOURCES = new Set(['devglobe://project']);
const PROMPTS = new Set(['find-developers', 'find-collaborators', 'find-contribution']);
const TOOLS = new Set([
  'search_developers',
  'get_developer_profile',
  'find_similar_developers',
  'get_trending_developers',
  'preview_contribution_mission',
  'request_introduction',
  'get_introduction_status',
]);
const CLIENT_PATTERNS = [
  ['smithery', /smithery/i],
  ['vscode', /visual studio code|vscode/i],
  ['cursor', /cursor/i],
  ['claude', /claude/i],
  ['openai', /openai|chatgpt/i],
  ['mcp-inspector', /mcp[ /_-]?inspector/i],
];
const ERROR_CODES = new Set([
  'authentication_required',
  'conflict',
  'invalid_request',
  'not_found',
  'rate_limited',
  'unavailable',
  'upstream_error',
]);

export function classifyMcpClient(...values) {
  const identity = values.filter(value => typeof value === 'string').join(' ');
  return CLIENT_PATTERNS.find(([, pattern]) => pattern.test(identity))?.[0] || 'other';
}

export function describeMcpRequest(body, userAgent = '') {
  const method = METHODS.has(body?.method) ? body.method : 'other';
  const tool = method === 'tools/call' && TOOLS.has(body?.params?.name) ? body.params.name : null;
  const resource = method === 'resources/read' && RESOURCES.has(body?.params?.uri) ? body.params.uri : null;
  const prompt = method === 'prompts/get' && PROMPTS.has(body?.params?.name) ? body.params.name : null;
  const client = classifyMcpClient(body?.params?.clientInfo?.name, userAgent);
  return { method, tool, resource, prompt, client };
}

export function createMcpCallerHash(request, secret = process.env.ENGAGEMENT_HASH_SECRET || process.env.SESSION_SECRET, now = new Date()) {
  if (!secret) return null;
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const userAgent = request.headers.get('user-agent') || '';
  const day = now.toISOString().slice(0, 10);
  return createHmac('sha256', secret)
    .update(`mcp-caller:${day}:${forwardedFor}:${userAgent}`)
    .digest('base64url');
}

export function recordMcpMetric(metric, logger = console.info) {
  logger(JSON.stringify({
    event: 'devglobe_mcp',
    timestamp: new Date().toISOString(),
    method: metric.method,
    ...(metric.tool ? { tool: metric.tool } : {}),
    ...(metric.resource ? { resource: metric.resource } : {}),
    ...(metric.prompt ? { prompt: metric.prompt } : {}),
    client: metric.client,
    outcome: metric.outcome,
    durationMs: metric.durationMs,
    ...(metric.callerHash ? { callerHash: metric.callerHash } : {}),
    ...(ERROR_CODES.has(metric.errorCode) ? { errorCode: metric.errorCode } : {}),
    ...(Number.isInteger(metric.resultCount) ? { resultCount: metric.resultCount } : {}),
  }));
}