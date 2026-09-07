import { NextRequest, NextResponse } from 'next/server';
import { getProjectByRouteIdCached } from '@/lib/projects/getProjectsCached';

/**
 * GET /api/projects/resolve-slug?param=<slugOrId>
 *
 * Resolves a project URL param (title slug or legacy Firestore id) to its
 * canonical URL segment. Consumed by the middleware to issue a real HTTP
 * 308 for legacy id URLs — the redirect thrown inside the streamed page
 * tree can only downgrade to a meta refresh on a 200 (root loading.tsx
 * commits the shell first). Mirrors /api/blog/resolve-slug.
 *
 * Public data only, CDN-cached per param.
 */
const VALID_PARAM = /^(?:[A-Za-z0-9]{20}|[a-z0-9-]{1,80})$/;

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('param') ?? '';
  if (!VALID_PARAM.test(param)) {
    return NextResponse.json({ error: 'invalid param' }, { status: 400 });
  }

  try {
    const resolved = await getProjectByRouteIdCached(param);
    if (!resolved) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } },
      );
    }
    return NextResponse.json(
      { segment: resolved.segment },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
    );
  } catch (error) {
    console.error('[projects] resolve-slug failed:', error);
    // Uncached 503: the middleware fails open and the page's own
    // meta-refresh fallback still covers the redirect.
    return NextResponse.json(
      { error: 'resolution unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
