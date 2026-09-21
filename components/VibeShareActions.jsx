'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { track } from '../lib/analytics.js';
import { acquisitionAttributionProperties, vibeCardShareUrl } from '../lib/share-attribution.js';
import { vibeShareText } from '../lib/vibe-card.js';

export default function VibeShareActions({ card, siteUrl }) {
  const [shareStatus, setShareStatus] = useState('');
  const shareText = useMemo(() => vibeShareText(card), [card]);
  const links = useMemo(() => ({
    copy: vibeCardShareUrl(siteUrl, card.login, card.vibeId, 'copy_link'),
    linkedin: vibeCardShareUrl(siteUrl, card.login, card.vibeId, 'linkedin'),
    native: vibeCardShareUrl(siteUrl, card.login, card.vibeId, 'native_share'),
    x: vibeCardShareUrl(siteUrl, card.login, card.vibeId, 'x'),
  }), [card.login, card.vibeId, siteUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attribution = acquisitionAttributionProperties(params, {
      referrer: document.referrer,
      siteUrl: window.location.origin,
    });
    track('site_visited', { ...attribution, journey: 'vibe_card' });
    track('vibe_card_opened', { ...attribution, journey: 'vibe_card' });
  }, []);

  function recordShare(channel) {
    track('vibe_card_shared', { channel, journey: 'vibe_card' });
  }

  async function shareVibe() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${card.name}'s Vibe Coding session`,
          text: shareText,
          url: links.native,
        });
        setShareStatus('Shared');
        recordShare('native_share');
        return;
      }
      await navigator.clipboard.writeText(links.copy);
      setShareStatus('Link copied');
      recordShare('copy_link');
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Unable to share');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(links.copy);
      setShareStatus('Link copied');
      recordShare('copy_link');
    } catch {
      setShareStatus('Unable to copy');
    }
  }

  const xUrl = `https://x.com/intent/post?${new URLSearchParams({ text: shareText, url: links.x })}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: links.linkedin })}`;

  return (
    <div className="vibe-page__actions">
      <button type="button" className="vibe-page__share" onClick={shareVibe}>Share my vibe</button>
      <a href={xUrl} target="_blank" rel="noreferrer" onClick={() => recordShare('x')}>Post on X</a>
      <a href={linkedInUrl} target="_blank" rel="noreferrer" onClick={() => recordShare('linkedin')}>Share on LinkedIn</a>
      <button type="button" onClick={copyLink}>Copy link</button>
      <Link
        className="vibe-page__start"
        href={`/?ref=${encodeURIComponent(card.login)}&utm_source=share_page&utm_medium=referral&utm_campaign=vibe_session`}
      >
        Start your own vibe
      </Link>
      <span role="status" aria-live="polite">{shareStatus}</span>
    </div>
  );
}
