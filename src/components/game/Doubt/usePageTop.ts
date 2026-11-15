import { useEffect } from 'react';

/** Put the page back at its top, at once (the site scrolls smoothly by default). */
export function scrollPageToTop(): void {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

/**
 * Each screen of the game is a separate block in the page's flow, so the page
 * keeps its scroll position when one replaces another. Start every new screen
 * at its top: its first row holds the title, the turn and the way back.
 */
export function usePageTop(screen: string): void {
  useEffect(() => {
    scrollPageToTop();
  }, [screen]);
}
