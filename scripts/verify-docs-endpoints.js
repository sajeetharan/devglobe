const siteUrl = (process.env.LIVE_SITE_URL || 'https://www.devglobe.dev').replace(/\/$/, '');

const resources = [
  {
    name: 'API catalog',
    path: '/.well-known/api-catalog',
    contentType: 'application/linkset+json',
  },
  {
    name: 'OpenAPI description',
    path: '/openapi.json',
    contentType: 'application/openapi+json',
  },
  {
    name: 'MCP server card',
    path: '/.well-known/mcp/server-card.json',
    contentType: 'application/json',
  },
  {
    name: 'Agent Skills index',
    path: '/.well-known/agent-skills/index.json',
    contentType: 'application/json',
  },
  {
    name: 'DevGlobe Agent Skill',
    path: '/.well-known/agent-skills/devglobe/SKILL.md',
    contentType: 'text/markdown',
  },
  {
    name: 'Authentication guide',
    path: '/auth.md',
    contentType: 'text/markdown',
  },
  {
    name: 'Agent overview',
    path: '/llms.txt',
    contentType: 'text/plain',
  },
];

for (const resource of resources) {
  const response = await fetch(`${siteUrl}${resource.path}`, {
    headers: { 'User-Agent': 'DevGlobe-Docs-Check/1.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`${resource.name} returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes(resource.contentType)) {
    throw new Error(`${resource.name} returned ${contentType || 'no content type'}; expected ${resource.contentType}.`);
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`${resource.name} returned an empty response.`);
  }
}

const markdownHome = await fetch(siteUrl, {
  headers: {
    Accept: 'text/markdown',
    'User-Agent': 'DevGlobe-Docs-Check/1.0',
  },
  signal: AbortSignal.timeout(15_000),
});

if (!markdownHome.ok || !markdownHome.headers.get('content-type')?.includes('text/markdown')) {
  throw new Error('Homepage Markdown content negotiation is unavailable.');
}

if (!markdownHome.headers.get('vary')?.toLowerCase().includes('accept')) {
  throw new Error('Homepage Markdown response is missing Vary: Accept.');
}

console.log(`Verified ${resources.length} hosted agent resources and Markdown content negotiation.`);