import { permanentRedirect } from 'next/navigation';
import { resolvePostParamSafe } from '@/lib/blog/getSlugIndexServer';

interface BlogPostJaLayoutProps {
  children: React.ReactNode;
  params: Promise<{ category: string; id: string }>;
}

// Mirrors the bare route's layout: the legacy-id 308 must run above the
// loading.tsx boundary to be a real HTTP redirect instead of a streamed
// client-side one on a 200 response.
export default async function BlogPostJaLayout({ children, params }: BlogPostJaLayoutProps) {
  const { category, id: param } = await params;
  const resolved = await resolvePostParamSafe(param);
  if (resolved && (param !== resolved.slug || category !== resolved.category)) {
    permanentRedirect(
      `/ja/blog/${encodeURIComponent(resolved.category)}/${encodeURIComponent(resolved.slug)}`,
    );
  }
  return children;
}
