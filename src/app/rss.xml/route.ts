import { htmlToText } from 'html-to-text';
import { getFirestore } from '@/lib/firebase-admin';
import { POSTS_COLLECTION } from '@/app/api/constants';
import { pickTranslation, type PostTranslations } from '@/lib/blog/postTranslations';
import { getSlugMapSafe } from '@/lib/blog/getSlugIndexServer';
import { SITE_URL } from '@/lib/siteConfig';

// Rendered per request, like the sitemap: a build-time snapshot would be
// frozen empty because firebase-admin cannot initialize during `next build`.
export const dynamic = 'force-dynamic';

const FEED_TITLE = 'Yudai Yaguchi — Blog';
const FEED_DESCRIPTION =
  'Writing on product engineering, fintech systems, system design, and applied algorithms.';
const MAX_ITEMS = 50;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// First parseable value wins; null omits <pubDate> entirely. Never falls
// back to "now": an unstable pubDate makes readers re-deliver old items.
function pubDate(...candidates: Array<string | undefined>): string | null {
  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toUTCString();
  }
  return null;
}

// Plain-text excerpt mirroring the meta-description cleanup on the post
// page: fenced code dropped, HTML flattened (bodies can be markdown or
// HTML), then markdown markers stripped.
function excerpt(body: string): string {
  return htmlToText(body.replace(/```[\s\S]*?(```|$)/g, ' '), { wordwrap: false })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\s*-]+/gm, ' ')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export async function GET() {
  try {
    const [snapshot, slugById] = await Promise.all([
      getFirestore()
        .collection(POSTS_COLLECTION)
        .where('isPublic', '==', true)
        .orderBy('lastUpdated', 'desc')
        .limit(MAX_ITEMS)
        .get(),
      getSlugMapSafe(),
    ]);

    const items = snapshot.docs.flatMap((doc) => {
      const data = doc.data();
      const translations = (data.translations || {}) as PostTranslations;
      // English-first: the feed is a single-language surface and most
      // subscribers arrive via the English site.
      const picked = pickTranslation(translations, 'en');
      if (!picked) return [];

      const category = typeof data.category === 'string' && data.category ? data.category : 'all';
      const slug = slugById.get(doc.id) ?? doc.id;
      const url = `${SITE_URL}/blog/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`;
      const published = pubDate(
        data.created?.toDate?.()?.toISOString() || data.created,
        data.lastUpdated?.toDate?.()?.toISOString() || data.lastUpdated,
      );

      return [
        [
          '<item>',
          `<title>${xmlEscape(picked.translation.title)}</title>`,
          `<link>${xmlEscape(url)}</link>`,
          `<guid isPermaLink="false">${xmlEscape(doc.id)}</guid>`,
          published ? `<pubDate>${published}</pubDate>` : '',
          `<category>${xmlEscape(category)}</category>`,
          `<description>${xmlEscape(excerpt(picked.translation.body))}</description>`,
          '</item>',
        ].join(''),
      ];
    });

    const feed = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '<channel>',
      `<title>${xmlEscape(FEED_TITLE)}</title>`,
      `<link>${xmlEscape(`${SITE_URL}/blog`)}</link>`,
      `<atom:link href="${xmlEscape(`${SITE_URL}/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
      `<description>${xmlEscape(FEED_DESCRIPTION)}</description>`,
      '<language>en-us</language>',
      `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
      ...items,
      '</channel>',
      '</rss>',
    ].join('\n');

    return new Response(feed, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        // Cache at the CDN for an hour; the feed itself renders on demand.
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('[rss] feed generation failed:', error);
    return new Response('RSS feed temporarily unavailable', { status: 503 });
  }
}
