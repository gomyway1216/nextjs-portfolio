import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { logApiError } from '../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import {
  availableLanguages,
  normalizeLanguage,
  pickTranslation,
  type PostTranslations,
} from '@/lib/blog/postTranslations';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/posts
 * Paginated public-listing endpoint. Each item is flattened to the
 * requested locale (with fallback to the other available language).
 *
 * Query params:
 * - category: string (default: 'all')
 * - isPublic: boolean (default: true)
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - lastVisibleTimestamp: number (optional, for pagination)
 * - language: 'en' | 'ja' (default: 'en')
 */
export const GET = withActivityLog('next_api.post.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'all';
    const isPublic = searchParams.get('isPublic') === 'false' ? false : true;
    const limitNumber = parseInt(searchParams.get('limit') || '10');
    const lastVisibleTimestamp = searchParams.get('lastVisibleTimestamp');
    const language = normalizeLanguage(searchParams.get('language'));

    // If fetching non-public posts, require authentication
    if (!isPublic) {
      const { user, response } = await ensureAdmin(request);
      if (!user) {
        return response!;
      }
    }

    const db = getFirestore();
    let query;

    if (category === 'all') {
      if (!lastVisibleTimestamp) {
        query = db.collectionGroup('posts')
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .limit(limitNumber);
      } else {
        const lastVisible = new Date(Number(lastVisibleTimestamp) * 1000);
        query = db.collectionGroup('posts')
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .startAfter(lastVisible)
          .limit(limitNumber);
      }
    } else {
      if (!lastVisibleTimestamp) {
        query = db.collection(`${POSTS_COLLECTION}/${category}/posts`)
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .limit(limitNumber);
      } else {
        const lastVisible = new Date(Number(lastVisibleTimestamp) * 1000);
        query = db.collection(`${POSTS_COLLECTION}/${category}/posts`)
          .where('isPublic', '==', isPublic)
          .orderBy('lastUpdated', 'desc')
          .startAfter(lastVisible)
          .limit(limitNumber);
      }
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return NextResponse.json({ posts: [], lastVisibleTimestamp: null });
    }

    const posts = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const translations = (data.translations || {}) as PostTranslations;
        const picked = pickTranslation(translations, language);
        if (!picked) return null;
        const postCategory = category !== 'all' ? category : doc.ref.path.split('/')[1];
        return {
          id: doc.id,
          category: postCategory,
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

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const newLastVisibleTimestamp = lastDoc.data().lastUpdated?.seconds ||
      Math.floor(new Date(lastDoc.data().lastUpdated).getTime() / 1000);

    return NextResponse.json({
      posts,
      lastVisibleTimestamp: newLastVisibleTimestamp,
      hasMore: snapshot.docs.length === limitNumber,
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'PostsAPI:FetchError',
      message: 'Failed to fetch posts',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/post',
    });
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/posts
 * Create a new post.
 * Body: { category, isPublic?, image?, translations: { en?, ja? } }
 * At least one translation must have a non-empty title and body.
 * Requires authentication.
 */
export const POST = withActivityLog('next_api.post.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const body = await request.json();
    const { category, isPublic, image, translations } = body as {
      category?: string;
      isPublic?: boolean;
      image?: string;
      translations?: PostTranslations;
    };

    if (!category || !translations) {
      return NextResponse.json(
        { error: 'Missing required fields: category, translations' },
        { status: 400 }
      );
    }

    if (availableLanguages(translations).length === 0) {
      return NextResponse.json(
        { error: 'At least one translation with a title and body is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const now = new Date();

    const docRef = await db.collection(`${POSTS_COLLECTION}/${category}/posts`).add({
      isPublic: isPublic ?? true,
      created: now,
      lastUpdated: now,
      image: image || null,
      translations,
    });

    return NextResponse.json(
      { id: docRef.id, message: 'Post created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating post:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'PostsAPI:CreateError',
      message: 'Failed to create post',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/post',
    });
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
});
