import { getSiteUrl } from '../../../lib/site.js';

export function GET() {
  const siteUrl = getSiteUrl();
  return Response.json({
    resource: `${siteUrl}/mcp`,
    scopes_supported: [
      'developers:read',
      'introductions:read',
      'introductions:write',
    ],
    bearer_methods_supported: ['header'],
    resource_documentation: `${siteUrl}/auth.md`,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
