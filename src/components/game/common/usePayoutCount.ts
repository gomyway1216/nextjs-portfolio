/**
 * A win counted out, as a medal machine counts a win into its counter: the
 * medals that come back run in one at a time, so the WIN digits run up and
 * the player's medals run up with them, each step with a clink. A big win
 * runs faster, and the next bet ends the count at once (the table sets the
 * payout to null).
 *
 * The pace is the one the floor's other machines count a win at (one medal
 * every 60 ms, never longer than 2.4 s), so a win feels the same at every
 * machine.
 *
 * Only the digits are counted. The medals themselves are already back (and
 * every number written in type for a screen reader is the real one), so
 * nothing about the medals waits for the count.
 */

import { useEffect, useRef, useState } from 'react';

/** A win to count: `id` is new for every win, `medals` the medals that come back. */
export interface Payout {
  id: number;
  medals: number;
}

/** How long one step of a count takes, ms: a medal a step, until a win is too big for that. */
export const PAYOUT_STEP_MS = 60;
/** The most steps a count takes, however big the win (40 steps of 60 ms: 2.4 s). */
export const PAYOUT_STEPS = 40;

/**
 * What a counter's MEDALS and WIN digits show while a win is counted out (`counting`: `counted` of the `medals` that
 * came back so far): the medals as they were before the win came back plus what has been counted, and the win in
 * step with them. With nothing being counted, the numbers as they are.
 */
export const countedLeds = (medals: number, won: number | null, counting: { counted: number; medals: number } | null) =>
  counting && counting.medals > 0
    ? { medals: medals - (counting.medals - counting.counted), won: won === null ? null : Math.round((won * counting.counted) / counting.medals) }
    : { medals, won };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * How many of the win's medals have been counted so far, or null when no win is being counted (the digits show the
 * medals as they are). `onStep` is called at every step, for the clink. With reduced motion nothing is counted.
 */
export function usePayoutCount(payout: Payout | null, onStep?: () => void): number | null {
  const [progress, setProgress] = useState<{ id: number; counted: number; done: boolean } | null>(null);
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  });

  const id = payout && payout.medals > 0 ? payout.id : null;
  const medals = payout?.medals ?? 0;
  useEffect(() => {
    if (id === null || prefersReducedMotion()) return;
    const steps = Math.min(medals, PAYOUT_STEPS);
    let done = 0;
    const timer = window.setInterval(() => {
      done++;
      step.current?.();
      const finished = done >= steps;
      setProgress({ id, counted: Math.round((medals * done) / steps), done: finished });
      if (finished) window.clearInterval(timer);
    }, PAYOUT_STEP_MS);
    return () => window.clearInterval(timer);
  }, [id, medals]);

  if (id === null) return null;
  if (progress?.id === id) return progress.done ? null : progress.counted;
  // This win's count has not made its first step yet.
  return prefersReducedMotion() ? null : 0;
}
