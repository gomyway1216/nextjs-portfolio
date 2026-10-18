import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAccountUser } from '@/lib/auth-utils';
import { isDeviceName, isWinId } from '@/lib/medalFloor/jackpot';
import { FloorRefusal, ackWin, claimWins, storeUnavailable } from '@/lib/medalFloor/store';
import { isRateLimited } from '@/lib/rateLimit';

// POST /api/game/medal-floor/jackpot/wins — a signed-in player's floor jackpots, on their way into their medals.
//
// { action: 'claim', device } → { wins: [{ id, medals, at }] }   the wins still to be paid, for this device to pay
// { action: 'ack', id }       → { done: true }                    one of them is in the player's medals now (said again: done)
//
// The medals are kept in the player's browser, so the browser pays a win into them, once, under a receipt named by the
// win (`floor-jackpot:<id>:pay`), and then says so. The server keeps the win until it is told, so that a page that
// dies halfway pays it when it is next opened, and never twice. The account comes from the verified ID token, never
// from the body, and a player is only ever handed their own wins.

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const BODY_BYTES = 256;

export const POST = withActivityLog('next_api.game.medal_floor.jackpot.wins.POST', async (request: NextRequest) => {
  const { user, response } = await ensureAccountUser(request);
  if (!user) return response!;
  if (isRateLimited(`medal-floor:wins:${user.uid}`, { limit: 30, windowMs: 60_000 })) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE });
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400, headers: NO_STORE });
  }
  try {
    if (body.action === 'claim' && isDeviceName(body.device)) {
      return NextResponse.json({ wins: await claimWins(user.uid, body.device, Date.now()) }, { headers: NO_STORE });
    }
    if (body.action === 'ack' && isWinId(body.id)) {
      await ackWin(user.uid, body.id, Date.now());
      return NextResponse.json({ done: true }, { headers: NO_STORE });
    }
    return NextResponse.json({ error: 'Unknown action or bad arguments' }, { status: 400, headers: NO_STORE });
  } catch (error) {
    if (error instanceof FloorRefusal) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
    if (storeUnavailable(error)) return NextResponse.json({ error: 'The medal floor is not available here' }, { status: 503, headers: NO_STORE });
    console.error('[game/medal-floor/jackpot/wins] failed:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers: NO_STORE });
  }
});
