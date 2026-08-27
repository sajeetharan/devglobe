import { NextResponse } from 'next/server';
import {
  getLatestImpactDayOnOrBefore,
  getImpactSnapshotForDay,
} from '../../../../lib/impact-history-store.js';
import {
  normalizeLeaderboardLogins,
  normalizeLeaderboardPeriod,
} from '../../../../lib/leaderboard-movement.js';
import { windowStartDay } from '../../../../lib/trending.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const period = normalizeLeaderboardPeriod(searchParams.get('days'));
  const logins = normalizeLeaderboardLogins(searchParams.get('logins'));
  if (logins.length === 0) {
    return NextResponse.json({ error: 'At least one valid login is required' }, { status: 400 });
  }
  const cutoffDay = windowStartDay(period);

  try {
    const baselineDay = await getLatestImpactDayOnOrBefore(cutoffDay);
    const snapshots = baselineDay
      ? (await Promise.all(logins.map(login => getImpactSnapshotForDay(login, baselineDay)))).filter(Boolean)
      : [];
    return NextResponse.json({
      period,
      cutoffDay,
      baselineDay,
      hasHistory: snapshots.length > 0,
      snapshots: snapshots.map(snapshot => ({
        login: snapshot.login,
        day: snapshot.day,
        globalRank: snapshot.globalRank,
      })),
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('Leaderboard movement error:', error.message);
    return NextResponse.json({ error: 'Unable to load rank movement' }, { status: 500 });
  }
}