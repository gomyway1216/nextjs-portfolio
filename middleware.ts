import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// List of protected routes that require authentication
const protectedRoutes = [
  '/admin',
  '/new-post',
  '/new-project',
  '/achievements',
];

// Routes that start with these patterns are also protected
const protectedPatterns = [
  '/blog/.*/edit',
  '/project/.*/edit',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route)) ||
    protectedPatterns.some(pattern => new RegExp(pattern).test(pathname));

  if (isProtectedRoute) {
    // In Next.js App Router, we can't directly access Firebase auth state in middleware
    // Instead, we'll check for an auth cookie or token
    // For now, we'll let the client-side handle the redirect through the page components
    // This is a placeholder for future authentication implementation

    // You can implement cookie-based auth checking here
    // const authToken = request.cookies.get('auth-token');
    // if (!authToken) {
    //   return NextResponse.redirect(new URL('/signin', request.url));
    // }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
