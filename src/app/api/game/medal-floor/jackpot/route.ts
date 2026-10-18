import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { unavailableJackpot, type FloorJackpotView } from '@/lib/medalFloor/jackpot';
import { readJackpot, storeUnavailable } from '@/lib/medalFloor/store';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';

// GET /api/game/medal-floor/jackpot — the floor jackpot as everybody is shown it: the medals in the pool, how many
// times it has been won, and its last wins (a name or four digits, the machine, the medals, when; never an account).
// Public and the same for everybody, so it is cached for a few seconds at the edge and on this instance. Every
// machine's page shows it, live from the Realtime Database where its rules allow; this is its first paint and its
// fallback, asked every 30 seconds while the live one is not there.

/** How long one answer is kept, here and at the edge. */
const CACHE_MS = 5_000;
let kept: { at: number; body: FloorJackpotView } | null = null;
/** After a read fails, the store is not asked again for this long (as the floor's own route: a store not set up here is not asked on every page). */
const RESTING_MS = 30_000;
let resting: { until: number; status: number } | null = null;

export const GET = withActivityLog('next_api.game.medal_floor.jackpot.GET', async (request: NextRequest) => {
  if (isRateLimited(`medal-floor:jackpot:${clientIpFrom(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const now = Date.now();
  let body: FloorJackpotView;
  if (kept && now - kept.at < CACHE_MS) body = kept.body;
  else if (resting && now < resting.until) return NextResponse.json(unavailableJackpot(now), { status: resting.status, headers: { 'Cache-Control': 'no-store' } });
  else {
    try {
      body = await readJackpot(now);
      kept = { at: now, body };
      resting = null;
    } catch (error) {
      // Not set up here (a build, or a machine without credentials): nothing to show. Set up and failing: the same, said as a failure.
      const unavailable = storeUnavailable(error);
      if (!unavailable) console.error('[game/medal-floor/jackpot] read failed:', error);
      resting = { until: now + RESTING_MS, status: unavailable ? 200 : 503 };
      return NextResponse.json(unavailableJackpot(now), { status: resting.status, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': `public, s-maxage=${CACHE_MS / 1000}, stale-while-revalidate=30` } });
});
