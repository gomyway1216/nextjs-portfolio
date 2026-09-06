import type { Metadata } from 'next';
import NotFound from '@/views/NotFound';

// Server wrapper so the 404 response carries its own <title> and robots
// meta in the SSR HTML (crawlers, JS-off) instead of inheriting the
// site-wide default. The client view sets nothing itself: metadata is the
// single owner of the title.
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFoundPage() {
  return <NotFound />;
}
