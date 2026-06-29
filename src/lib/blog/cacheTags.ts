export const BLOG_POST_LIST_CACHE_TAG = 'blog-post-list';

export function blogPostDetailCacheTag(id: string): string {
  return `blog-post-${id}`;
}
