import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

const AUTH_REQUIRED_ROUTES = [
  '/new-project',
  '/achievements',
];

const AUTH_REQUIRED_PATTERNS = [
  /^\/projects\/[^/]+\/edit$/,
];

const ADMIN_ROUTES = [
  '/admin',
  '/hobbies',
];

function isAuthRequired(pathname: string): boolean {
  if (AUTH_REQUIRED_ROUTES.some((route) => pathname.startsWith(route))) return true;
  if (AUTH_REQUIRED_PATTERNS.some((pattern) => pattern.test(pathname))) return true;
  return false;
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAuthRequired(pathname) && !isAdminRoute(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  const signInRedirect = () => {
    const signInUrl = new URL('/signin', request.url);
    signInUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signInUrl);
  };

  if (!sessionCookie) {
    return signInRedirect();
  }

  // Every protected route verifies the session cookie server-side. A
  // presence-only check is not authentication: any non-empty value for
  // the cookie would have passed the auth-required (non-admin) routes.
  try {
    const verifyUrl = new URL('/api/auth/verify', request.url);
    const res = await fetch(verifyUrl, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` },
      // Never reuse a cached verdict across requests/users (matches the
      // client-side verify call in AuthProvider).
      cache: 'no-store',
    });

    if (!res.ok) {
      return signInRedirect();
    }

    if (isAdminRoute(pathname)) {
      const data = await res.json();
      if (!data.isAdmin) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  } catch {
    return signInRedirect();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
