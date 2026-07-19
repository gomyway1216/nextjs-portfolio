import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import CategoryPostPage from '@/page/blog/CategoryPostPage';
import { getInitialPostsCached, type PostsPage } from '@/lib/blog/getPostsServer';
import { normalizeLanguage } from '@/lib/blog/postTranslations';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Writing by Yudai Yaguchi on product engineering, fintech systems, system design, applied algorithms, and the decisions behind the work.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog | Yudai Yaguchi',
    description:
      'Writing on product engineering, fintech systems, system design, applied algorithms, and the decisions behind the work.',
    url: '/blog',
  },
};

export const revalidate = 60;

const INITIAL_PAGE_SIZE = 5;
const EMPTY_PAGE: PostsPage = { posts: [], lastVisibleTimestamp: null, hasMore: true };

export default async function BlogIndex() {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get('i18nextLng')?.value);

  let initial: PostsPage = EMPTY_PAGE;
  try {
    initial = await getInitialPostsCached('all', INITIAL_PAGE_SIZE, language);
  } catch (err) {
    console.error('[blog] server-side initial fetch failed, falling back to client', err);
  }

  return (
    <CategoryPostPage
      initialCategory="all"
      initialPosts={initial.posts}
      initialLastVisibleTimestamp={initial.lastVisibleTimestamp}
      initialHasMore={initial.hasMore}
      initialLanguage={language}
    />
  );
}
