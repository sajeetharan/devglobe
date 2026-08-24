import { getSiteUrl } from '../../../lib/site.js';

export function GET() {
  const siteUrl = getSiteUrl();
  return Response.json({
    linkset: [
      {
        anchor: `${siteUrl}/mcp`,
        'service-desc': [
          { href: `${siteUrl}/openapi.json`, type: 'application/openapi+json' },
        ],
        'service-doc': [
          { href: `${siteUrl}/docs/mcp-server`, type: 'text/markdown' },
        ],
        describedby: [
          { href: `${siteUrl}/.well-known/mcp/server-card.json`, type: 'application/json' },
          { href: `${siteUrl}/.well-known/oauth-protected-resource`, type: 'application/json' },
          { href: `${siteUrl}/.well-known/agent-skills/index.json`, type: 'application/json' },
        ],
        item: [
          { href: `${siteUrl}/agents`, type: 'text/html', title: 'Add to Agent' },
        ],
      },
    ],
  }, {
    headers: {
      'Content-Type': 'application/linkset+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}