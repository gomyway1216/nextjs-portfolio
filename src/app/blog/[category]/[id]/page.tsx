import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { htmlToText } from 'html-to-text';
import PostPage from '@/page/blog/PostPage';
import { getPublicPostCached } from '@/lib/blog/getPostServer';
import { normalizeLanguage, pickTranslation } from '@/lib/blog/postTranslations';
import { categoryLabel } from '@/lib/blog/categoryLabel';
import { SITE_URL } from '@/lib/siteConfig';

interface BlogPostParams {
  params: Promise<{ category: string; id: string }>;
}

function excerpt(body: string): string {
  // Bodies are markdown; htmlToText only handles HTML, so markdown
  // syntax (blockquote ">", headings, emphasis) leaked into meta
  // descriptions verbatim. Drop fenced code blocks first (their contents
  // are noise in a description), then strip the inline markers.
  return htmlToText(body.replace(/```[\s\S]*?(```|$)/g, ' '), { wordwrap: false })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\s*-]+/gm, ' ')
    .replace(/[`*_~]/g, '')
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

  // BlogPosting + BreadcrumbList structured data for public posts, with
  // the author pointing at the site-wide Person node from the root layout.
  let jsonLd: object | null = null;
  if (initialPost) {
    const cookieStore = await cookies();
    const language = normalizeLanguage(cookieStore.get('i18nextLng')?.value);
    const picked = pickTranslation(initialPost.translations, language);
    if (picked) {
      const categoryUrl = `${SITE_URL}/blog/${encodeURIComponent(initialPost.category)}`;
      const postUrl = `${categoryUrl}/${encodeURIComponent(initialPost.id)}`;
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BlogPosting',
            headline: picked.translation.title,
            description: excerpt(picked.translation.body),
            url: postUrl,
            mainEntityOfPage: postUrl,
            datePublished: initialPost.created,
            dateModified: initialPost.lastUpdated || initialPost.created,
            inLanguage: picked.language,
            ...(initialPost.image ? { image: initialPost.image } : {}),
            author: { '@id': `${SITE_URL}/#person` },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE_URL}/blog` },
              { '@type': 'ListItem', position: 2, name: categoryLabel(initialPost.category), item: categoryUrl },
              { '@type': 'ListItem', position: 3, name: picked.translation.title, item: postUrl },
            ],
          },
        ],
      };
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
