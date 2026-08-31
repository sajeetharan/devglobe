import { NextResponse } from 'next/server';
import { sendWeeklyDigests } from '../../../../lib/weekly-digest.js';

export const maxDuration = 300;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await sendWeeklyDigests();
    console.info(JSON.stringify({ event: 'devglobe_weekly_digest', outcome: 'completed', ...summary }));
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error(JSON.stringify({ event: 'devglobe_weekly_digest', outcome: 'failed' }));
    return NextResponse.json({ error: 'Weekly digest failed' }, { status: 500 });
  }
}