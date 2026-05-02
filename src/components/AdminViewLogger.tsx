'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logActivity } from '@/lib/activityLog';

/**
 * Logs admin-page views as `admin.view.<segment>` so admin activity
 * itself is auditable. Mount inside the admin layout only.
 */
export default function AdminViewLogger() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    // /admin or /admin/foo/bar → admin.view.root | admin.view.foo.bar
    const tail = segments.slice(1).join('.') || 'root';
    logActivity({
      action: `admin.view.${tail}`,
      params: { pathname },
    });
  }, [pathname]);

  return null;
}
