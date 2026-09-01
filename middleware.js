import { NextResponse } from 'next/server.js';

const HOMEPAGE_MARKDOWN = `# DevGlobe

The open-source talent graph for humans and AI agents.

## Agent access

- MCP endpoint: https://www.devglobe.dev/mcp
- MCP documentation: https://www.devglobe.dev/docs/mcp-server
- API catalog: https://www.devglobe.dev/.well-known/api-catalog
- OpenAPI description: https://www.devglobe.dev/openapi.json
- Full agent guide: https://www.devglobe.dev/llms.txt

Use the MCP tools to search public developer profiles, match developers to a public GitHub repository, inspect a profile, and request consent-gated introductions. Private contact details are never returned.
`;

export function middleware(request) {
  if (request.headers.get('accept')?.toLowerCase().includes('text/markdown')) {
    const tokenCount = Math.ceil(HOMEPAGE_MARKDOWN.length / 4);
    return new Response(HOMEPAGE_MARKDOWN, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Vary': 'Accept',
        'x-markdown-tokens': String(tokenCount),
      },
    });
  }

  return NextResponse.next();
}

export const config = { matcher: '/' };