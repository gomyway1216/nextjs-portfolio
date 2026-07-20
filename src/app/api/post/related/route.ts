import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  normalizeLanguage,
  pickTranslation,
  type PostTranslations,
} from '@/lib/blog/postTranslations';
import { normalizeRelatedPostIds } from '@/lib/blog/relatedPosts';
import { getSlugMapSafe } from '@/lib/blog/getSlugIndexServer';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post/related?ids=a,b,c&language=ja
 * Lightweight summaries (no body) for the "related posts" section under a
 * post. Only public posts are returned — a private id in the list is
 * silently dropped, so linking a draft never leaks it. Order of the
 * response follows the order of the requested ids.
 */
export const GET = withActivityLog('next_api.post.related.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const idsParam = searchParams.get('ids') || '';
    const language = normalizeLanguage(searchParams.get('language'));

    // Same sanitizer as the write path: trims, dedupes, caps, and drops
    // ids containing '/' that would make `.doc(id)` throw on a malformed
    // multi-segment path.
    const ids = normalizeRelatedPostIds(idsParam.split(','));

    if (ids.length === 0) {
      return NextResponse.json({ posts: [] });
    }

    const db = getFirestore();
    const docs = await db.getAll(
      ...ids.map((id) => db.collection(POSTS_COLLECTION).doc(id))
    );

    const slugById = await getSlugMapSafe();

    const posts = docs.flatMap((doc) => {
      if (!doc.exists) return [];
      const data = doc.data()!;
      if (!data.isPublic) return [];

      const translations = (data.translations || {}) as PostTranslations;
      const picked = pickTranslation(translations, language);
      if (!picked) return [];

      return [{
        id: doc.id,
        slug: slugById.get(doc.id) ?? doc.id,
        title: picked.translation.title,
        language: picked.language,
        category: typeof data.category === 'string' ? data.category : 'all',
        image: typeof data.image === 'string' ? data.image : undefined,
        created: data.created?.toDate?.()?.toISOString() || data.created || '',
      }];
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Error fetching related posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch related posts' },
      { status: 500 }
    );
  }
});
