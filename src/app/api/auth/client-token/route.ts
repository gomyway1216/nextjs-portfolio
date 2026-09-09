import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/firebase-admin';
import { isAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

const SESSION_COOKIE_NAME = '__session';
const headers = { 'Cache-Control': 'private, no-store' };

export const POST = withActivityLog('next_api.auth.client-token.POST', async (request: NextRequest) => {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: 'No session' }, { status: 401, headers });
    }

    const auth = getAuth();
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    const customToken = await auth.createCustomToken(decodedClaims.uid);

    return NextResponse.json({
      customToken, uid: decodedClaims.uid, isAdmin: isAdmin(decodedClaims),
    }, { headers });
  } catch (error) {
    console.error('Session client token creation error:', error);
    return NextResponse.json({ error: 'Invalid session' }, { status: 401, headers });
  }
});
