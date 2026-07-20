import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  type PostTranslations,
} from '@/lib/blog/postTranslations';
import { normalizePostCategory, normalizePostTags } from '@/lib/blog/postMetadata';
import { normalizeRelatedPostIds } from '@/lib/blog/relatedPosts';
import { BLOG_POST_LIST_CACHE_TAG, blogPostDetailCacheTag } from '@/lib/blog/cacheTags';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post/[id]
 * Get a single post by id. Returns the full `translations` map so the
 * client can switch languages without a re-fetch.
 */
export const GET = withActivityLog('next_api.post.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const db = getFirestore();

    const docRef = db.collection(POSTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    const data = doc.data()!;

    if (!data.isPublic) {
      const { user, response } = await ensureAdmin(request);
      if (!user) {
        return response!;
      }
    }

    const translations = (data.translations || {}) as PostTranslations;

    const post = {
      id: doc.id,
      category: data.category,
      tags: normalizePostTags(data.tags),
      isPublic: data.isPublic,
      image: data.image,
      translations,
      availableLanguages: availableLanguages(translations),
      relatedPostIds: normalizeRelatedPostIds(data.relatedPostIds),
      viewCount: typeof data.viewCount === 'number' ? data.viewCount : 0,
      created: data.created?.toDate?.()?.toISOString() || data.created,
      lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
    };

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Error fetching post:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/post/[id]
 * Update a post. Body: { category?, tags?, isPublic?, image?, translations }
 * Changing category is just a field update — no doc move required.
 * Requires authentication.
 */
export const PUT = withActivityLog('next_api.post.id.PUT', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { id } = await params;
    const body = await request.json();
    const { category, isPublic, image, tags, translations, relatedPostIds } = body as {
      category?: string;
      isPublic?: boolean;
      image?: string;
      tags?: unknown;
      translations?: PostTranslations;
      relatedPostIds?: unknown;
    };

    if (!translations) {
      return NextResponse.json(
        { error: 'Missing required field: translations' },
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
    const docRef = db.collection(POSTS_COLLECTION).doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    const normalizedCategory = normalizePostCategory(category);

    const update: Record<string, unknown> = {
      lastUpdated: new Date(),
      translations,
    };
    if (normalizedCategory) {
      update.category = normalizedCategory;
    }
    if (isPublic !== undefined) {
      update.isPublic = isPublic;
    }
    if (image !== undefined) {
      update.image = image || null;
    }
    if (tags !== undefined) {
      update.tags = normalizePostTags(tags);
    }
    if (relatedPostIds !== undefined) {
      update.relatedPostIds = normalizeRelatedPostIds(relatedPostIds, id);
    }

    await docRef.update(update);

    revalidateTag(BLOG_POST_LIST_CACHE_TAG, 'max');
    revalidateTag(blogPostDetailCacheTag(id), 'max');

    return NextResponse.json({ message: 'Post updated successfully' });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/post/[id]
 * Delete a post. Requires authentication.
 */
export const DELETE = withActivityLog('next_api.post.id.DELETE', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { id } = await params;
    const db = getFirestore();
    const docRef = db.collection(POSTS_COLLECTION).doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    await docRef.delete();

    revalidateTag(BLOG_POST_LIST_CACHE_TAG, 'max');
    revalidateTag(blogPostDetailCacheTag(id), 'max');

    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
});
