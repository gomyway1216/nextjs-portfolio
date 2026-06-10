import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { htmlToText } from 'html-to-text';
import PostPage from '@/page/blog/PostPage';
import { getPublicPostCached } from '@/lib/blog/getPostServer';
import { normalizeLanguage, pickTranslation } from '@/lib/blog/postTranslations';

interface BlogPostParams {
  params: Promise<{ category: string; id: string }>;
}

function excerpt(html: string): string {
  return htmlToText(html, { wordwrap: false })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export async function generateMetadata({ params }: BlogPostParams): Promise<Metadata> {
  const { id } = await params;

  let post = null;
  try {
    post = await getPublicPostCached(id);
  } catch (error) {
    console.error('[blog] generateMetadata fetch failed:', error);
  }
  if (!post) {
    // Private or missing: keep it out of the index, client handles the rest.
    return { robots: { index: false } };
  }

  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get('i18nextLng')?.value);
  const picked = pickTranslation(post.translations, language);
  if (!picked) {
    return { robots: { index: false } };
  }

  const title = picked.translation.title;
  const description = excerpt(picked.translation.body);
  const canonicalPath = `/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonicalPath,
      publishedTime: post.created,
      modifiedTime: post.lastUpdated,
      ...(post.image ? { images: [post.image] } : {}),
    },
    twitter: {
      card: post.image ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  };
}

export default async function BlogPost({ params }: BlogPostParams) {
  const { id } = await params;

  // Public posts arrive server-side (no spinner, crawlable shell);
  // private posts fall back to PostPage's client fetch which carries the
  // admin's auth token.
  let initialPost = null;
  try {
    initialPost = await getPublicPostCached(id);
  } catch (error) {
    console.error('[blog] server-side post fetch failed, falling back to client:', error);
  }

  return <PostPage initialPost={initialPost} />;
}
