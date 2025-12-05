import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from './firebase-admin';
import { DecodedIdToken } from 'firebase-admin/auth';

// List of admin email addresses (configure as needed)
// In production, you'd use custom claims instead
const ADMIN_EMAILS = [
  process.env.ADMIN_EMAIL, // Set this in your .env.local
].filter(Boolean);

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
export async function verifyIdToken(token: string): Promise<DecodedIdToken | null> {
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
 * Check if a user is an admin
 * Checks both custom claims and email whitelist
 */
export function isAdmin(decodedToken: DecodedIdToken): boolean {
  // Check custom claims first (preferred method)
  if (decodedToken.admin === true) {
    return true;
  }

  // Fallback: check email whitelist
  if (decodedToken.email && ADMIN_EMAILS.includes(decodedToken.email)) {
    return true;
  }

  return false;
}

/**
 * Ensure that the request has a valid admin user token
 * Returns the user object if valid admin, or an error response if not
 */
export async function ensureAdmin(request: NextRequest): Promise<{
  user: { uid: string; email?: string; isAdmin: true } | null;
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

  if (!isAdmin(decodedToken)) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      ),
    };
  }

  return {
    user: {
      uid: decodedToken.uid,
      email: decodedToken.email,
      isAdmin: true,
    },
    response: undefined,
  };
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
