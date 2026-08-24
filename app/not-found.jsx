import Link from 'next/link';

export const metadata = {
  title: 'Not found | DevGlobe',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="machine-not-found">
      <h1>404: Resource not found</h1>
      <p>The requested DevGlobe resource does not exist.</p>
      <pre>{`# Where to look next

- Sitemap: /sitemap.xml
- Agent guide: /llms.txt
- API catalog: /.well-known/api-catalog
- OpenAPI: /openapi.json
- MCP documentation: /docs/mcp-server`}</pre>
      <nav aria-label="Recovery links">
        <Link href="/">Return to DevGlobe</Link>
        <Link href="/agents">Agent setup</Link>
        <Link href="/docs/mcp-server">MCP documentation</Link>
      </nav>
    </main>
  );
}
