'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { logActivity } from '@/lib/activityLog';

/**
 * Logs `client.page_view` on every route change.
 * Mount once near the root of the app.
 *
 * Skips known bot/crawler user-agents so search-engine and uptime-monitor
 * traffic doesn't flood activity_logs with thousands of redundant page-view
 * rows. Real-user traffic still logs normally.
 */

// Conservative pattern — matches the most common crawler families. Doesn't
// try to be exhaustive (too many edge cases); if a bot occasionally slips
// through it just costs a few extra rows.
const BOT_UA_REGEX = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|preview|fetch|monitor|uptime|pingdom|gtmetrix|lighthouse|chrome-lighthouse|headless/i;

function isBot(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return BOT_UA_REGEX.test(ua);
}

export default function PageViewLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (isBot()) return;
    const search = searchParams?.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    logActivity({
      action: 'client.page_view',
      params: { path, pathname, referrer: document.referrer || undefined },
    });
  }, [pathname, searchParams]);

  return null;
}
