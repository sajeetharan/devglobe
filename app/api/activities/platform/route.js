import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth.js';
import { saveActivities } from '../../../../lib/activity-store.js';
import { createPlatformActivity } from '../../../../lib/platform-activity.js';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const ACTIVITY_TYPES = new Set(['generated_card', 'generated_readme']);

export async function POST(request) {
  try {
    const body = await request.json();
    if (!ACTIVITY_TYPES.has(body.type) || !LOGIN_PATTERN.test(body.targetLogin || '')) {
      return NextResponse.json({ error: 'Invalid platform activity' }, { status: 400 });
    }

    const session = await getSession();
    if (!session?.login || !LOGIN_PATTERN.test(session.login)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const activity = createPlatformActivity({
      type: body.type,
      login: session.login,
      avatarUrl: session?.avatarUrl,
      targetLogin: body.targetLogin,
    });
    await saveActivities([activity]);
    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error('Platform activity write failed:', error.message);
    return NextResponse.json({ error: 'Unable to record platform activity' }, { status: 500 });
  }
}