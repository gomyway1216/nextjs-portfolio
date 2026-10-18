'use client';

/**
 * On a phone a machine's show (the roulette wheel, the race track) and the button that sets it going (SPIN, START)
 * are a screen apart: the button sits under the felt or the tickets, the show above them. Pressing the button lifts
 * the view to the show, as a player at a real machine looks up from the buttons to the wheel. A machine that wants
 * to can then take the view back down to the button once the result has been seen, unless the player has touched
 * the page in the meantime.
 *
 * The view is moved on the next frame, after the press has been drawn. A smooth scroll begun in the press itself,
 * before React has laid out the machine's new state, was dropped by the browser: on production the page never moved.
 */

/** How much of the show must be on screen already for the view to be left where it is. */
const ON_SCREEN = 0.6;

/** Anything the player does with the page while the view is up: after it, the view is theirs and is not moved back. */
const PLAYER_MOVES = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;

export interface Glance {
  /** Takes the view back down to the pressed button, where it was on the screen, unless the player has moved since. */
  back: () => void;
  /** Forgets the way back (the machine is left, or a new round begins). */
  drop: () => void;
}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Whether at least `ON_SCREEN` of `element` is inside the window. */
export function onScreen(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const visible = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
  return visible >= rect.height * ON_SCREEN;
}

const NOWHERE: Glance = { back: () => undefined, drop: () => undefined };

/**
 * Lifts the view to `show` if it is not on screen, centred. `from` is the button that was pressed: `back()` puts it
 * where it was on the screen again. Without `from` there is no way back.
 */
export function lookUp(show: HTMLElement | null, from: HTMLElement | null = null): Glance {
  if (!show || typeof window === 'undefined') return NOWHERE;
  let state: 'waiting' | 'up' | 'stay' | 'done' = 'waiting';
  let fromTop = 0;
  const stay = () => {
    if (state === 'up') state = 'stay';
  };
  const unlisten = () => {
    for (const type of PLAYER_MOVES) window.removeEventListener(type, stay, true);
  };
  const frame = window.requestAnimationFrame(() => {
    if (state !== 'waiting') return;
    if (!show.isConnected || onScreen(show)) {
      state = 'done';
      return;
    }
    if (from?.isConnected) fromTop = from.getBoundingClientRect().top;
    show.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    state = 'up';
    for (const type of PLAYER_MOVES) window.addEventListener(type, stay, { capture: true, passive: true });
  });
  return {
    back: () => {
      const goBack = state === 'up' && from !== null && from.isConnected;
      if (state === 'waiting') window.cancelAnimationFrame(frame);
      state = 'done';
      unlisten();
      if (!goBack || !from) return;
      const top = from.getBoundingClientRect().top + window.scrollY - fromTop;
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    },
    drop: () => {
      if (state === 'waiting') window.cancelAnimationFrame(frame);
      state = 'done';
      unlisten();
    },
  };
}
