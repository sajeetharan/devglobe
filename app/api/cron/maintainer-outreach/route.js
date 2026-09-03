import { NextResponse } from 'next/server';
import { runMaintainerOutreachSchedule } from '../../../../lib/maintainer-outreach-scheduler.js';

export const maxDuration = 300;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runMaintainerOutreachSchedule();
    console.info(JSON.stringify({ event: 'devglobe_maintainer_outreach_queue', outcome: 'completed', ...summary }));
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    console.error(JSON.stringify({ event: 'devglobe_maintainer_outreach_queue', outcome: 'failed' }));
    return NextResponse.json({ error: 'Maintainer outreach queue failed' }, { status: 500 });
  }
}