import 'server-only';
import { getInitialPostsCached } from '@/lib/blog/getPostsServer';
import { MORE_POSTS_LIMIT, selectMorePosts, type MorePost } from '@/lib/blog/morePosts';
import type { PostLanguage } from '@/lib/blog/postTranslations';
import type { DetailPost } from '@/services/postsService';

// Over-fetch a little so the current post and any hand-picked related
// posts can be dropped without leaving the strip short.
const FETCH_LIMIT = MORE_POSTS_LIMIT + 3;

/**
 * Newest public posts in the same category as `post`, for the "More in
 * {category}" strip. Never throws: an empty strip is the graceful state
 * when Firestore is unavailable — the article itself must still render.
 */
export async function getMorePostsSafe(
  post: DetailPost,
  language: PostLanguage,
): Promise<MorePost[]> {
  try {
    const page = await getInitialPostsCached(post.category, FETCH_LIMIT, language);
    return selectMorePosts(page.posts, post.id, post.relatedPostIds ?? []);
  } catch (error) {
    console.error('[blog] failed to load more-from-category posts:', error);
    return [];
  }
}
