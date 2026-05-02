// POST /api/activity-logs/log
// Forwards a client-side or Next.js API route activity entry to the
// Cloud Function `logClientActivity`. The Firebase ID token (if any)
// in the Authorization header is passed through.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.text();

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
