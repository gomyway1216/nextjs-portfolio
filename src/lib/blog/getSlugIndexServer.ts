import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { postSlug } from '@/lib/blog/postSlug';
import type { PostTranslations } from '@/lib/blog/postTranslations';
import { BLOG_POST_LIST_CACHE_TAG } from '@/lib/blog/cacheTags';

export interface SlugEntry {
  id: string;
  slug: string;
  category: string;
}

// One entry per public post. A slug is only canonical if it is unique
// across all public posts; on a title collision the affected posts fall
// back to their id so two posts never share a URL.
async function fetchSlugIndex(): Promise<SlugEntry[]> {
  const snapshot = await getFirestore()
    .collection(POSTS_COLLECTION)
    .where('isPublic', '==', true)
    .get();

  const raw = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      category:
        typeof data.category === 'string' && data.category ? data.category : 'all',
      baseSlug: postSlug((data.translations || {}) as PostTranslations, doc.id),
    };
  });

  const counts = new Map<string, number>();
  for (const entry of raw) {
    counts.set(entry.baseSlug, (counts.get(entry.baseSlug) ?? 0) + 1);
  }

  return raw.map((entry) => ({
    id: entry.id,
    category: entry.category,
    slug: counts.get(entry.baseSlug) === 1 ? entry.baseSlug : entry.id,
  }));
}

export const getSlugIndexCached = unstable_cache(fetchSlugIndex, ['blog-slug-index'], {
  revalidate: 300,
  tags: [BLOG_POST_LIST_CACHE_TAG],
});

// id -> canonical slug for link building. Returns an empty map on fetch
// failure so listings degrade to id URLs (which 308-redirect once the
// index is reachable again) instead of erroring.
export async function getSlugMapSafe(): Promise<Map<string, string>> {
  try {
    const index = await getSlugIndexCached();
    return new Map(index.map((entry) => [entry.id, entry.slug]));
  } catch (error) {
    console.error('[blog] slug index fetch failed, falling back to id URLs:', error);
    return new Map();
  }
}

// Resolve a URL param that may be a slug (new URLs) or a Firestore id
// (old URLs). Returns null for private/unknown posts — callers keep the
// legacy id-based flow for those.
export async function resolvePostParam(param: string): Promise<SlugEntry | null> {
  const index = await getSlugIndexCached();
  return (
    index.find((entry) => entry.slug === param) ??
    index.find((entry) => entry.id === param) ??
    null
  );
}
