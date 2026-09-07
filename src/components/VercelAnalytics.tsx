'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Vercel Web Analytics without the @vercel/analytics package: package.json
// is byte-pinned by the shogi ML evidence tests, so a new dependency is
// off the table. This mirrors what the package's Next.js entry does —
// load the insights script with auto-tracking disabled and report a
// pageview on every App Router navigation (initial render included).
// The script is served by Vercel only once Web Analytics is enabled for
// the project in the dashboard; until then it 404s and nothing is sent.
const SCRIPT_SRC = '/_vercel/insights/script.js';

type VaCommand = 'pageview' | 'event' | 'beforeSend';

declare global {
  interface Window {
    va?: (command: VaCommand, ...args: unknown[]) => void;
    vaq?: unknown[][];
  }
}

function ensureQueue() {
  if (typeof window === 'undefined' || window.va) return;
  window.va = (...args: unknown[]) => {
    (window.vaq = window.vaq || []).push(args);
  };
}

export default function VercelAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !pathname) return;
    ensureQueue();
    window.va?.('pageview', { route: pathname, path: pathname });
  }, [pathname]);

  if (process.env.NODE_ENV !== 'production') return null;

  return <Script src={SCRIPT_SRC} strategy="afterInteractive" data-disable-auto-track="1" />;
}
