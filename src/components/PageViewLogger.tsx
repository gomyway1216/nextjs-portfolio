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

    const logPageView = () => {
      const search = searchParams?.toString();
      const path = search ? `${pathname}?${search}` : pathname;
      logActivity({
        action: 'client.page_view',
        params: { path, pathname, referrer: document.referrer || undefined },
      });
    };

    // Analytics should not compete with the hero image, hydration, and public
    // content requests. It remains keepalive-backed, but starts once the main
    // thread is idle (or shortly after load in browsers without the API).
    const scheduleIdle = window.requestIdleCallback;
    if (typeof scheduleIdle === 'function') {
      const idleId = scheduleIdle(logPageView, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = setTimeout(logPageView, 750);
    return () => clearTimeout(timeoutId);
  }, [pathname, searchParams]);

  return null;
}
