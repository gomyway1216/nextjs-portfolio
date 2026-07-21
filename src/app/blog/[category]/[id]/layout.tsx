import { permanentRedirect } from 'next/navigation';
import { resolvePostParamSafe } from '@/lib/blog/getSlugIndexServer';

interface BlogPostLayoutProps {
  children: React.ReactNode;
  params: Promise<{ category: string; id: string }>;
}

// The legacy-id 308 lives in this layout, not the page: layouts complete
// before the loading.tsx boundary flushes, so the redirect is a real HTTP
// 308. Inside the page it fires after streaming has begun and degrades to
// a client-side redirect on a 200 response, which crawlers weigh less.
export default async function BlogPostLayout({ children, params }: BlogPostLayoutProps) {
  const { category, id: param } = await params;
  const resolved = await resolvePostParamSafe(param);
  if (resolved && (param !== resolved.slug || category !== resolved.category)) {
    permanentRedirect(
      `/blog/${encodeURIComponent(resolved.category)}/${encodeURIComponent(resolved.slug)}`,
    );
  }
  return children;
}
