// POST /api/game/shogi/records
//
// Forwards one finished (or abandoned) shogi game to the Cloud Function
// `saveShogiGameRecord`, which validates the payload and stores the kifu.
//
// Unauthenticated on purpose — see the Cloud Function's header for why the
// records would be worthless if only signed-in visitors were recorded. This
// proxy is the first of the two gates in front of that openness: a per-IP
// rate limit and a byte ceiling. The second is the payload allowlist on the
// function itself.

import { NextRequest, NextResponse } from 'next/server';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';
import { getCloudFunctionUrl } from '../../../constants';

// A record is at most ~30KB of moves and notation (600 plies); 96KB leaves
// room for that plus the envelope while still refusing anything that could
// only be an attempt to park a blob in Firestore.
const MAX_BODY_BYTES = 96 * 1024;

// A game record is written at most twice per game (the finish, or the
// abandonment), and a human cannot start and finish games quickly. Twenty a
// minute is far above real play and far below what would matter as write
// volume — deliberately tighter than the activity-log proxy's 120, because
// each of these is a document that lives for two years rather than a log row.
const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(`shogi-game-record:${clientIpFrom(request)}`, RATE_LIMIT)) {
      return NextResponse.json({ success: false }, { status: 429 });
    }

    // Refuse on the declared length before buffering, then re-check the real
    // size — Content-Length is client-controlled and may simply be absent.
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false }, { status: 413 });
    }

    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false }, { status: 413 });
    }

    // The ID token is optional and only passed through: signed-in games get an
    // agent_uid, everyone else is attributed to their browser session_id.
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('saveShogiGameRecord'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body,
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[game/shogi/records] forward failed:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
