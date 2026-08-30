import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PostPage from '@/page/blog/PostPage';
import { getPublicPostCached } from '@/lib/blog/getPostServer';
import { resolvePostParamSafe } from '@/lib/blog/getSlugIndexServer';
import { excerpt } from '@/lib/blog/postExcerpt';
import { buildPostJsonLd } from '@/lib/blog/postJsonLd';
import { buildBlogSocialImages, buildTwitterImages } from '@/lib/blog/socialMetadata';

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
  const { id: param } = await params;
  const resolved = await resolvePostParamSafe(param);

  let post = null;
  try {
    post = await getPublicPostCached(resolved?.id ?? param);
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
  const enPath = `/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(resolved?.slug ?? post.id)}`;
  const jaPath = `/ja${enPath}`;
  const hasEn = post.availableLanguages.includes('en');
  const socialImages = buildBlogSocialImages(post.image, title);

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
      alternateLocale: hasEn ? ['en_US'] : undefined,
      siteName: 'Yudai Yaguchi',
      publishedTime: post.created,
      modifiedTime: post.lastUpdated,
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

export default async function BlogPostJa({ params }: BlogPostParams) {
  const { id: param } = await params;

  // Legacy id/wrong-category URLs already 308-redirected in the segment
  // layout (above the loading boundary); here the param is canonical.
  const resolved = await resolvePostParamSafe(param);

  let initialPost = null;
  try {
    initialPost = await getPublicPostCached(resolved?.id ?? param);
  } catch (error) {
    console.error('[blog/ja] server-side post fetch failed, falling back to client:', error);
  }

  // A /ja URL for a post without a Japanese translation would serve
  // English under a ja path — soft duplicate content that undermines
  // hreflang. Send it to the real (English) URL instead.
  if (initialPost && !initialPost.availableLanguages.includes('ja')) {
    redirect(
      `/blog/${encodeURIComponent(initialPost.category)}/${encodeURIComponent(resolved?.slug ?? initialPost.id)}`,
    );
  }

  let jsonLd: object | null = null;
  if (initialPost) {
    const translation = initialPost.translations.ja;
    if (translation) {
      jsonLd = buildPostJsonLd(initialPost, translation, 'ja', '/ja', resolved?.slug);
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
      <PostPage key={param} initialPost={initialPost} forcedLanguage="ja" />
    </>
  );
}
