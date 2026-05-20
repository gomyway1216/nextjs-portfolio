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
 * GET /api/posts/top
 * Top 4 most-recent public posts across all categories, flattened to the
 * requested locale (with fallback).
 * Query params:
 * - language: 'en' | 'ja' (default: 'en')
 */
export const GET = withActivityLog('next_api.post.top.GET', async (request: NextRequest) => {
  try {
    const language = normalizeLanguage(request.nextUrl.searchParams.get('language'));
    const db = getFirestore();
    const categories = ['technology', 'life'];

    const promises = categories.map(async (category) => {
      const snapshot = await db.collection(`${POSTS_COLLECTION}/${category}/posts`)
        .where('isPublic', '==', true)
        .get();

      return snapshot.docs
        .map((doc) => {
          const data = doc.data();
          const translations = (data.translations || {}) as PostTranslations;
          const picked = pickTranslation(translations, language);
          if (!picked) return null;
          return {
            id: doc.id,
            category,
            isPublic: data.isPublic,
            image: data.image,
            title: picked.translation.title,
            body: picked.translation.body,
            language: picked.language,
            availableLanguages: availableLanguages(translations),
            created: data.created?.toDate?.()?.toISOString() || data.created,
            lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    });

    const allPosts = (await Promise.all(promises)).flat();

    const sortedPosts = allPosts.sort((a, b) => {
      const dateA = new Date(a.lastUpdated).getTime();
      const dateB = new Date(b.lastUpdated).getTime();
      return dateB - dateA;
    });

    const top4Posts = sortedPosts.slice(0, 4);

    return NextResponse.json({ posts: top4Posts });
  } catch (error) {
    console.error('Error fetching top posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top posts' },
      { status: 500 }
    );
  }
});
