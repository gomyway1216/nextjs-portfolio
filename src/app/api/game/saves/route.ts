import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { GAME_SAVES_COLLECTION } from '../../constants';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

// Mid-game save slots, one per (signed-in user, game). Unlike high
// scores (which accept guest localStorage ids), saves require a real
// account — that's the product promise: play anonymously, sign in to
// keep progress.
//
// Document path: game_saves/{uid}/saves/{gameKey}

const GAME_KEY_PATTERN = /^[a-z0-9-]{1,64}$/;
// A save is a small JSON snapshot (shogi: 81-cell board + hands ≈ 1KB).
const MAX_STATE_BYTES = 64 * 1024;

function isValidGameKey(value: unknown): value is string {
  return typeof value === 'string' && GAME_KEY_PATTERN.test(value);
}

function saveDocRef(uid: string, gameKey: string) {
  return getFirestore()
    .collection(GAME_SAVES_COLLECTION)
    .doc(uid)
    .collection('saves')
    .doc(gameKey);
}

/**
 * GET /api/game/saves?gameKey=shogi-improved
 * Returns { save: { state, updatedAt } | null } for the signed-in user.
 */
export const GET = withActivityLog('next_api.game.saves.GET', async (request: NextRequest) => {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const gameKey = request.nextUrl.searchParams.get('gameKey');
  if (!isValidGameKey(gameKey)) {
    return NextResponse.json({ error: 'Invalid gameKey' }, { status: 400 });
  }

  try {
    const doc = await saveDocRef(user.uid, gameKey).get();
    if (!doc.exists) {
      return NextResponse.json({ save: null });
    }
    const data = doc.data() ?? {};
    return NextResponse.json({
      save: {
        state: data.state ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
      },
    });
  } catch (error) {
    console.error('[game/saves] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load save' }, { status: 500 });
  }
});

/**
 * PUT /api/game/saves
 * Body: { gameKey, state } — overwrites the user's save slot for that game.
 */
export const PUT = withActivityLog('next_api.game.saves.PUT', async (request: NextRequest) => {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  // Reject oversized payloads via Content-Length before buffering the
  // body (consistent with /api/contact). The 2× headroom over the state
  // cap covers the gameKey + JSON envelope.
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_STATE_BYTES * 2) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  try {
    const { gameKey, state } = (body ?? {}) as { gameKey?: unknown; state?: unknown };

    if (!isValidGameKey(gameKey)) {
      return NextResponse.json({ error: 'Invalid gameKey' }, { status: 400 });
    }
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      return NextResponse.json({ error: 'state must be an object' }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX_STATE_BYTES) {
      return NextResponse.json({ error: 'Save state too large' }, { status: 413 });
    }

    await saveDocRef(user.uid, gameKey).set({
      state,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[game/saves] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to save game' }, { status: 500 });
  }
});

/**
 * DELETE /api/game/saves?gameKey=shogi-improved
 * Clears the save slot (e.g. when a game finishes).
 */
export const DELETE = withActivityLog('next_api.game.saves.DELETE', async (request: NextRequest) => {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const gameKey = request.nextUrl.searchParams.get('gameKey');
  if (!isValidGameKey(gameKey)) {
    return NextResponse.json({ error: 'Invalid gameKey' }, { status: 400 });
  }

  try {
    await saveDocRef(user.uid, gameKey).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[game/saves] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete save' }, { status: 500 });
  }
});
