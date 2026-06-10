// POST /api/activity-logs/log
// Forwards a client-side or Next.js API route activity entry to the
// Cloud Function `logClientActivity`. The Firebase ID token (if any)
// in the Authorization header is passed through.

import { NextRequest, NextResponse } from 'next/server';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';
import { getCloudFunctionUrl } from '../../constants';

const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Unauthenticated proxy into the logging Cloud Function — generous
    // ceiling that normal browsing never hits, but stops log flooding.
    if (isRateLimited(`activity-log:${clientIpFrom(request)}`, { limit: 120, windowMs: 60 * 1000 })) {
      return NextResponse.json({ success: false }, { status: 429 });
    }

    // Reject oversized payloads before buffering the body when the
    // client declares a length; re-check real byte size after reading.
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false }, { status: 413 });
    }

    const authHeader = request.headers.get('authorization');
    const body = await request.text();

    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false }, { status: 413 });
    }

    const response = await fetch(getCloudFunctionUrl('logClientActivity'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body,
      // Don't await on the client side — fire-and-forget semantics.
      // We still await here so the proxy returns a real status code.
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[activity-logs/log] forward failed:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
