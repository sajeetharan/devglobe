import { getSiteUrl } from '../../lib/site.js';

export function GET() {
  const siteUrl = getSiteUrl();
  const body = `# DevGlobe Agent Authentication

## Public access

The discovery tools, including \`search_developers\`, \`get_developer_profile\`, and \`match_developers_to_repository\`, are public and require no credentials.

Machine-readable permission metadata is published at ${siteUrl}/.well-known/oauth-protected-resource. Public discovery maps to \`developers:read\`.

## Protected introduction tools

The \`request_introduction\` and \`get_introduction_status\` tools require a DevGlobe-issued bearer token. DevGlobe currently uses pre-issued agent credentials and does not operate an OAuth authorization server or dynamic client registration endpoint.

Send the token only to ${siteUrl}/mcp using the \`Authorization: Bearer <token>\` header. Never place it in a repository or URL.

Protected operations use least-privilege scope names:

- \`introductions:write\` requests a consent-gated introduction.
- \`introductions:read\` reads the status of an introduction request.

Existing issued agent credentials authorize both protected introduction operations. DevGlobe does not advertise an OAuth authorization server because it cannot currently issue OAuth grants; publishing fabricated RFC 8414 metadata would misdirect clients.

See ${siteUrl}/docs/mcp-server for credential issuance and consent lifecycle details.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}