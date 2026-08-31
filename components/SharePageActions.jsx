'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import { identityCardShareUrl, socialAttributionProperties } from '../lib/share-attribution.js';

export default function SharePageActions({ login, profilePath, createPath, previewVersion }) {
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attribution = socialAttributionProperties(params);
    track('site_visited', { source: attribution.source, journey: 'share_profile' });
    if (attribution.source !== 'direct') {
      track('shared_profile_link_opened', { login, ...attribution });
    }
  }, [login]);

  async function shareCard() {
    try {
      if (navigator.share) {
        const url = identityCardShareUrl(window.location.origin, login, 'native_share', previewVersion);
        await navigator.share({
          title: `@${login}'s developer card`,
          text: `Explore @${login}'s open-source developer identity on DevGlobe.`,
          url,
        });
        setShareStatus('Shared');
        track('identity_card_shared', { login, channel: 'native_share' });
      } else {
        const url = identityCardShareUrl(window.location.origin, login, 'copy_link', previewVersion);
        await navigator.clipboard.writeText(url);
        setShareStatus('Link copied');
        track('identity_card_shared', { login, channel: 'copy_link' });
      }
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Unable to share');
    }
  }

  return (
    <div className="share-page__actions">
      <Link className="share-page__profile" href={profilePath}>Explore @{login}</Link>
      <Link className="share-page__create" href={createPath}>Create your card</Link>
      <button type="button" onClick={shareCard}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
        </svg>
        Share card
      </button>
      <span className="share-page__share-status" role="status" aria-live="polite">{shareStatus}</span>
    </div>
  );
}