import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import { POSTS_COLLECTION } from '@/app/api/constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/posts/[category]/[id]
 * Get a single post by ID and category
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

    // If post is not public, require authentication
    if (!data.isPublic) {
      const { user, response } = await ensureAdmin(request);
      if (!user) {
        return response!;
      }
    }

    const post = {
      id: doc.id,
      title: data.title,
      body: data.body,
      isPublic: data.isPublic,
      category: category,
      image: data.image,
      language: data.language,
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
 * Update a post
 * Requires authentication
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
    const { title, isPublic, body: postBody, image, language } = body;

    if (!title || !postBody) {
      return NextResponse.json(
        { error: 'Missing required fields: title, body' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const docRef = db.collection(`${POSTS_COLLECTION}/${category}/posts`).doc(id);

    // Check if post exists
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    await docRef.update({
      title,
      isPublic: isPublic ?? true,
      body: postBody,
      lastUpdated: new Date(),
      image: image || null,
      language: language || 'en',
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
 * Delete a post
 * Requires authentication
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

    // Check if post exists
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
