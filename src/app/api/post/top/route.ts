import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/posts/top
 * Get top 4 most recent public posts across all categories
 */
export const GET = withActivityLog('next_api.post.top.GET', async (request: NextRequest) => {
  try {
    const db = getFirestore();
    const categories = ['technology', 'life'];

    // Fetch posts from all categories
    const promises = categories.map(async (category) => {
      const snapshot = await db.collection(`${POSTS_COLLECTION}/${category}/posts`)
        .where('isPublic', '==', true)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
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
      });
    });

    const allPosts = await Promise.all(promises);
    const combinedPosts = allPosts.flat();

    // Sort by lastUpdated descending and take top 4
    const sortedPosts = combinedPosts.sort((a, b) => {
      const dateA = new Date(a.lastUpdated).getTime();
      const dateB = new Date(b.lastUpdated).getTime();
      return dateB - dateA;
    });

    const top4Posts = sortedPosts.slice(0, 4);

    return NextResponse.json({ posts: top4Posts });
  } catch (error) {
    console.error('Error fetching top posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top posts' },
      { status: 500 }
    );
  }
});
