import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { emptySummary, readFloor, storeUnavailable, type FloorView } from '@/lib/medalFloor/store';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';
import type { FloorSummary } from '@/lib/medalFloor/types';

// GET /api/game/medal-floor?view=hub|full — what the medal floor shows: the
// moments on show and today's and this week's ranking boards. Public, and the
// same for everybody (names and medals only, never an account), so it is
// cached for a few seconds at the edge and on this instance. The live feed
// itself comes straight from the Realtime Database where its rules allow;
// this is its first paint and its fallback.

/** How long one answer is kept, here and at the edge. */
const CACHE_MS = 10_000;
const cache = new Map<FloorView, { at: number; body: FloorSummary }>();

export const GET = withActivityLog('next_api.game.medal_floor.GET', async (request: NextRequest) => {
  if (isRateLimited(`medal-floor:read:${clientIpFrom(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const view: FloorView = request.nextUrl.searchParams.get('view') === 'full' ? 'full' : 'hub';
  const now = Date.now();
  const kept = cache.get(view);
  let body: FloorSummary;
  if (kept && now - kept.at < CACHE_MS) body = kept.body;
  else {
    try {
      body = await readFloor(view, now);
      cache.set(view, { at: now, body });
    } catch (error) {
      // Not set up here (a build, or a machine without credentials): an empty floor. Set up and failing: the same, said as a failure.
      const unavailable = storeUnavailable(error);
      if (!unavailable) console.error('[game/medal-floor] read failed:', error);
      return NextResponse.json(emptySummary(now), { status: unavailable ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': `public, s-maxage=${CACHE_MS / 1000}, stale-while-revalidate=30` } });
});
