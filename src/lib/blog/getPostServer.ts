import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { availableLanguages, type PostTranslations } from '@/lib/blog/postTranslations';
import type { DetailPost } from '@/services/postsService';

// Public posts only: private posts keep their existing client-side fetch
// path, which sends the admin's auth token.
async function fetchPublicPost(id: string): Promise<DetailPost | null> {
  const doc = await getFirestore().collection(POSTS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  if (!data.isPublic) return null;

  const translations = (data.translations || {}) as PostTranslations;

  return {
    id: doc.id,
    isPublic: true,
    category: typeof data.category === 'string' ? data.category : 'all',
    image: typeof data.image === 'string' ? data.image : undefined,
    translations,
    availableLanguages: availableLanguages(translations),
    created: data.created?.toDate?.()?.toISOString() || data.created,
    lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
  };
}

// 5 min cache per post id; the route stays request-rendered (root layout
// reads cookies) so this is the layer that actually saves Firestore reads.
export const getPublicPostCached = unstable_cache(fetchPublicPost, ['blog-post-detail'], {
  revalidate: 300,
  tags: ['blog-posts'],
});
