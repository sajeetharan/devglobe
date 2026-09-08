import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth.js';
import { buildCodingStats } from '../../../lib/coding-stats.js';
import { listCodingDays } from '../../../lib/coding-stats-store.js';
import { recordExtensionEvent } from '../../../lib/extension-telemetry.js';

export async function GET() {
  const session = await getSession();
  if (!session?.login) {
    return NextResponse.json({ error: 'Sign in to view coding stats' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  try {
    const documents = await listCodingDays(session.login);
    await recordExtensionEvent('coding_stats_viewed', session.login, { source: 'coding_dashboard' }).catch(error => {
      console.error('Coding stats telemetry failed:', error.message);
    });
    return NextResponse.json({ login: session.login, ...buildCodingStats(documents) }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Coding stats query failed:', error.message);
    return NextResponse.json({ error: 'Coding stats are temporarily unavailable' }, { status: 503 });
  }
}