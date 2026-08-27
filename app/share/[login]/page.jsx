import { getSiteUrl, SOCIAL_PREVIEW_VERSION } from '../../../lib/site.js';
import { attributedGlobePath } from '../../../lib/share-attribution.js';
import SharePageActions from '../../../components/SharePageActions.jsx';

export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { login } = await params;
  const siteUrl = getSiteUrl();
  const encodedLogin = encodeURIComponent(login);
  const title = `@${login}'s Developer Card | DevGlobe`;
  const description = `Explore @${login}'s open-source developer identity, global rank, and impact on DevGlobe.`;
  const pageUrl = `${siteUrl}/share/${encodedLogin}?v=${SOCIAL_PREVIEW_VERSION}`;
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
      type: 'website',
      images: [{ url: imageUrl, width: 1200, height: 630, type: 'image/png', alt: `DevGlobe developer card for @${login}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: imageUrl, alt: `DevGlobe developer card for @${login}` }],
    },
  };
}

export default async function DeveloperSharePage({ params, searchParams }) {
  const { login } = await params;
  const tracking = await searchParams;
  const encodedLogin = encodeURIComponent(login);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/share/${encodedLogin}`;
  const attribution = {
    utm_source: 'share_page',
    utm_medium: 'referral',
    utm_campaign: 'identity_card',
    ...tracking,
  };
  const profilePath = attributedGlobePath(login, attribution);
  const createPath = attributedGlobePath(null, attribution);
  const profileDescription = `Explore @${login}'s open-source developer identity, global rank, country rank, and public contribution impact on DevGlobe.`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${pageUrl}#profile`,
    url: pageUrl,
    name: `@${login}'s Developer Profile | DevGlobe`,
    description: profileDescription,
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
    <main className="share-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <div className="share-page__content">
        <div className="share-page__brand">
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </div>
        <header className="share-page__intro">
          <h1>@{login}&apos;s developer profile</h1>
          <p>{profileDescription}</p>
        </header>
        <img
          className="share-page__card"
          src={`/api/preview/v${SOCIAL_PREVIEW_VERSION}/${encodedLogin}.png`}
          alt={`Developer card for @${login}`}
        />
        <SharePageActions
          login={login}
          profilePath={profilePath}
          createPath={createPath}
          previewVersion={SOCIAL_PREVIEW_VERSION}
        />
      </div>
    </main>
  );
}