const METHODS = new Set(['initialize', 'tools/list', 'tools/call']);
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

export function classifyMcpClient(...values) {
  const identity = values.filter(value => typeof value === 'string').join(' ');
  return CLIENT_PATTERNS.find(([, pattern]) => pattern.test(identity))?.[0] || 'other';
}

export function describeMcpRequest(body, userAgent = '') {
  const method = METHODS.has(body?.method) ? body.method : 'other';
  const tool = method === 'tools/call' && TOOLS.has(body?.params?.name) ? body.params.name : null;
  const client = classifyMcpClient(body?.params?.clientInfo?.name, userAgent);
  return { method, tool, client };
}

export function recordMcpMetric(metric, logger = console.info) {
  logger(JSON.stringify({
    event: 'devglobe_mcp',
    timestamp: new Date().toISOString(),
    method: metric.method,
    ...(metric.tool ? { tool: metric.tool } : {}),
    client: metric.client,
    outcome: metric.outcome,
    durationMs: metric.durationMs,
    ...(Number.isInteger(metric.resultCount) ? { resultCount: metric.resultCount } : {}),
  }));
}