import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAccountUser } from '@/lib/auth-utils';
import { checkName } from '@/lib/medalFloor/names';
import { FloorRefusal, joinFloor, leaveFloor, readMe, storeUnavailable } from '@/lib/medalFloor/store';
import { isRateLimited } from '@/lib/rateLimit';

// A signed-in player's own place on the medal floor. Nobody is on it until they
// join: their wins are neither sent nor counted before that (the browser checks
// here first). Guests and anonymous visitors cannot join.
//
// GET    → { joined, name, tag, blocked }
// PUT    { name: string | null } → joins, or changes the name (null: "Player 1234")
// DELETE → leaves: name forgotten, this and the last day's and week's lines and the moments on show deleted

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function failed(error: unknown, what: string): NextResponse {
  if (error instanceof FloorRefusal) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  if (storeUnavailable(error)) return NextResponse.json({ error: 'The medal floor is not available here' }, { status: 503, headers: NO_STORE });
  console.error(`[game/medal-floor/me] ${what} failed:`, error);
  return NextResponse.json({ error: `Failed to ${what}` }, { status: 500, headers: NO_STORE });
}

const tooOften = (uid: string): boolean => isRateLimited(`medal-floor:me:${uid}`, { limit: 30, windowMs: 60_000 });

export const GET = withActivityLog('next_api.game.medal_floor.me.GET', async (request: NextRequest) => {
  const { user, response } = await ensureAccountUser(request);
  if (!user) return response!;
  if (tooOften(user.uid)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE });
  try {
    return NextResponse.json(await readMe(user.uid), { headers: NO_STORE });
  } catch (error) {
    return failed(error, 'read your place on the floor');
  }
});

export const PUT = withActivityLog('next_api.game.medal_floor.me.PUT', async (request: NextRequest) => {
  const { user, response } = await ensureAccountUser(request);
  if (!user) return response!;
  if (tooOften(user.uid)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE });
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 1_024) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400, headers: NO_STORE });
  }
  const raw = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).name : undefined;
  let name: string | null = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    const checked = checkName(raw);
    if (!checked.ok) return NextResponse.json({ error: 'That name cannot be used', code: 'name', reason: checked.reason }, { status: 400, headers: NO_STORE });
    name = checked.name;
  }
  try {
    return NextResponse.json(await joinFloor(user.uid, name, Date.now()), { headers: NO_STORE });
  } catch (error) {
    return failed(error, 'join the floor');
  }
});

export const DELETE = withActivityLog('next_api.game.medal_floor.me.DELETE', async (request: NextRequest) => {
  const { user, response } = await ensureAccountUser(request);
  if (!user) return response!;
  if (tooOften(user.uid)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE });
  try {
    return NextResponse.json(await leaveFloor(user.uid, Date.now()), { headers: NO_STORE });
  } catch (error) {
    return failed(error, 'leave the floor');
  }
});
