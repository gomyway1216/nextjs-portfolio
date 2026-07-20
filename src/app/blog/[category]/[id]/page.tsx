import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import PostPage from '@/page/blog/PostPage';
import { getPublicPostCached } from '@/lib/blog/getPostServer';
import { normalizeLanguage, pickTranslation } from '@/lib/blog/postTranslations';
import { excerpt } from '@/lib/blog/postExcerpt';
import { buildPostJsonLd } from '@/lib/blog/postJsonLd';

interface BlogPostParams {
  params: Promise<{ category: string; id: string }>;
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

  // hreflang: this URL is what a cookieless crawler sees in English, so it
  // is the en + x-default alternate; the language-pinned /ja route carries
  // the Japanese version. Only declared when a ja translation exists.
  const hasJa = post.availableLanguages.includes('ja');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      ...(hasJa
        ? {
            languages: {
              en: canonicalPath,
              ja: `/ja${canonicalPath}`,
              'x-default': canonicalPath,
            },
          }
        : {}),
    },
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

  // BlogPosting + BreadcrumbList structured data for public posts, in the
  // language the reader (and the cookieless crawler: en) receives.
  let jsonLd: object | null = null;
  if (initialPost) {
    const cookieStore = await cookies();
    const language = normalizeLanguage(cookieStore.get('i18nextLng')?.value);
    const picked = pickTranslation(initialPost.translations, language);
    if (picked) {
      jsonLd = buildPostJsonLd(initialPost, picked.translation, picked.language);
    }
  }

  // Key by id: client-side navigation between posts reuses the component
  // instance, and PostPage seeds its state from initialPost on mount.
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <PostPage key={id} initialPost={initialPost} />
    </>
  );
}
