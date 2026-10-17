import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAccountUser } from '@/lib/auth-utils';
import { REPORT_BYTES, checkReport } from '@/lib/medalFloor/report';
import { FloorRefusal, reportToFloor, storeUnavailable } from '@/lib/medalFloor/store';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';

// POST /api/game/medal-floor/report — a signed-in player's browser tells the
// floor what one machine paid them: { game, won, best?, moment?: { medals, label? } }.
//
// The medals are the player's own, kept in their browser, so this is their
// word. It is believed only within limits (lib/medalFloor/report.ts and
// games.ts): a known machine, no win bigger than that machine can pay at all, a
// named win only in an amount it pays, medals won no faster than the machine
// can be played, a day's most, and REPORTS_PER_MINUTE reports a minute. The
// account comes from the verified ID token, never from the body; the server's
// clock decides when it happened.

const NO_STORE = { 'Cache-Control': 'no-store' };

export const POST = withActivityLog('next_api.game.medal_floor.report.POST', async (request: NextRequest) => {
  const { user, response } = await ensureAccountUser(request);
  if (!user) return response!;
  // A first, cheap gate per instance; the real per-player count is kept with the player (store.ts).
  if (isRateLimited(`medal-floor:report:${user.uid}`, { limit: 40, windowMs: 60_000 }) || isRateLimited(`medal-floor:report-ip:${clientIpFrom(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many reports' }, { status: 429, headers: NO_STORE });
  }
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > REPORT_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: 'Unreadable body' }, { status: 400, headers: NO_STORE });
  }
  if (text.length > REPORT_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400, headers: NO_STORE });
  }
  const checked = checkReport(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await reportToFloor(user.uid, checked.report, Date.now()), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof FloorRefusal) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
    if (storeUnavailable(error)) return NextResponse.json({ error: 'The medal floor is not available here' }, { status: 503, headers: NO_STORE });
    console.error('[game/medal-floor/report] failed:', error);
    return NextResponse.json({ error: 'Failed to report' }, { status: 500, headers: NO_STORE });
  }
});
