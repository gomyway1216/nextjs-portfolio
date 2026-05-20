import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { postMatchesLanguage } from '@/lib/blog/postLanguage';

export interface ServerPost {
  id: string;
  title: string;
  body: string;
  isPublic: boolean;
  category: string;
  image?: string;
  language?: string;
  created: string;
  lastUpdated: string;
}

export interface PostsPage {
  posts: ServerPost[];
  lastVisibleTimestamp: number | null;
  hasMore: boolean;
}

async function fetchPostsPage(
  category: string,
  limit: number,
  language: string | null,
): Promise<PostsPage> {
  const db = getFirestore();

  const query = category === 'all'
    ? db.collectionGroup('posts')
        .where('isPublic', '==', true)
        .orderBy('lastUpdated', 'desc')
        .limit(limit)
    : db.collection(`${POSTS_COLLECTION}/${category}/posts`)
        .where('isPublic', '==', true)
        .orderBy('lastUpdated', 'desc')
        .limit(limit);

  const snapshot = await query.get();
  if (snapshot.empty) {
    return { posts: [], lastVisibleTimestamp: null, hasMore: false };
  }

  const posts: ServerPost[] = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const postCategory = category !== 'all' ? category : doc.ref.path.split('/')[1];
      return {
        id: doc.id,
        title: data.title,
        body: data.body,
        isPublic: data.isPublic,
        category: postCategory,
        image: data.image,
        language: data.language,
        created: data.created?.toDate?.()?.toISOString() || data.created,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
      };
    })
    .filter((p) => postMatchesLanguage(p.language, language));

  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  const lastVisibleTimestamp =
    lastDoc.data().lastUpdated?.seconds ||
    Math.floor(new Date(lastDoc.data().lastUpdated).getTime() / 1000);

  return {
    posts,
    lastVisibleTimestamp,
    hasMore: snapshot.docs.length === limit,
  };
}

// Cache the initial page of each blog category for 60s. Posts list updates
// rarely (manual publishing), so this is plenty fresh and removes the
// per-request Firestore round-trip from the critical path.
export const getInitialPostsCached = unstable_cache(
  fetchPostsPage,
  ['blog-posts-initial'],
  { revalidate: 60, tags: ['blog-posts'] },
);
