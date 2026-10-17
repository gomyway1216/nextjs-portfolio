'use client';

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * A medal machine's meters do not jump to a win: the medals won run into the
 * player's medals one at a time, the digits counting up as they go, and a big
 * win runs faster. Pressing on to the next game (a bet, which takes medals)
 * ends the count at once, as on the real thing.
 *
 * Only a win is counted up. The machine says so (`pay`) just before it pays;
 * a rise that is not a win (medals taken back off the felt, the attendant's
 * refill, medals played up in another tab) is shown at once, and so is every
 * drop.
 *
 * This is only what the meters show. The medals themselves are moved at once,
 * by the machine, and the numbers written in type beside the meters (for a
 * screen reader, and for anything else that reads the page) are the medals as
 * they are.
 */

/** How fast a win runs in: one medal every `perMedal` ms, and never longer than `longest` ms (a big win runs faster). */
export const COUNT_UP = { perMedal: 60, longest: 2400 } as const;

/** How long, in ms, a win of `medals` takes to run in. */
export const countUpDuration = (medals: number): number => Math.min(COUNT_UP.longest, Math.max(0, medals) * COUNT_UP.perMedal);

/** The number a meter counting from `from` up to `to` shows `elapsed` ms after it began: whole medals, `to` at the end. */
export function countedAt(from: number, to: number, elapsed: number): number {
  const duration = countUpDuration(to - from);
  if (to <= from || duration <= 0 || elapsed >= duration) return to;
  return from + Math.floor((to - from) * (Math.max(0, elapsed) / duration));
}

/** How long after `pay` a rise is still taken for that win, in ms: the medals move at once, and the meter hears of it on the next render. */
export const PAY_WINDOW = 1000;

/** What a meter is doing: counting a win up (and where it has got to), or showing the value as it is. */
export interface Count {
  counting: boolean;
  shown: number;
}

const AT_REST: Count = { counting: false, shown: 0 };

/** One meter's count, kept outside React so that a step of it can be drawn before the next paint. */
function createCount() {
  let now = AT_REST;
  const watchers = new Set<() => void>();
  return {
    get: () => now,
    subscribe(watcher: () => void) {
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
      };
    },
    set(next: Count) {
      if (next.counting === now.counting && next.shown === now.shown) return;
      now = next.counting ? next : AT_REST;
      for (const watcher of [...watchers]) watcher();
    },
  };
}

export interface CountUp {
  /** The number the meter shows: running up to the value while a win runs in, the value otherwise. */
  shown: number | null;
  /** Whether a win is running in. */
  counting: boolean;
  /** Says that the next rise of the value is a win, to be counted up. Call it just before the machine pays. */
  pay: () => void;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * A meter that counts a win up to `value` (null while there is nothing to
 * show). The first value, every drop and every rise that is not a win are
 * shown as they are, and under reduced motion a win is too.
 */
export function useCountUp(value: number | null): CountUp {
  const [count] = useState(createCount);
  const state = useSyncExternalStore(count.subscribe, count.get, count.get);
  // The value the meter last took in, and until when a rise is a win.
  const seen = useRef(value);
  const payingUntil = useRef(-Infinity);

  const pay = useCallback(() => {
    payingUntil.current = performance.now() + PAY_WINDOW;
  }, []);

  // Before the paint, so that a win never shows its end for a frame before it starts counting.
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = value;
    if (value === before) return;
    const was = count.get();
    const from = was.counting ? was.shown : before;
    const win = value !== null && from !== null && value > from && performance.now() <= payingUntil.current;
    if (win) payingUntil.current = -Infinity;
    if (!win || value === null || from === null || reducedMotion()) {
      count.set(AT_REST);
      return;
    }
    count.set({ counting: true, shown: from });
    let frame = 0;
    let start: number | null = null;
    const tick = (time: number) => {
      start ??= time;
      const n = countedAt(from, value, time - start);
      count.set(n >= value ? AT_REST : { counting: true, shown: n });
      if (n < value) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value, count]);

  return { shown: state.counting ? state.shown : value, counting: state.counting, pay };
}
