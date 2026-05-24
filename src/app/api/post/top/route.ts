import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  normalizeLanguage,
  pickTranslation,
  type PostTranslations,
} from '@/lib/blog/postTranslations';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post/top
 * Top 4 most-recent public posts across all categories, flattened to the
 * requested locale (with fallback).
 * Query params:
 * - language: 'en' | 'ja' (default: 'en')
 */
export const GET = withActivityLog('next_api.post.top.GET', async (request: NextRequest) => {
  try {
    const language = normalizeLanguage(request.nextUrl.searchParams.get('language'));
    const db = getFirestore();

    // `where(isPublic).orderBy(lastUpdated)` would need a composite index
    // that isn't always deployed alongside frontend rollouts. Since this
    // endpoint only ever returns ~4 posts and the blog is small, we just
    // fetch all public docs (single-field auto-index) and sort/slice in
    // memory.
    const snapshot = await db.collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .get();

    const posts = snapshot.docs.flatMap((doc) => {
      const data = doc.data();
      const translations = (data.translations || {}) as PostTranslations;
      const picked = pickTranslation(translations, language);
      if (!picked) return [];
      return [{
        id: doc.id,
        category: data.category,
        isPublic: data.isPublic,
        image: data.image,
        title: picked.translation.title,
        body: picked.translation.body,
        language: picked.language,
        availableLanguages: availableLanguages(translations),
        created: data.created?.toDate?.()?.toISOString() || data.created,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
      }];
    });

    posts.sort((a, b) => {
      const at = new Date(a.lastUpdated).getTime();
      const bt = new Date(b.lastUpdated).getTime();
      return bt - at;
    });

    return NextResponse.json({ posts: posts.slice(0, 4) });
  } catch (error) {
    console.error('Error fetching top posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top posts' },
      { status: 500 }
    );
  }
});
