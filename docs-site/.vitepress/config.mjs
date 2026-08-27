import { defineConfig } from 'vitepress';

const base = process.env.DOCS_BASE || '/devglobe/';
const siteUrl = process.env.DOCS_SITE_URL || 'https://sajeetharan.github.io/devglobe/';

export default defineConfig({
  title: 'DevGlobe Docs',
  description: 'Product, API, MCP, Agent Skill, and agent-readiness documentation for DevGlobe.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: siteUrl },
  head: [
    ['meta', { name: 'theme-color', content: '#0b1412' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'DevGlobe Docs' }],
    ['link', { rel: 'icon', href: `${base}devglobe.png` }],
  ],
  themeConfig: {
    logo: '/devglobe.png',
    siteTitle: 'DevGlobe Docs',
    nav: [
      { text: 'Product', link: '/guide/overview' },
      { text: 'Agents', link: '/agents/overview' },
      { text: 'API', link: '/reference/api' },
      { text: 'Support', link: '/guide/funding' },
      { text: 'Live app', link: 'https://www.devglobe.dev' },
    ],
    sidebar: [
      {
        text: 'Product',
        items: [
          { text: 'Overview', link: '/guide/overview' },
          { text: 'Feature guide', link: '/guide/features' },
          { text: 'Scoring and OSS Worth', link: '/guide/methodology' },
          { text: 'Funding and transparency', link: '/guide/funding' },
        ],
      },
      {
        text: 'Agents',
        items: [
          { text: 'Agent overview', link: '/agents/overview' },
          { text: 'MCP server', link: '/agents/mcp' },
          { text: 'Agent workflows', link: '/agents/workflows' },
          { text: 'Agent Skill', link: '/agents/skills' },
          { text: 'Agent readiness', link: '/agents/readiness' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Public API', link: '/reference/api' },
          { text: 'Architecture and data', link: '/reference/architecture' },
          { text: 'Development and deployment', link: '/reference/development' },
        ],
      },
    ],
    search: {
      provider: 'local',
      options: { detailedView: true },
    },
    outline: { level: [2, 3] },
    editLink: {
      pattern: 'https://github.com/sajeetharan/devglobe/edit/main/docs-site/:path',
      text: 'Edit this page on GitHub',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sajeetharan/devglobe' },
    ],
    footer: {
      message: 'Public contribution discovery for humans and AI agents.',
      copyright: 'Released under the MIT License.',
    },
    notFound: {
      title: 'Documentation page not found',
      quote: 'The live application and documentation are deployed separately.',
      linkLabel: 'Return to the docs',
      linkText: 'Return to the docs',
    },
  },
});