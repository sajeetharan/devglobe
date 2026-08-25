import { promises as fs } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-static';

export async function GET() {
  const markdown = await fs.readFile(path.join(process.cwd(), 'docs', 'mcp-server.md'), 'utf8');
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}