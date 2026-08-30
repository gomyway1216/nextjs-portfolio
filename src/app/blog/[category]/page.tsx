import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import CategoryPostPage from '@/page/blog/CategoryPostPage';
import { getInitialPostsCached, type PostsPage } from '@/lib/blog/getPostsServer';
import { normalizeLanguage } from '@/lib/blog/postTranslations';
import { categoryLabel } from '@/lib/blog/categoryLabel';
import { buildBlogSocialImages, buildTwitterImages } from '@/lib/blog/socialMetadata';

// Revalidate the route every 60s in addition to the in-process cache.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const label = categoryLabel(category);
  const description = `${label} articles by Yudai Yaguchi.`;
  const title = `${label} — Blog | Yudai Yaguchi`;
  const socialImages = buildBlogSocialImages(undefined, title);
  return {
    title: `${label} — Blog`,
    description,
    alternates: { canonical: `/blog/${encodeURIComponent(category)}` },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: 'Yudai Yaguchi',
      title,
      description,
      url: `/blog/${encodeURIComponent(category)}`,
      images: socialImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: buildTwitterImages(socialImages),
    },
  };
}

const INITIAL_PAGE_SIZE = 5;

const EMPTY_PAGE: PostsPage = { posts: [], lastVisibleTimestamp: null, hasMore: true };

export default async function BlogCategory({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (category === 'all') {
    redirect('/blog');
  }

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
