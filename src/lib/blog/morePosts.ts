import type { PostLanguage } from '@/lib/blog/postTranslations';

// The minimum a "more in this category" card needs. Kept small on purpose:
// it rides along in the article's RSC payload.
export interface MorePost {
  id: string;
  slug: string;
  title: string;
  category: string;
  language: PostLanguage;
  created: string;
}

export const MORE_POSTS_LIMIT = 3;

interface MorePostCandidate extends MorePost {
  isPublic?: boolean;
}

/**
 * Pick the posts to offer under an article from a category page fetch:
 * drop the article itself and anything the hand-picked "related" strip
 * already shows, keep the fetch order (newest first), cap the count.
 */
export function selectMorePosts(
  candidates: MorePostCandidate[],
  currentId: string,
  excludeIds: readonly string[] = [],
  limit = MORE_POSTS_LIMIT,
): MorePost[] {
  const excluded = new Set<string>([currentId, ...excludeIds]);
  const seen = new Set<string>();
  const picked: MorePost[] = [];
  for (const post of candidates) {
    if (picked.length >= limit) break;
    if (post.isPublic === false) continue;
    if (excluded.has(post.id) || seen.has(post.id)) continue;
    seen.add(post.id);
    picked.push({
      id: post.id,
      slug: post.slug,
      title: post.title,
      category: post.category,
      language: post.language,
      created: post.created,
    });
  }
  return picked;
}
