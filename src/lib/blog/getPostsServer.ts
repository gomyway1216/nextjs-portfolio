import 'server-only';
import { cacheWithWaitUntil } from '@/lib/cache/cacheWithWaitUntil';
import { getFirestore } from '@/lib/firebase-admin';
import { withReadDeadline } from '@/lib/firestoreDeadline';
import { POSTS_COLLECTION } from '@/app/api/constants';
import {
  availableLanguages,
  pickTranslation,
  type PostLanguage,
  type PostTranslations,
} from '@/lib/blog/postTranslations';
import { normalizePostTags } from '@/lib/blog/postMetadata';
import { getSlugMapSafe } from '@/lib/blog/getSlugIndexServer';
import { BLOG_POST_LIST_CACHE_TAG } from '@/lib/blog/cacheTags';
import { excerpt } from '@/lib/blog/postExcerpt';

export interface ServerPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  isPublic: boolean;
  category: string;
  tags: string[];
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

// What the posts cache stores: everything but the slug. Slugs come from
// the slug index on every request (see getInitialPostsCached), so a slug
// index outage can never be cached into the list as id URLs.
type CachedPost = Omit<ServerPost, 'slug'>;

interface CachedPostsPage {
  posts: CachedPost[];
  lastVisibleTimestamp: number | null;
  hasMore: boolean;
}

async function fetchPostsPage(
  category: string,
  limit: number,
  language: PostLanguage,
): Promise<CachedPostsPage> {
  const db = getFirestore();

  let query = db.collection(POSTS_COLLECTION)
    .where('isPublic', '==', true) as FirebaseFirestore.Query;

  if (category !== 'all') {
    query = query.where('category', '==', category);
  }

  query = query.orderBy('lastUpdated', 'desc').limit(limit);

  // Rejects on failure or timeout so a failed revalidation keeps the last
  // good page instead of caching an empty one.
  const snapshot = await withReadDeadline(query.get(), `blog posts query (${category})`);
  if (snapshot.empty) {
    return { posts: [], lastVisibleTimestamp: null, hasMore: false };
  }

  const posts: CachedPost[] = snapshot.docs.flatMap((doc): CachedPost[] => {
    const data = doc.data();
    const translations = (data.translations || {}) as PostTranslations;
    const picked = pickTranslation(translations, language);
    if (!picked) return [];
    return [{
      id: doc.id,
      title: picked.translation.title,
      summary: excerpt(picked.translation.body),
      // List cards only render a preview. Keeping the full body here made
      // /blog serialize several articles into both HTML and the RSC payload.
      body: '',
      isPublic: data.isPublic,
      category: data.category,
      tags: normalizePostTags(data.tags),
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

// The initial page of each blog category, cached for 60s.
const getInitialPostsPageCached = cacheWithWaitUntil(
  fetchPostsPage,
  ['blog-posts-initial'],
  { revalidate: 60, tags: [BLOG_POST_LIST_CACHE_TAG] },
);

/**
 * The initial page of a blog category with canonical slugs.
 *
 * The page comes from the 60s posts cache and the slugs from the slug
 * index's own cache, joined here per request. If the slug index cannot be
 * read, this request links by id and the next one tries again. Rejects
 * when the posts themselves cannot be read; callers render their fallback.
 */
export async function getInitialPostsCached(
  category: string,
  limit: number,
  language: PostLanguage,
): Promise<PostsPage> {
  const [page, slugById] = await Promise.all([
    getInitialPostsPageCached(category, limit, language),
    getSlugMapSafe(),
  ]);
  return {
    ...page,
    posts: page.posts.map((post) => ({ ...post, slug: slugById.get(post.id) ?? post.id })),
  };
}
