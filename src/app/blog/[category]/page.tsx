import { cookies } from 'next/headers';
import CategoryPostPage from '@/page/blog/CategoryPostPage';
import { getInitialPostsCached, type PostsPage } from '@/lib/blog/getPostsServer';
import { normalizeLanguage } from '@/lib/blog/postTranslations';

// Revalidate the route every 60s in addition to the in-process cache.
export const revalidate = 60;

const INITIAL_PAGE_SIZE = 5;

const EMPTY_PAGE: PostsPage = { posts: [], lastVisibleTimestamp: null, hasMore: true };

export default async function BlogCategory({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  // Match what the client-side i18next will pick on hydration so the
  // server-rendered first page is filtered to the same locale.
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get('i18nextLng')?.value);

  let initial: PostsPage = EMPTY_PAGE;
  try {
    initial = await getInitialPostsCached(category, INITIAL_PAGE_SIZE, language);
  } catch (err) {
    console.error('[blog] server-side initial fetch failed, falling back to client', err);
  }
  return (
    <CategoryPostPage
      initialCategory={category}
      initialPosts={initial.posts}
      initialLastVisibleTimestamp={initial.lastVisibleTimestamp}
      initialHasMore={initial.hasMore}
      initialLanguage={language}
    />
  );
}
