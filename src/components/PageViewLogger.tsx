'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { logActivity } from '@/lib/activityLog';

/**
 * Logs `client.page_view` on every route change.
 * Mount once near the root of the app.
 */
export default function PageViewLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams?.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    logActivity({
      action: 'client.page_view',
      params: { path, pathname, referrer: document.referrer || undefined },
    });
  }, [pathname, searchParams]);

  return null;
}
