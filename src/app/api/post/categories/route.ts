import { POSTS_COLLECTION } from '@/app/api/constants';
import { getFirestore } from '@/lib/firebase-admin';
import { SEEDED_POST_CATEGORIES } from '@/lib/blog/postMetadata';
import { NextRequest,NextResponse } from 'next/server';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post/categories
 * Distinct categories in use, plus canonical seeds so the admin
 * dropdown is never empty before any post exists.
 */
export const GET = withActivityLog('next_api.post.categories.GET', async (_request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(POSTS_COLLECTION).select('category').get();

    const set = new Set<string>(SEEDED_POST_CATEGORIES);
    snapshot.forEach((doc) => {
      const cat = doc.data().category;
      if (typeof cat === 'string' && cat) set.add(cat);
    });

    return NextResponse.json({ categories: Array.from(set) });
  } catch (error) {
    console.error('Error fetching post categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post categories' },
      { status: 500 }
    );
  }
});
