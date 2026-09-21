import { NextResponse } from 'next/server';
import { listExtensionUsers } from '../../../../lib/coding-stats-store.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const developers = await listExtensionUsers();
    return NextResponse.json({ developers }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Extension user history failed:', error.message);
    return NextResponse.json({ error: 'Extension user history is unavailable' }, { status: 503 });
  }
}
