import type { PostLanguage } from './postTranslations';

export const BLOG_SOCIAL_IMAGE_PATH = '/blog/opengraph-image';
export const BLOG_SOCIAL_IMAGE_ALT = 'Yudai Yaguchi — Engineering Blog';

const OPEN_GRAPH_LOCALES = {
  en: 'en_US',
  ja: 'ja_JP',
} as const;

export interface BlogSocialImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  type?: string;
}

const DEFAULT_BLOG_SOCIAL_IMAGE: Readonly<BlogSocialImage> = Object.freeze({
  url: BLOG_SOCIAL_IMAGE_PATH,
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: BLOG_SOCIAL_IMAGE_ALT,
});

/**
 * Every public blog route must advertise an image explicitly. Next.js
 * replaces nested Open Graph metadata instead of merging it, so relying on
 * the root layout's file-based image leaves list pages and image-less posts
 * without a deterministic social preview.
 */
export function buildBlogSocialImages(
  imageUrl: string | null | undefined,
  imageAlt: string,
): BlogSocialImage[] {
  const normalizedImageUrl = imageUrl?.trim();
  if (normalizedImageUrl) {
    return [{ url: normalizedImageUrl, alt: imageAlt }];
  }

  return [{ ...DEFAULT_BLOG_SOCIAL_IMAGE }];
}

export function buildTwitterImages(images: BlogSocialImage[]) {
  return images.map(({ url, alt }) => ({ url, alt }));
}

export function buildBlogOpenGraphLocales(
  language: PostLanguage,
  availableLanguages: readonly PostLanguage[],
) {
  const alternateLanguage: PostLanguage = language === 'en' ? 'ja' : 'en';

  return {
    locale: OPEN_GRAPH_LOCALES[language],
    alternateLocale: availableLanguages.includes(alternateLanguage)
      ? [OPEN_GRAPH_LOCALES[alternateLanguage]]
      : undefined,
  };
}
