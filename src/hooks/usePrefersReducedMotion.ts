'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * One-shot, non-reactive check. Safe anywhere: returns false when
 * matchMedia is unavailable (SSR, JSDOM tests).
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mediaQuery = window.matchMedia(QUERY);
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }
  // Older Safari/WebView: MediaQueryList only implements addListener.
  mediaQuery.addListener(onChange);
  return () => mediaQuery.removeListener(onChange);
}

/**
 * Whether the user asked the OS to minimize non-essential motion.
 * Returns false during SSR so the server and first client render agree.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
