import type { Metadata } from 'next';
import NotFound from '@/views/NotFound';

// Server wrapper so the 404 carries its own <title> (streamed metadata
// overrides any document.title set from a client effect) and stays out of
// the index.
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFoundPage() {
  return <NotFound />;
}
