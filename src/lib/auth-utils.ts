import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from './firebase-admin';

/**
 * Extract the Firebase ID token from the Authorization header
 */
function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Verify the Firebase ID token and return the decoded token
 */
export async function verifyIdToken(token: string) {
  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying ID token:', error);
    return null;
  }
}

/**
 * Ensure that the request has a valid user token
 * Returns the user object if valid, or an error response if not
 */
export async function ensureValidUser(request: NextRequest): Promise<{
  user: { uid: string; email?: string } | null;
  response?: NextResponse;
}> {
  const token = getTokenFromRequest(request);

  if (!token) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'No authorization token provided' },
        { status: 401 }
      ),
    };
  }

  const decodedToken = await verifyIdToken(token);

  if (!decodedToken) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      ),
    };
  }

  return {
    user: {
      uid: decodedToken.uid,
      email: decodedToken.email,
    },
    response: undefined,
  };
}

/**
 * Optional: Ensure user is authenticated (for routes that allow public access but want to know if user is logged in)
 */
export async function getOptionalUser(request: NextRequest): Promise<{
  uid: string;
  email?: string;
} | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const decodedToken = await verifyIdToken(token);
  if (!decodedToken) return null;

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
  };
}
