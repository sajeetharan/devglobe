import { NextResponse } from 'next/server.js';
import { getWatchlist, normalizeDeveloperFollow } from '../../../../lib/watchlist-store.js';
import { findSharedShortlist } from '../../../../lib/shortlists.js';

export function createSharedShortlistHandler({ loadWatchlist = getWatchlist } = {}) {
  return async function GET(request) {
    try {
      const url = new URL(request.url);
      const owner = normalizeDeveloperFollow(url.searchParams.get('owner'));
      const token = url.searchParams.get('token') || '';
      if (token.length < 24 || token.length > 200) throw new Error('Invalid share link');
      const watchlist = await loadWatchlist(owner);
      const shortlist = findSharedShortlist(watchlist.shortlists, token);
      if (!shortlist) return NextResponse.json({ error: 'Shared shortlist not found' }, { status: 404 });
      return NextResponse.json({ owner, shortlist }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (/Invalid GitHub login|Invalid share link/.test(error.message)) {
        return NextResponse.json({ error: 'Shared shortlist not found' }, { status: 404 });
      }
      console.error('Shared shortlist query failed:', error.message);
      return NextResponse.json({ error: 'Unable to load shared shortlist' }, { status: 503 });
    }
  };
}

export const GET = createSharedShortlistHandler();