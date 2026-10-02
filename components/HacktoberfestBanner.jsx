'use client';

import Link from 'next/link';
import { track } from '../lib/analytics.js';
import { HACKTOBERFEST_CAMPAIGN } from '../lib/hacktoberfest-campaign.js';
import styles from './HacktoberfestBanner.module.css';

export default function HacktoberfestBanner() {
  return (
    <aside className={styles.banner} aria-label="Hacktoberfest contribution finder">
      <span className={styles.season}>Hacktoberfest 2026</span>
      <span className={styles.message}>Less searching. More contributing.</span>
      <Link
        href="/hacktoberfest"
        className={styles.action}
        onClick={() => track('next_action_selected', {
          action: 'open_hacktoberfest_matchmaker',
          source: 'home_banner',
          journey: 'hacktoberfest_matchmaker',
          campaign: HACKTOBERFEST_CAMPAIGN,
        })}
      >
        Find my matches
      </Link>
    </aside>
  );
}
