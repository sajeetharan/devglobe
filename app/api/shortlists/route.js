import { NextResponse } from 'next/server.js';
import { getSession } from '../../../lib/auth.js';
import { getWatchlist, mutateShortlists } from '../../../lib/watchlist-store.js';
import {
  createShortlist,
  deleteShortlist,
  ownerShortlistView,
  updateShortlist,
} from '../../../lib/shortlists.js';

const VALIDATION_ERROR = /must be|limit|already|not found|Invalid GitHub login|Unsupported shortlist action|not in this shortlist/;

export function createShortlistHandlers({
  getAuthenticatedSession = getSession,
  loadWatchlist = getWatchlist,
  mutate = mutateShortlists,
} = {}) {
  async function requireOwner() {
    const session = await getAuthenticatedSession();
    return session?.login || null;
  }

  async function GET() {
    const login = await requireOwner();
    if (!login) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    try {
      const watchlist = await loadWatchlist(login);
      return NextResponse.json({ shortlists: ownerShortlistView(watchlist.shortlists) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      console.error('Shortlist query failed:', error.message);
      return NextResponse.json({ error: 'Unable to load shortlists' }, { status: 503 });
    }
  }

  async function POST(request) {
    const login = await requireOwner();
    if (!login) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    try {
      const body = await request.json();
      const { watchlist } = await mutate(login, shortlists => ({ shortlists: createShortlist(shortlists, body) }));
      return NextResponse.json({ shortlists: ownerShortlistView(watchlist.shortlists) }, { status: 201 });
    } catch (error) {
      const validation = VALIDATION_ERROR.test(error.message);
      if (!validation) console.error('Shortlist creation failed:', error.message);
      return NextResponse.json({ error: validation ? error.message : 'Unable to create shortlist' }, { status: validation ? 400 : 500 });
    }
  }

  async function PATCH(request) {
    const login = await requireOwner();
    if (!login) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    try {
      const body = await request.json();
      let shareToken;
      const { watchlist } = await mutate(login, shortlists => {
        const result = updateShortlist(shortlists, body);
        shareToken = result.shareToken;
        return result;
      });
      return NextResponse.json({ shortlists: ownerShortlistView(watchlist.shortlists), shareToken });
    } catch (error) {
      const validation = VALIDATION_ERROR.test(error.message);
      if (!validation) console.error('Shortlist update failed:', error.message);
      return NextResponse.json({ error: validation ? error.message : 'Unable to update shortlist' }, { status: validation ? 400 : 500 });
    }
  }

  async function DELETE(request) {
    const login = await requireOwner();
    if (!login) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    try {
      const { id } = await request.json();
      const { watchlist } = await mutate(login, shortlists => ({ shortlists: deleteShortlist(shortlists, id) }));
      return NextResponse.json({ shortlists: ownerShortlistView(watchlist.shortlists) });
    } catch (error) {
      const validation = VALIDATION_ERROR.test(error.message);
      if (!validation) console.error('Shortlist deletion failed:', error.message);
      return NextResponse.json({ error: validation ? error.message : 'Unable to delete shortlist' }, { status: validation ? 400 : 500 });
    }
  }

  return { GET, POST, PATCH, DELETE };
}

export const { GET, POST, PATCH, DELETE } = createShortlistHandlers();