import { SITE_URL } from '@/lib/siteConfig';
import { categoryLabel } from '@/lib/blog/categoryLabel';
import type { DetailPost } from '@/services/postsService';
import type { PostLanguage, Translation } from './postTranslations';
import { excerpt } from './postExcerpt';

/**
 * BlogPosting + BreadcrumbList structured data for a post page, with the
 * author pointing at the site-wide Person node from the root layout.
 *
 * `pathPrefix` distinguishes the language-pinned routes ('/ja') from the
 * default ones (''). Breadcrumb list/category items always use the bare
 * URLs — the /ja list routes are redirects, and breadcrumbs should not
 * point crawlers at redirects.
 */
export function buildPostJsonLd(
  post: DetailPost,
  translation: Translation,
  language: PostLanguage,
  pathPrefix: '' | '/ja' = '',
  // Canonical URL slug when known; defaults to the id (legacy URL form).
  slug?: string,
): object {
  const categoryUrl = `${SITE_URL}/blog/${encodeURIComponent(post.category)}`;
  const postUrl = `${SITE_URL}${pathPrefix}/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(slug ?? post.id)}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: translation.title,
        description: excerpt(translation.body),
        url: postUrl,
        mainEntityOfPage: postUrl,
        datePublished: post.created,
        dateModified: post.lastUpdated || post.created,
        inLanguage: language,
        ...(post.image ? { image: post.image } : {}),
        author: { '@id': `${SITE_URL}/#person` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 2, name: categoryLabel(post.category), item: categoryUrl },
          { '@type': 'ListItem', position: 3, name: translation.title, item: postUrl },
        ],
      },
    ],
  };
}
