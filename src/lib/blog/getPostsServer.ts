import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  pickTranslation,
  type PostLanguage,
  type PostTranslations,
} from '@/lib/blog/postTranslations';

export interface ServerPost {
  id: string;
  title: string;
  body: string;
  isPublic: boolean;
  category: string;
  image?: string;
  language: PostLanguage;
  availableLanguages: PostLanguage[];
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
  language: PostLanguage,
): Promise<PostsPage> {
  const db = getFirestore();

  let query = db.collection(POSTS_COLLECTION)
    .where('isPublic', '==', true) as FirebaseFirestore.Query;

  if (category !== 'all') {
    query = query.where('category', '==', category);
  }

  query = query.orderBy('lastUpdated', 'desc').limit(limit);

  const snapshot = await query.get();
  if (snapshot.empty) {
    return { posts: [], lastVisibleTimestamp: null, hasMore: false };
  }

  const posts: ServerPost[] = snapshot.docs.flatMap((doc): ServerPost[] => {
    const data = doc.data();
    const translations = (data.translations || {}) as PostTranslations;
    const picked = pickTranslation(translations, language);
    if (!picked) return [];
    return [{
      id: doc.id,
      title: picked.translation.title,
      body: picked.translation.body,
      isPublic: data.isPublic,
      category: data.category,
      image: data.image,
      language: picked.language,
      availableLanguages: availableLanguages(translations),
      created: data.created?.toDate?.()?.toISOString() || data.created,
      lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
    }];
  });

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

// Cache the initial page of each blog category for 60s.
export const getInitialPostsCached = unstable_cache(
  fetchPostsPage,
  ['blog-posts-initial'],
  { revalidate: 60, tags: ['blog-posts'] },
);
