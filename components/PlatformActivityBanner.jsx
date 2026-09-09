'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useGlobalActivityFeed } from './useGlobalActivityFeed.js';

const DEVELOPER_FEEDBACK = [
  {
    id: 'reddit-p8m16h9',
    quote: 'The 3D globe looks really slick in the editor.',
    url: 'https://www.reddit.com/r/SideProject/comments/1wavcqv/comment/p8m16h9/',
  },
  {
    id: 'reddit-p8l5tt9',
    quote: 'The globe is a nice hook, but the mission match is prob the sticky part.',
    url: 'https://www.reddit.com/r/SideProject/comments/1wavcqv/comment/p8l5tt9/',
  },
];

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function PlatformActivityBanner() {
  const { activities } = useGlobalActivityFeed(true, { intervalMs: 300000 });
  const [visibleIndex, setVisibleIndex] = useState(0);
  const bannerItems = [
    ...DEVELOPER_FEEDBACK.map(feedback => ({ ...feedback, type: 'feedback' })),
    ...activities.slice(0, 6).map(activity => ({ ...activity, type: 'activity' })),
  ];

  useEffect(() => {
    if (bannerItems.length < 2) return undefined;
    const interval = setInterval(() => {
      setVisibleIndex(current => (current + 1) % bannerItems.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [bannerItems.length]);

  useEffect(() => {
    setVisibleIndex(0);
  }, [activities[0]?.id]);

  const item = bannerItems[visibleIndex % bannerItems.length];

  return (
    <aside className="activity-banner" aria-label="Developer feedback and recent platform activity" aria-live="polite">
      {item.type === 'feedback' ? (
        <>
          <span className="activity-banner__feedback-mark" aria-hidden="true">“</span>
          <span className="activity-banner__label activity-banner__label--feedback">Feedback</span>
          <strong className="activity-banner__feedback-author">Anonymous developer</strong>
          <a className="activity-banner__detail" href={item.url} target="_blank" rel="noreferrer">
            {item.quote}
          </a>
        </>
      ) : (
        <>
          <span className="activity-banner__pulse" aria-hidden="true" />
          <span className="activity-banner__label">Live</span>
          <Link href={`/developer/${encodeURIComponent(item.login)}`} className="activity-banner__actor">
            {item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span aria-hidden="true">{item.login[0].toUpperCase()}</span>}
            @{item.login}
          </Link>
          <a className="activity-banner__detail" href={item.url}>{item.description}</a>
          <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
        </>
      )}
    </aside>
  );
}
