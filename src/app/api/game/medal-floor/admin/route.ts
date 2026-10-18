import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAdmin } from '@/lib/auth-utils';
import { isWinId } from '@/lib/medalFloor/jackpot';
import { FloorRefusal, blockPlayer, hideLine, hideMoment, isBoard, isPeriodId, isPid, readFloor, storeUnavailable, voidWin } from '@/lib/medalFloor/store';

// The owner's controls for the medal floor (admin only, by `ensureAdmin`).
//
// GET  → the full floor with every line, hidden ones marked, and each line's opaque player id (never the account id),
//        and the floor jackpot's last wins with each one's name and state
// POST { action: 'hide-line' | 'show-line', period, board, pid }   one line of one board
//      { action: 'hide-moment', id }                               one moment on show
//      { action: 'block' | 'unblock', pid }                       a player: nothing more counted, their lines hidden
//      { action: 'void-jackpot', id }                             a floor jackpot that is plainly not real: not paid, and the pool given back

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function failed(error: unknown): NextResponse {
  if (error instanceof FloorRefusal) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  if (storeUnavailable(error)) return NextResponse.json({ error: 'The medal floor is not available here' }, { status: 503, headers: NO_STORE });
  console.error('[game/medal-floor/admin] failed:', error);
  return NextResponse.json({ error: 'Failed' }, { status: 500, headers: NO_STORE });
}

export const GET = withActivityLog('next_api.game.medal_floor.admin.GET', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;
  try {
    return NextResponse.json(await readFloor('full', Date.now(), true), { headers: NO_STORE });
  } catch (error) {
    return failed(error);
  }
});

export const POST = withActivityLog('next_api.game.medal_floor.admin.POST', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400, headers: NO_STORE });
  }
  try {
    switch (body.action) {
      case 'hide-line':
      case 'show-line':
        if (!isPeriodId(body.period) || !isBoard(body.board) || !isPid(body.pid)) break;
        await hideLine(body.period, body.board, body.pid, body.action === 'hide-line');
        return NextResponse.json({ done: true }, { headers: NO_STORE });
      case 'hide-moment':
        if (typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id < 1) break;
        await hideMoment(body.id);
        return NextResponse.json({ done: true }, { headers: NO_STORE });
      case 'block':
      case 'unblock':
        if (!isPid(body.pid)) break;
        await blockPlayer(body.pid, body.action === 'block', Date.now());
        return NextResponse.json({ done: true }, { headers: NO_STORE });
      case 'void-jackpot':
        if (!isWinId(body.id)) break;
        await voidWin(body.id, Date.now());
        return NextResponse.json({ done: true }, { headers: NO_STORE });
      default:
        break;
    }
    return NextResponse.json({ error: 'Unknown action or bad arguments' }, { status: 400, headers: NO_STORE });
  } catch (error) {
    return failed(error);
  }
});
