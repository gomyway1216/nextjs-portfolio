import { NextRequest, NextResponse } from 'next/server';
import { resolvePostParam } from '@/lib/blog/getSlugIndexServer';

/**
 * GET /api/blog/resolve-slug?param=<slugOrId>
 *
 * Resolves a blog post URL param (slug or legacy Firestore id) to its
 * canonical { slug, category }. Consumed by the middleware to issue real
 * HTTP 308s for legacy id URLs — a redirect thrown inside the streamed
 * page/layout tree can only downgrade to a meta-refresh on a 200.
 *
 * Public data only (the index covers public posts exclusively), so no
 * auth. CDN-cached per param so repeated legacy hits don't touch
 * Firestore.
 */
// The only shapes this codebase produces: a 20-char Firestore id or a
// slugifyTitle() slug (lowercase alnum + hyphens, ≤80 chars). Anything
// else is rejected before touching the index — this endpoint is public
// and CDN-cached per param, so arbitrary values would just mint cache
// keys and Firestore reads.
const VALID_PARAM = /^(?:[A-Za-z0-9]{20}|[a-z0-9-]{1,80})$/;

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('param') ?? '';
  if (!VALID_PARAM.test(param)) {
    return NextResponse.json({ error: 'invalid param' }, { status: 400 });
  }

  try {
    const entry = await resolvePostParam(param);
    if (!entry) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } },
      );
    }
    return NextResponse.json(
      { slug: entry.slug, category: entry.category },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
    );
  } catch (error) {
    console.error('[blog] resolve-slug failed:', error);
    // Explicitly uncached 503: the middleware fails open and the page's
    // own fallback (meta refresh) still covers the redirect.
    return NextResponse.json(
      { error: 'resolution unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
