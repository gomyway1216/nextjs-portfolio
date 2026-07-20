import { permanentRedirect } from 'next/navigation';

// Only post detail pages have language-pinned /ja URLs (that's where the
// indexable content lives). List browsing stays on the cookie-driven
// pages, so /ja/blog permanently lands there.
export default function JaBlogIndex() {
  permanentRedirect('/blog');
}
