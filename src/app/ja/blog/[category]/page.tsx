import { permanentRedirect } from 'next/navigation';

// See /ja/blog/page.tsx — category listings have no language-pinned
// variant; only post detail pages do.
export default async function JaBlogCategory({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  permanentRedirect(category === 'all' ? '/blog' : `/blog/${encodeURIComponent(category)}`);
}
