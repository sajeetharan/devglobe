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
    console.info('Weekly digest completed', summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error('Weekly digest failed:', error.message);
    return NextResponse.json({ error: 'Weekly digest failed' }, { status: 500 });
  }
}