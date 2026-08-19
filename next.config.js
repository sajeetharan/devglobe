/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/card': ['./node_modules/@fontsource/manrope/files/manrope-latin-*-normal.woff'],
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: '</.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"; type="application/openapi+json", </docs/mcp-server>; rel="service-doc"; type="text/markdown", </.well-known/mcp/server-card.json>; rel="describedby"; type="application/json", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", </auth.md>; rel="service-doc"; type="text/markdown"',
          },
          { key: 'Vary', value: 'Accept' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'dev-globe-viz.vercel.app' }],
        destination: 'https://www.devglobe.dev/:path*',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/badge/:login.svg',
        destination: '/badge/:login.svg',
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
