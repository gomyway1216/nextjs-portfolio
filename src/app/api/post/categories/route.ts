import {
  POSTS_COLLECTION,
  POST_TAXONOMY_COLLECTION,
  POST_TAXONOMY_DOC_ID,
} from '@/app/api/constants';
import { getFirestore } from '@/lib/firebase-admin';
import { SEEDED_POST_CATEGORIES, normalizePostCategory } from '@/lib/blog/postMetadata';
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
    const taxonomyDoc = await db.collection(POST_TAXONOMY_COLLECTION).doc(POST_TAXONOMY_DOC_ID).get();
    const snapshot = await db.collection(POSTS_COLLECTION).select('category').get();

    const set = new Set<string>(SEEDED_POST_CATEGORIES);
    const configured = taxonomyDoc.exists ? taxonomyDoc.data()?.categories : [];
    if (Array.isArray(configured)) {
      configured.forEach((category) => {
        const normalized = normalizePostCategory(category);
        if (normalized) set.add(normalized);
      });
    }
    snapshot.forEach((doc) => {
      const cat = normalizePostCategory(doc.data().category);
      if (cat) set.add(cat);
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
