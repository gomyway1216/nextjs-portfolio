import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PostPage from '@/page/blog/PostPage';
import { getPublicPostCached } from '@/lib/blog/getPostServer';
import { excerpt } from '@/lib/blog/postExcerpt';
import { buildPostJsonLd } from '@/lib/blog/postJsonLd';

interface BlogPostParams {
  params: Promise<{ category: string; id: string }>;
}

/**
 * Language-pinned Japanese post URL: /ja/blog/[category]/[id].
 *
 * The bare /blog URL picks its translation from the i18n cookie, which a
 * crawler never sends — so Japanese content was invisible to search
 * engines. This route always renders the Japanese translation regardless
 * of cookies, giving Japanese content a stable, indexable URL that the
 * bare route cross-references via hreflang.
 */
export async function generateMetadata({ params }: BlogPostParams): Promise<Metadata> {
  const { id } = await params;

  let post = null;
  try {
    post = await getPublicPostCached(id);
  } catch (error) {
    console.error('[blog/ja] generateMetadata fetch failed:', error);
  }
  // Missing, private, or no Japanese translation (the page itself
  // redirects in that last case): stay out of the index.
  if (!post || !post.availableLanguages.includes('ja')) {
    return { robots: { index: false } };
  }

  const translation = post.translations.ja;
  if (!translation) {
    return { robots: { index: false } };
  }
  const title = translation.title;
  const description = excerpt(translation.body);
  const enPath = `/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`;
  const jaPath = `/ja${enPath}`;
  const hasEn = post.availableLanguages.includes('en');

  return {
    title,
    description,
    alternates: {
      canonical: jaPath,
      languages: {
        ja: jaPath,
        // The bare URL is what a cookieless crawler reads in English, so
        // it doubles as the x-default entry point.
        ...(hasEn ? { en: enPath, 'x-default': enPath } : {}),
      },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url: jaPath,
      locale: 'ja_JP',
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

export default async function BlogPostJa({ params }: BlogPostParams) {
  const { id } = await params;

  let initialPost = null;
  try {
    initialPost = await getPublicPostCached(id);
  } catch (error) {
    console.error('[blog/ja] server-side post fetch failed, falling back to client:', error);
  }

  // A /ja URL for a post without a Japanese translation would serve
  // English under a ja path — soft duplicate content that undermines
  // hreflang. Send it to the real (English) URL instead.
  if (initialPost && !initialPost.availableLanguages.includes('ja')) {
    redirect(`/blog/${encodeURIComponent(initialPost.category)}/${encodeURIComponent(initialPost.id)}`);
  }

  let jsonLd: object | null = null;
  if (initialPost) {
    const translation = initialPost.translations.ja;
    if (translation) {
      jsonLd = buildPostJsonLd(initialPost, translation, 'ja', '/ja');
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <PostPage key={id} initialPost={initialPost} forcedLanguage="ja" />
    </>
  );
}
