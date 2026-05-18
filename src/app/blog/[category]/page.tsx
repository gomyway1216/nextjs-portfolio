import CategoryPostPage from '@/page/blog/CategoryPostPage';
import { getInitialPostsCached, type PostsPage } from '@/lib/blog/getPostsServer';

// Revalidate the route every 60s in addition to the in-process cache,
// so CDN copies refresh too.
export const revalidate = 60;

const INITIAL_PAGE_SIZE = 5;

const EMPTY_PAGE: PostsPage = { posts: [], lastVisibleTimestamp: null, hasMore: true };

export default async function BlogCategory({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  // If Firebase Admin credentials are missing or Firestore fails, fall
  // back to letting the client component fetch the first page itself.
  // This keeps the page rendering even when the server-side path is
  // unavailable (e.g. local dev without service-account creds).
  let initial: PostsPage = EMPTY_PAGE;
  try {
    initial = await getInitialPostsCached(category, INITIAL_PAGE_SIZE);
  } catch (err) {
    console.error('[blog] server-side initial fetch failed, falling back to client', err);
  }
  return (
    <CategoryPostPage
      initialCategory={category}
      initialPosts={initial.posts}
      initialLastVisibleTimestamp={initial.lastVisibleTimestamp}
      initialHasMore={initial.hasMore}
    />
  );
}
