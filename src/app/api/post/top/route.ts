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

    // Posts live in a flat collection now, so the top-N query is just a
    // single ordered fetch with no category fan-out.
    const snapshot = await db.collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .orderBy('lastUpdated', 'desc')
      .limit(8) // small over-fetch in case some posts lack any translation
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

    return NextResponse.json({ posts: posts.slice(0, 4) });
  } catch (error) {
    console.error('Error fetching top posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top posts' },
      { status: 500 }
    );
  }
});
