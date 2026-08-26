import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/firebase-admin';
import { isAdmin } from '@/lib/auth-utils';

const SESSION_COOKIE_NAME = '__session';

export interface ServerAdminSession {
  uid: string;
  email?: string;
}

/**
 * Verify the server session without exposing claims to a client component.
 * Invalid, expired, revoked, and non-admin sessions all fail closed.
 */
export async function getServerAdminSession(): Promise<ServerAdminSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decodedClaims = await getAuth().verifySessionCookie(sessionCookie, true);
    if (!isAdmin(decodedClaims)) return null;

    return {
      uid: decodedClaims.uid,
      ...(decodedClaims.email ? { email: decodedClaims.email } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Gate private server-component work before any protected data dependency runs.
 */
export async function requireServerAdmin(returnPath: string): Promise<ServerAdminSession> {
  const admin = await getServerAdminSession();
  if (!admin) {
    redirect(`/signin?redirect=${encodeURIComponent(returnPath)}`);
  }
  return admin;
}
