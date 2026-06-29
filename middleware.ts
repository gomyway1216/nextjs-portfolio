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

  if (!sessionCookie) {
    const signInUrl = new URL('/signin', request.url);
    signInUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminRoute(pathname)) {
    try {
      const verifyUrl = new URL('/api/auth/verify', request.url);
      const res = await fetch(verifyUrl, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` },
      });

      if (!res.ok) {
        const signInUrl = new URL('/signin', request.url);
        signInUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(signInUrl);
      }

      const data = await res.json();
      if (!data.isAdmin) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      const signInUrl = new URL('/signin', request.url);
      signInUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
