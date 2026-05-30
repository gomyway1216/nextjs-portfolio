'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

function isSameDocumentNavigation(url: URL) {
  return url.pathname === window.location.pathname && url.search === window.location.search;
}

function shouldDisableSmoothScroll(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  if (!(event.target instanceof Element)) return false;

  const anchor = event.target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;

  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin && !isSameDocumentNavigation(url);
}

export function RouteScrollBehaviorFix() {
  const pathname = usePathname();
  const originalStyleRef = useRef<string | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const restoreTimeoutRef = useRef<number | null>(null);
  const popNavigationRef = useRef(false);

  const cancelRestore = useCallback(() => {
    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }
    if (restoreTimeoutRef.current !== null) {
      window.clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }
  }, []);

  const disableSmoothScroll = useCallback(() => {
    cancelRestore();

    const root = document.documentElement;
    if (originalStyleRef.current === null) {
      originalStyleRef.current = root.style.scrollBehavior;
    }
    root.style.scrollBehavior = 'auto';
  }, [cancelRestore]);

  const restoreSmoothScroll = useCallback(() => {
    cancelRestore();

    if (originalStyleRef.current !== null) {
      document.documentElement.style.scrollBehavior = originalStyleRef.current;
      originalStyleRef.current = null;
    }
  }, [cancelRestore]);

  const scrollToRouteTop = useCallback(() => {
    if (window.location.hash) return;
    window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
  }, []);

  const restoreAfterNavigationSettles = useCallback(() => {
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreTimeoutRef.current = window.setTimeout(restoreSmoothScroll, 350);
      });
    });
  }, [restoreSmoothScroll]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (shouldDisableSmoothScroll(event)) {
        popNavigationRef.current = false;
        disableSmoothScroll();
      }
    };

    const onPopState = () => {
      popNavigationRef.current = window.location.pathname !== pathname;
      disableSmoothScroll();
      restoreAfterNavigationSettles();
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      restoreSmoothScroll();
    };
  }, [disableSmoothScroll, restoreAfterNavigationSettles, restoreSmoothScroll, pathname]);

  useLayoutEffect(() => {
    const isPopNavigation = popNavigationRef.current;
    popNavigationRef.current = false;

    disableSmoothScroll();

    if (!isPopNavigation) {
      scrollToRouteTop();
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        scrollToRouteTop();
        restoreAfterNavigationSettles();
      });
    } else {
      restoreAfterNavigationSettles();
    }

    return cancelRestore;
  }, [pathname, disableSmoothScroll, scrollToRouteTop, restoreAfterNavigationSettles, cancelRestore]);

  return null;
}
