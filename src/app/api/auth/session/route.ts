import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/firebase-admin';
import { isAdmin } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRY_MS = 60 * 60 * 24 * 14 * 1000; // 14 days
const headers = { 'Cache-Control': 'private, no-store' };

export const POST = withActivityLog('next_api.auth.session.POST', async (request: NextRequest) => {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400, headers });
    }

    const auth = getAuth();
    // This response now replaces the follow-up /verify request. Keep its
    // revocation/disabled-user check rather than merely decoding the token.
    const decodedToken = await auth.verifyIdToken(idToken, true);

    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });

    const response = NextResponse.json({
      status: 'ok', uid: decodedToken.uid, isAdmin: isAdmin(decodedToken),
    }, { headers });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_EXPIRY_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500, headers });
  }
});

export const DELETE = withActivityLog('next_api.auth.session.DELETE', async () => {
  const response = NextResponse.json({ status: 'ok' }, { headers });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return response;
});
