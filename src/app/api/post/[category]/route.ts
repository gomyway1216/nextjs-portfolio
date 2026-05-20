import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  normalizeLanguage,
  pickTranslation,
  type PostTranslations,
} from '@/lib/blog/postTranslations';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/posts/[category]
 * Get all posts in a category, flattened to the requested locale.
 * Query params:
 * - isPublic: boolean (optional)
 * - language: 'en' | 'ja' (default: 'en')
 */
export const GET = withActivityLog('next_api.post.category.GET', async (request: NextRequest,
  { params }: { params: Promise<{ category: string }> }) => {
  try {
    const { category } = await params;
    const searchParams = request.nextUrl.searchParams;
    const isPublicParam = searchParams.get('isPublic');
    const language = normalizeLanguage(searchParams.get('language'));

    // If isPublic is not specified, show all posts (requires auth)
    // If isPublic is explicitly set to false, require authentication
    if (isPublicParam === 'false' || isPublicParam === null) {
      const { user, response } = await ensureAdmin(request);
      if (!user) {
        return response!;
      }
    }

    const db = getFirestore();
    let query = db.collection(`${POSTS_COLLECTION}/${category}/posts`);

    if (isPublicParam !== null) {
      const isPublic = isPublicParam === 'true';
      query = query.where('isPublic', '==', isPublic) as any;
    }

    const snapshot = await query.get();

    const posts = snapshot.docs
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

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Error fetching posts by category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
});
