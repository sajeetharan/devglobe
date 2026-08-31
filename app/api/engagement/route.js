import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createEngagementEvent, ENGAGEMENT_RETENTION_DAYS, EngagementValidationError, isAutomatedUserAgent, resolveEngagementSession } from '../../../lib/engagement.js';
import { getEngagementContainer, saveEngagementEvent } from '../../../lib/engagement-store.js';

const MAX_BATCH_SIZE = 50;
const SESSION_COOKIE = 'devglobe-engagement-session';

export async function POST(request) {
  try {
    const userAgent = request.headers.get('user-agent');
    const destination = request.headers.get('sec-fetch-dest');
    if (isAutomatedUserAgent(userAgent) || destination === 'image') {
      return NextResponse.json({ accepted: 0, automated: true }, { status: 202 });
    }

    const container = getEngagementContainer();
    if (!container) return NextResponse.json({ error: 'Engagement tracking is unavailable' }, { status: 503 });
    const body = await request.json();
    const inputs = Array.isArray(body.events) ? body.events : [body];
    if (inputs.length === 0 || inputs.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: 'Events must contain between 1 and 50 items' }, { status: 400 });
    }
    const secret = process.env.ENGAGEMENT_HASH_SECRET || process.env.SESSION_SECRET;
    if (!secret) return NextResponse.json({ error: 'Engagement tracking is unavailable' }, { status: 503 });
    const session = resolveEngagementSession(request.cookies.get(SESSION_COOKIE)?.value, secret, randomUUID);
    const privacyKey = request.headers.get('x-azure-clientip')
      || request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';

    const events = inputs.map(input => createEngagementEvent(input, { session: session.id, secret, privacyKey }));
    const results = await Promise.all(events.map(event => saveEngagementEvent(container, event)));
    const response = NextResponse.json({ accepted: results.filter(Boolean).length, duplicates: results.filter(result => !result).length }, { status: 202 });
    if (session.cookieValue) {
      response.cookies.set(SESSION_COOKIE, session.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ENGAGEMENT_RETENTION_DAYS * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof EngagementValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message || 'Invalid event payload' }, { status: 400 });
    }
    console.error('Engagement ingestion failed:', error.message);
    return NextResponse.json({ error: 'Unable to record engagement' }, { status: 500 });
  }
}