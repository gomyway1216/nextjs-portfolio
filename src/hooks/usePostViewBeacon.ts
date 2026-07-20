'use client';

import { useEffect } from 'react';
import { recordPostView } from '@/services/postsService';

const viewedKey = (postId: string) => `blog-post-viewed-${postId}`;

/**
 * Send a single view beacon for a post. One count per browser session:
 * re-reads within the session (tab switches, language toggles, client-side
 * back/forward) don't inflate the number. Pass `enabled: false` while the
 * post is loading, private, or being read by the admin.
 */
export function usePostViewBeacon(postId: string | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!postId || !enabled) return;

    try {
      if (sessionStorage.getItem(viewedKey(postId))) return;
      sessionStorage.setItem(viewedKey(postId), '1');
    } catch {
      // sessionStorage unavailable (private mode quirks): still count the
      // view, accepting a possible duplicate over losing it entirely.
    }

    recordPostView(postId);
  }, [postId, enabled]);
}
