import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import CategoryPostPage from '@/page/blog/CategoryPostPage';
import { getInitialPostsCached, type PostsPage } from '@/lib/blog/getPostsServer';
import { normalizeLanguage } from '@/lib/blog/postTranslations';
import { buildBlogSocialImages, buildTwitterImages } from '@/lib/blog/socialMetadata';

const title = 'Blog | Yudai Yaguchi';
const description =
  'Writing on product engineering, fintech systems, system design, applied algorithms, and the decisions behind the work.';
const socialImages = buildBlogSocialImages(undefined, title);

export const metadata: Metadata = {
  title: 'Blog',
  description,
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Yudai Yaguchi',
    title,
    description,
    url: '/blog',
    images: socialImages,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: buildTwitterImages(socialImages),
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
