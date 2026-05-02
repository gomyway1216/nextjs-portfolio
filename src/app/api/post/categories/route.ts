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

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching post categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post categories' },
      { status: 500 }
    );
  }
});
