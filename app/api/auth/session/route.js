import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth.js';

export async function GET() {
  const session = await getSession();
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

  if (!session) {
    return NextResponse.json({ user: null }, { headers });
  }

  return NextResponse.json({
    user: {
      login: session.login,
      name: session.name,
      avatarUrl: session.avatarUrl,
    },
  }, { headers });
}
