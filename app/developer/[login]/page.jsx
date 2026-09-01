import DeveloperActivityPage from '../../../components/DeveloperActivityPage.jsx';
import { normalizeDeveloperLogin } from '../../../lib/share-attribution.js';
import { getSiteUrl, SOCIAL_PREVIEW_VERSION } from '../../../lib/site.js';

export async function generateMetadata({ params }) {
  const login = normalizeDeveloperLogin((await params).login);
  const siteUrl = getSiteUrl();
  const encodedLogin = encodeURIComponent(login);
  const pageUrl = `${siteUrl}/developer/${encodedLogin}`;
  const title = `@${login} Open-Source Developer Activity | DevGlobe`;
  const description = `Explore @${login}'s public GitHub activity, open-source contributions, developer ranking, and collaboration profile on DevGlobe.`;
  const imageUrl = `${siteUrl}/api/preview/v${SOCIAL_PREVIEW_VERSION}/${encodedLogin}.png`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'DevGlobe',
      type: 'profile',
      images: [{ url: imageUrl, width: 1200, height: 630, type: 'image/png', alt: `DevGlobe profile for @${login}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: imageUrl, alt: `DevGlobe profile for @${login}` }],
    },
  };
}

export default async function DeveloperPage({ params }) {
  const login = normalizeDeveloperLogin((await params).login);
  const siteUrl = getSiteUrl();
  const encodedLogin = encodeURIComponent(login);
  const pageUrl = `${siteUrl}/developer/${encodedLogin}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${pageUrl}#profile`,
    url: pageUrl,
    name: `@${login} Open-Source Developer Profile | DevGlobe`,
    isPartOf: { '@id': `${siteUrl}/#website` },
    mainEntity: {
      '@type': 'Person',
      identifier: login,
      name: `@${login}`,
      url: pageUrl,
      sameAs: [`https://github.com/${encodedLogin}`],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <DeveloperActivityPage login={login} />
    </>
  );
}