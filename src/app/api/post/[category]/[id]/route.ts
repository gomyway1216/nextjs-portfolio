import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  type PostTranslations,
} from '@/lib/blog/postTranslations';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/posts/[category]/[id]
 * Get a single post by ID and category. Returns the full `translations`
 * map so the client can switch languages without a re-fetch.
 */
export const GET = withActivityLog('next_api.post.category.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }) => {
  try {
    const { category, id } = await params;
    const db = getFirestore();

    const docRef = db.collection(`${POSTS_COLLECTION}/${category}/posts`).doc(id);
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
      category,
      isPublic: data.isPublic,
      image: data.image,
      translations,
      availableLanguages: availableLanguages(translations),
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
 * PUT /api/posts/[category]/[id]
 * Update a post. Body: { isPublic?, image?, translations }
 * Requires authentication.
 */
export const PUT = withActivityLog('next_api.post.category.id.PUT', async (request: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { category, id } = await params;
    const body = await request.json();
    const { isPublic, image, translations } = body as {
      isPublic?: boolean;
      image?: string;
      translations?: PostTranslations;
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
    const docRef = db.collection(`${POSTS_COLLECTION}/${category}/posts`).doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    await docRef.update({
      isPublic: isPublic ?? true,
      lastUpdated: new Date(),
      image: image || null,
      translations,
    });

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
 * DELETE /api/posts/[category]/[id]
 * Delete a post. Requires authentication.
 */
export const DELETE = withActivityLog('next_api.post.category.id.DELETE', async (request: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }) => {
  try {
    const { user, response } = await ensureAdmin(request);
    if (!user) {
      return response!;
    }

    const { category, id } = await params;
    const db = getFirestore();
    const docRef = db.collection(`${POSTS_COLLECTION}/${category}/posts`).doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
});
