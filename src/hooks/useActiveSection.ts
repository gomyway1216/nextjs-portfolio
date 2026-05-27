'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks which of the given DOM element ids is currently active in the
 * viewport for scroll-spy style navigation.
 *
 * Active = the topmost element whose top has crossed into the upper
 * `triggerBandPx` band of the viewport but whose bottom hasn't yet
 * scrolled past the top of that band. In plain terms: the section the
 * user is currently reading at the top of the screen.
 *
 * Returns `''` until at least one observed section enters the band, so
 * the SSR / first-render output is stable (no hydration mismatch).
 *
 * Replaces the unmaintained `react-scrollspy` library, which was a
 * suspected source of React #418 hydration mismatches because it
 * computed `currentClassName` differently between server and client.
 */
export function useActiveSection(
  ids: readonly string[],
  options: { triggerBandPx?: number } = {},
): string {
  const { triggerBandPx = 30 } = options;
  const [activeId, setActiveId] = useState<string>('');

  // Join ids into a string so the effect re-runs when the list changes
  // identity but not when the array reference changes each render.
  const idsKey = ids.join('|');

  useEffect(() => {
    if (ids.length === 0) return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // Track which elements are currently intersecting the trigger band.
    // We pick the topmost (i.e. first by document order in `ids`) among
    // them — that's the section the user has just scrolled to the top of.
    const visibleSet = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSet.add(entry.target.id);
          } else {
            visibleSet.delete(entry.target.id);
          }
        }
        const visibleInOrder = ids.filter((id) => visibleSet.has(id));
        if (visibleInOrder.length > 0) {
          setActiveId(visibleInOrder[0]);
        }
      },
      {
        // Narrow horizontal band near the top of the viewport. Anything
        // intersecting this band is considered "the section currently
        // being read." We bias slightly downward via triggerBandPx so a
        // section becomes active a little before its top edge reaches
        // y=0 — matches the feel of the original `offset={-30}`.
        rootMargin: `-${triggerBandPx}px 0px -85% 0px`,
        threshold: 0,
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [idsKey, ids, triggerBandPx]);

  return activeId;
}
