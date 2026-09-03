import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import PostPage from '@/page/blog/PostPage';
import { getPublicPostCached } from '@/lib/blog/getPostServer';
import { resolvePostParamSafe } from '@/lib/blog/getSlugIndexServer';
import { normalizeLanguage, pickTranslation } from '@/lib/blog/postTranslations';
import { localizeDetailPost } from '@/lib/blog/localizeDetailPost';
import { excerpt } from '@/lib/blog/postExcerpt';
import { buildPostJsonLd } from '@/lib/blog/postJsonLd';
import {
  buildBlogOpenGraphLocales,
  buildBlogSocialImages,
  buildTwitterImages,
} from '@/lib/blog/socialMetadata';

interface BlogPostParams {
  // `id` is a slug for public posts (legacy Firestore-id URLs 308-redirect
  // to the slug); private posts have no public slug and stay id-addressed.
  params: Promise<{ category: string; id: string }>;
}

// generateMetadata and the page run independently but ask for the same
// records. React request memoization keeps each lookup to one invocation.
const resolvePostForRoute = cache(resolvePostParamSafe);
const getPublicPostForRoute = cache(getPublicPostCached);

export async function generateMetadata({ params }: BlogPostParams): Promise<Metadata> {
  const { id: param } = await params;
  const resolved = await resolvePostForRoute(param);

  let post = null;
  try {
    post = await getPublicPostForRoute(resolved?.id ?? param);
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
  const canonicalPath = `/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(resolved?.slug ?? post.id)}`;
  const jaPath = `/ja${canonicalPath}`;
  const socialImages = buildBlogSocialImages(post.image, title);

  // hreflang: with both translations, this URL is what a cookieless
  // crawler reads in English, so it's the en + x-default alternate and
  // the pinned /ja route carries Japanese. A ja-only post renders
  // Japanese here too (pickTranslation fallback) — declaring it `en`
  // would be wrong, so it instead canonicalizes onto the pinned ja URL.
  const hasJa = post.availableLanguages.includes('ja');
  const hasEn = post.availableLanguages.includes('en');
  const canonicalUrl = hasEn ? canonicalPath : jaPath;
  const { locale, alternateLocale } = buildBlogOpenGraphLocales(
    picked.language,
    post.availableLanguages,
  );

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      ...(hasEn && hasJa
        ? {
            languages: {
              en: canonicalPath,
              ja: jaPath,
              'x-default': canonicalPath,
            },
          }
        : {}),
    },
    openGraph: {
      type: 'article',
      locale,
      alternateLocale,
      siteName: 'Yudai Yaguchi',
      title,
      description,
      url: canonicalUrl,
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

export default async function BlogPost({ params }: BlogPostParams) {
  const { category, id: param } = await params;

  const resolved = await resolvePostForRoute(param);

  // Middleware handles legacy 20-character Firestore IDs before rendering.
  // Keep a page-level fallback for malformed category/slug combinations;
  // importantly, this now sits inside loading.tsx rather than blocking it.
  if (resolved && (param !== resolved.slug || category !== resolved.category)) {
    permanentRedirect(
      `/blog/${encodeURIComponent(resolved.category)}/${encodeURIComponent(resolved.slug)}`,
    );
  }

  // Public posts arrive server-side (no spinner, crawlable shell);
  // private posts fall back to PostPage's client fetch which carries the
  // admin's auth token.
  let initialPost = null;
  try {
    initialPost = await getPublicPostForRoute(resolved?.id ?? param);
  } catch (error) {
    console.error('[blog] server-side post fetch failed, falling back to client:', error);
  }

  // BlogPosting + BreadcrumbList structured data for public posts, in the
  // language the reader (and the cookieless crawler: en) receives.
  let jsonLd: object | null = null;
  let localizedPost = initialPost;
  if (initialPost) {
    const cookieStore = await cookies();
    const language = normalizeLanguage(cookieStore.get('i18nextLng')?.value);
    const localized = localizeDetailPost(initialPost, language);
    if (localized) {
      localizedPost = localized.post;
      jsonLd = buildPostJsonLd(
        initialPost,
        localized.translation,
        localized.language,
        '',
        resolved?.slug,
      );
    }
  }

  // Key by URL param: client-side navigation between posts reuses the
  // component instance, and PostPage seeds its state from initialPost.
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <PostPage
        key={param}
        initialPost={localizedPost}
        canonicalSlug={resolved?.slug ?? param}
      />
    </>
  );
}
