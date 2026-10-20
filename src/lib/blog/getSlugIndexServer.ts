import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { withReadDeadline } from '@/lib/firestoreDeadline';
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
  // Rejects on failure or timeout and never returns a partial index, so a
  // failed revalidation keeps the previous cached index.
  const snapshot = await withReadDeadline(
    getFirestore()
      .collection(POSTS_COLLECTION)
      .where('isPublic', '==', true)
      .get(),
    'blog slug index query',
  );

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

export interface SlugMapResult {
  /** id -> canonical slug. Empty when the index could not be read. */
  slugById: Map<string, string>;
  /** False when the index could not be read and links fall back to ids. */
  complete: boolean;
}

// id -> canonical slug for link building. On failure the map is empty, so
// links degrade to id URLs (which 308-redirect once the index is reachable
// again) instead of erroring.
//
// That fallback is meant to last one request. Call this from request code
// only, never from inside unstable_cache: there the empty map would be
// cached along with the result. A nested unstable_cache call also skips its
// own cache, so it would re-read the whole index on every recompute.
export async function getSlugMapResult(): Promise<SlugMapResult> {
  try {
    const index = await getSlugIndexCached();
    return { slugById: new Map(index.map((entry) => [entry.id, entry.slug])), complete: true };
  } catch (error) {
    console.error('[blog] slug index fetch failed, falling back to id URLs:', error);
    return { slugById: new Map(), complete: false };
  }
}

// Never-throwing id -> slug map. The rules of getSlugMapResult apply.
export async function getSlugMapSafe(): Promise<Map<string, string>> {
  return (await getSlugMapResult()).slugById;
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

// Never-throwing variant for page routes: on index failure the param is
// treated as a raw document id (the legacy flow) instead of erroring.
export async function resolvePostParamSafe(param: string): Promise<SlugEntry | null> {
  try {
    return await resolvePostParam(param);
  } catch (error) {
    console.error('[blog] slug resolution failed, treating param as id:', error);
    return null;
  }
}
