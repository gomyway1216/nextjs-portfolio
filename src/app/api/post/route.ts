import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin, getOptionalAdmin } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { logApiError } from '../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import {
  availableLanguages,
  normalizeLanguage,
  pickTranslation,
  type PostTranslations,
} from '@/lib/blog/postTranslations';
import { normalizePostCategory, normalizePostTags } from '@/lib/blog/postMetadata';
import { BLOG_POST_LIST_CACHE_TAG } from '@/lib/blog/cacheTags';
import { getErrorMessage, getFirestoreIndexUrl } from '@/lib/firestoreError';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post
 * Paginated public-listing endpoint. Posts now live in a flat collection
 * (`post/{id}`) with `category` as a regular field, so listings are just
 * a single query against that collection.
 *
 * Query params:
 * - category: string (default: 'all'; filters by the `category` field)
 * - isPublic: boolean (default: true)
 * - limit: number (default: 10)
 * - lastVisibleTimestamp: number (optional, for pagination)
 * - language: 'en' | 'ja' (default: 'en'; selects which translation to flatten)
 * - excludeBody: 'true' to return body: '' for each post. The admin list
 *   only renders metadata (title/category/date/visibility) and loads the
 *   full document on edit, so shipping every post's HTML body there is
 *   pure overhead. Public listings keep the body (used for excerpts).
 */
export const GET = withActivityLog('next_api.post.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'all';
    // isPublic semantics:
    //  - absent     -> no filter (show all). Admin-only because drafts are
    //                  not public information.
    //  - "true"     -> only public posts (anonymous OK).
    //  - "false"    -> only private posts (admin-only).
    const isPublicParam = searchParams.get('isPublic');
    const isPublic: boolean | null =
      isPublicParam === null ? null : isPublicParam !== 'false';
    const limitNumber = parseInt(searchParams.get('limit') || '10');
    const lastVisibleTimestamp = searchParams.get('lastVisibleTimestamp');
    const language = normalizeLanguage(searchParams.get('language'));
    const excludeBody = searchParams.get('excludeBody') === 'true';

    if (isPublic !== true) {
      const { user, response } = await ensureAdmin(request);
      if (!user) {
        return response!;
      }
    }

    const db = getFirestore();
    let query = db.collection(POSTS_COLLECTION) as FirebaseFirestore.Query;

    if (isPublic !== null) {
      query = query.where('isPublic', '==', isPublic);
    }

    if (category !== 'all') {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('lastUpdated', 'desc');

    if (lastVisibleTimestamp) {
      const lastVisible = new Date(Number(lastVisibleTimestamp) * 1000);
      query = query.startAfter(lastVisible);
    }

    query = query.limit(limitNumber);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return NextResponse.json({ posts: [], lastVisibleTimestamp: null });
    }

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
        body: excludeBody ? '' : picked.translation.body,
        language: picked.language,
        availableLanguages: availableLanguages(translations),
        created: data.created?.toDate?.()?.toISOString() || data.created,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
      }];
    });

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
    const message = getErrorMessage(error);
    const indexUrl = getFirestoreIndexUrl(error);
    const adminUser = await getOptionalAdmin(request);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'PostsAPI:FetchError',
      message: 'Failed to fetch posts',
      details: message,
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/post',
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch posts',
        ...(adminUser ? { details: message } : {}),
        ...(adminUser && indexUrl ? { indexUrl } : {}),
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/post
 * Create a new post. Body: { category, tags?, isPublic?, image?, translations }
 * `category` is now a doc field, not a path segment.
 * Requires authentication.
 */
export const POST = withActivityLog('next_api.post.POST', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const body = await request.json();
    const { category, isPublic, image, tags, translations } = body as {
      category?: string;
      isPublic?: boolean;
      image?: string;
      tags?: unknown;
      translations?: PostTranslations;
    };

    const normalizedCategory = normalizePostCategory(category);

    if (!normalizedCategory || !translations) {
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

    const docRef = await db.collection(POSTS_COLLECTION).add({
      category: normalizedCategory,
      tags: normalizePostTags(tags),
      isPublic: isPublic ?? true,
      created: now,
      lastUpdated: now,
      image: image || null,
      translations,
    });

    revalidateTag(BLOG_POST_LIST_CACHE_TAG, 'max');

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
