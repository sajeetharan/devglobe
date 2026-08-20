import '../styles/main.css';
import { getSiteUrl } from '../lib/site.js';
import WebMcpProvider from '../components/WebMcpProvider.jsx';
import AppInsights from '../components/AppInsights.jsx';

const siteUrl = getSiteUrl();
const title = 'DevGlobe: Developer Discovery for Humans & AI Agents';
const description = 'Discover 26,000+ open-source developers by expertise, location, language, and verified contributions using DevGlobe vector and hybrid search.';
const githubUrl = 'https://github.com/sajeetharan/devglobe';

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'DevGlobe',
      alternateName: 'Dev Globe',
      description,
      inLanguage: 'en',
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'DevGlobe',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/devglobe.png`,
      },
      sameAs: [githubUrl],
    },
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#application`,
      name: 'DevGlobe',
      url: siteUrl,
      description,
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Developer discovery platform',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript and a WebGL-capable browser',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: 0,
        priceCurrency: 'USD',
      },
      featureList: [
        'Interactive global developer discovery',
        'Developer rankings by open-source impact',
        'Country and language leaderboards',
        'GitHub and Stack Overflow contribution profiles',
        'Semantic and hybrid developer search',
        'Shareable developer identity cards',
        'Agent-ready developer discovery roadmap',
      ],
      about: [
        { '@type': 'Thing', name: 'Software developers' },
        { '@type': 'Thing', name: 'Developer discovery' },
        { '@type': 'Thing', name: 'Developer platforms' },
        { '@type': 'Thing', name: 'Open source software' },
        { '@type': 'Thing', name: 'AI coding agents' },
      ],
      audience: {
        '@type': 'Audience',
        audienceType: 'Developers, engineering teams, open-source maintainers, and technical recruiters',
      },
    },
  ],
};

export const metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'DevGlobe',
  title,
  description,
  alternates: { canonical: '/' },
  authors: [{ name: 'DevGlobe Contributors', url: githubUrl }],
  creator: 'DevGlobe',
  publisher: 'DevGlobe',
  category: 'technology',
  keywords: [
    'developer platform',
    'developer discovery platform',
    'find developers',
    'developer search',
    'developer network',
    'open source developers',
    'developer profiles',
    'developer discovery',
    'AI coding agents',
    'AI agent developer discovery',
    'human AI collaboration',
    'Azure Cosmos DB vector search',
    'GitHub developers',
    'developer rankings',
    'global developer community',
  ],
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'DevGlobe',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'DevGlobe developer discovery platform and global developer network' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/opengraph-image'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/devglobe.png" type="image/png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script
          // Runs before paint to avoid a flash of the wrong theme on load.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('devglobe-theme');
                  var theme = stored === 'light' || stored === 'dark'
                    ? stored
                    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
                  if (theme === 'light') {
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <WebMcpProvider />
        <AppInsights />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
        {children}
      </body>
    </html>
  );
}