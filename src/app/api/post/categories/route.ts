import { POSTS_COLLECTION } from '@/app/api/constants';
import { getFirestore } from '@/lib/firebase-admin';
import { NextRequest,NextResponse } from 'next/server';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/post/categories
 * Distinct categories in use, plus the canonical seeded pair so the admin
 * dropdown is never empty before any post exists.
 */
export const GET = withActivityLog('next_api.post.categories.GET', async (_request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(POSTS_COLLECTION).get();

    const set = new Set<string>();
    snapshot.forEach((doc) => {
      const cat = doc.data().category;
      if (typeof cat === 'string' && cat) set.add(cat);
    });

    for (const seed of ['technology', 'life']) set.add(seed);

    return NextResponse.json({ categories: Array.from(set) });
  } catch (error) {
    console.error('Error fetching post categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post categories' },
      { status: 500 }
    );
  }
});
