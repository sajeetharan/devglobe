import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import VibeShareActions from '../../../../components/VibeShareActions.jsx';
import { findVibeCard } from '../../../../lib/vibe-card-store.js';
import { formatVibeDuration, vibeShareText } from '../../../../lib/vibe-card.js';
import { getSiteUrl } from '../../../../lib/site.js';

export const dynamic = 'force-dynamic';

const getVibeCard = cache(findVibeCard);

export async function generateMetadata({ params }) {
  const { login, id } = await params;
  const card = await getVibeCard(login, id);
  if (!card) return {};
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/vibe/${encodeURIComponent(card.login)}/${encodeURIComponent(card.vibeId)}`;
  const imageUrl = `${siteUrl}/api/vibe/${encodeURIComponent(card.login)}/${encodeURIComponent(card.vibeId)}/image`;
  const title = `${card.name}'s ${formatVibeDuration(card.durationMinutes)} Vibe Coding session | DevGlobe`;
  const description = vibeShareText(card);
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
      images: [{ url: imageUrl, width: 1200, height: 630, type: 'image/png', alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: imageUrl, alt: title }],
    },
  };
}

export default async function VibeCardPage({ params }) {
  const { login, id } = await params;
  const card = await getVibeCard(login, id);
  if (!card) notFound();
  const siteUrl = getSiteUrl();
  const imagePath = `/api/vibe/${encodeURIComponent(card.login)}/${encodeURIComponent(card.vibeId)}/image`;

  return (
    <main className="vibe-page">
      <div className="vibe-page__shell">
        <header className="vibe-page__header">
          <Link href="/" className="vibe-page__brand">
            <img src="/devglobe.png" alt="" />
            <span>DevGlobe</span>
          </Link>
          <span className="vibe-page__signal"><i aria-hidden="true" /> Session shipped</span>
        </header>
        <section className="vibe-page__intro">
          <p>@{card.login} was in the zone</p>
          <h1>{card.name}&apos;s Vibe Coding receipt</h1>
          <span>{vibeShareText(card)}</span>
        </section>
        <img
          className="vibe-page__card"
          src={imagePath}
          alt={`${card.name}'s ${formatVibeDuration(card.durationMinutes)} Vibe Coding session`}
        />
        <VibeShareActions card={card} siteUrl={siteUrl} />
        <p className="vibe-page__privacy">Built from public, opt-in session metadata. Source code, file names, and repositories stay private.</p>
      </div>
    </main>
  );
}
