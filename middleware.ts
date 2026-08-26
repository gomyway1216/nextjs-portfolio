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
  '/memory',
];

function matchesRoutePrefix(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isAuthRequired(pathname: string): boolean {
  if (AUTH_REQUIRED_ROUTES.some((route) => pathname.startsWith(route))) return true;
  if (AUTH_REQUIRED_PATTERNS.some((pattern) => pattern.test(pathname))) return true;
  return false;
}

export function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
}

// Legacy blog post URL: /blog/<category>/<20-char Firestore id> (optionally
// /ja-prefixed). Slugs are title-derived and effectively always contain a
// hyphen; a rare hyphenless 20-char slug resolves to itself and is not
// redirected, so a false match costs one cached lookup, never a wrong URL.
const LEGACY_POST_URL = /^(\/ja)?\/blog\/([^/]+)\/([A-Za-z0-9]{20})$/;

// Real HTTP 308 for legacy id URLs. The page/layout tree can't produce
// one: loading.tsx streams the shell first, committing a 200, and the
// in-tree redirect downgrades to a meta refresh. Fails open — on any
// error the request proceeds and that meta-refresh fallback still runs.
async function legacyBlogRedirect(request: NextRequest, pathname: string) {
  const match = pathname.match(LEGACY_POST_URL);
  if (!match) return null;
  const [, jaPrefix = '', , param] = match;

  try {
    const resolveUrl = new URL('/api/blog/resolve-slug', request.url);
    resolveUrl.searchParams.set('param', param);
    // Bounded wait: a slow resolve (cold start, Firestore latency) must not
    // hold up TTFB — past the deadline we fail open to the page's fallback.
    const res = await fetch(resolveUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { slug?: string; category?: string };
    if (!data.slug || !data.category || data.slug === param) return null;
    return NextResponse.redirect(
      new URL(
        `${jaPrefix}/blog/${encodeURIComponent(data.category)}/${encodeURIComponent(data.slug)}`,
        request.url,
      ),
      308,
    );
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const blogRedirect = await legacyBlogRedirect(request, pathname);
  if (blogRedirect) {
    return blogRedirect;
  }

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
