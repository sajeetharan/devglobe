/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/card': ['./node_modules/@fontsource/manrope/files/manrope-latin-*-normal.woff'],
    '/docs/mcp-server': ['./docs/mcp-server.md'],
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: '</.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"; type="application/openapi+json", </docs/mcp-server>; rel="service-doc"; type="text/markdown", </.well-known/mcp/server-card.json>; rel="describedby"; type="application/json", </.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </auth.md>; rel="service-doc"; type="text/markdown"',
          },
          { key: 'Vary', value: 'Accept' },
        ],
      },
      {
        source: '/share/:login',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
};
export default nextConfig;
