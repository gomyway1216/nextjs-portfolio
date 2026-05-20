import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/posts/categories
 * Get all post categories
 */
export const GET = withActivityLog('next_api.post.categories.GET', async (request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(POSTS_COLLECTION).get();

    const categories: string[] = [];
    snapshot.forEach((doc) => {
      categories.push(doc.id);
    });

    // Firestore doesn't surface "phantom" parent docs of subcollections in
    // a regular collection().get(), so until there is at least one post in
    // a category we wouldn't see it here. Seed with the canonical pair so
    // the admin dropdown is never empty.
    for (const seed of ['technology', 'life']) {
      if (!categories.includes(seed)) categories.push(seed);
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching post categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post categories' },
      { status: 500 }
    );
  }
});
