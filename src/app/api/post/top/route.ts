import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  normalizeLanguage,
  pickTranslation,
  type PostTranslations,
} from '@/lib/blog/postTranslations';
import { normalizePostTags } from '@/lib/blog/postMetadata';
import { getOptionalAdmin } from '@/lib/auth-utils';
import { getErrorMessage, getFirestoreIndexUrl } from '@/lib/firestoreError';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post/top
 * Top 4 most-recent public posts across all categories, flattened to the
 * requested locale (with fallback).
 *
 * Uses a composite index `(isPublic ASC, lastUpdated DESC)` on the flat
 * `post` collection. If it is missing, admins receive the original
 * Firestore details and one-click index URL; public callers get only the
 * generic failure message.
 *
 * Query params:
 * - language: 'en' | 'ja' (default: 'en')
 */
export const GET = withActivityLog('next_api.post.top.GET', async (request: NextRequest) => {
  try {
    const language = normalizeLanguage(request.nextUrl.searchParams.get('language'));
    const db = getFirestore();

    const snapshot = await db.collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .orderBy('lastUpdated', 'desc')
      .limit(8) // small over-fetch in case some docs lack any translation
      .get();

    const posts = snapshot.docs.flatMap((doc) => {
      const data = doc.data();
      const translations = (data.translations || {}) as PostTranslations;
      const picked = pickTranslation(translations, language);
      if (!picked) return [];
      return [{
        id: doc.id,
        category: data.category,
        tags: normalizePostTags(data.tags),
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
    const message = getErrorMessage(error);
    const indexUrl = getFirestoreIndexUrl(error);
    const adminUser = await getOptionalAdmin(request);
    return NextResponse.json(
      {
        error: 'Failed to fetch top posts',
        ...(adminUser ? { details: message } : {}),
        ...(adminUser && indexUrl ? { indexUrl } : {}),
      },
      { status: 500 },
    );
  }
});
