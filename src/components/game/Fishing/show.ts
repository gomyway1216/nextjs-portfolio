/**
 * How a cast is played out on the screen: a list of steps, each with the
 * moment it begins. Only the show is here; what the cast comes to was drawn
 * before the first step (engine.ts), and no step changes it.
 *
 * - **flight**: the float flies out over the water and lands with a splash.
 * - **wait**: shadows swim by the float. The one that will bite comes up to it
 *   (its size is the size of what was drawn, as a real machine's shadow hints
 *   at what it is). The harbor's lord is announced first (**warning**).
 * - **hooked**: the float goes under: a bite.
 * - **fight**: the line is reeled in, longer for a bigger fish.
 * - the end: **landed** (the fish comes up and is shown), **chest** (a
 *   treasure chest comes up, and its prize roulette runs to the prize drawn,
 *   then **landed**), **away** (the line goes slack), or **nothing** (no fish
 *   bit, and the float is reeled in empty).
 *
 * With less motion asked for, every step is short and nothing flies, swims
 * or shakes. REEL steps the show on to its next step, and SKIP to its end:
 * both only hurry the show.
 */

import { CHEST, fishOf, type Cast, type Shadow } from './engine';

export type Step = 'flight' | 'warning' | 'wait' | 'hooked' | 'fight' | 'chest' | 'landed' | 'away' | 'nothing';

/** The steps that end a show: what the screen keeps showing until the next cast. */
export const ENDS: readonly Step[] = ['landed', 'away', 'nothing'];
export const isEnd = (step: Step): boolean => ENDS.includes(step);

/** How long each step takes, in milliseconds, with the motion on. */
export const TIMES = {
  flight: 520,
  warning: 1_400,
  /** Shadows swim by before the bite, the bigger ones a little longer. */
  wait: { small: 900, medium: 1_100, large: 1_300, chest: 1_100, lord: 1_300 } as Record<Shadow, number>,
  /** Waiting for a bite that never comes. */
  empty: 1_700,
  hooked: 420,
  fight: { small: 700, medium: 1_200, large: 1_900, chest: 1_000, lord: 3_200 } as Record<Shadow, number>,
  /** The chest's roulette, from its first light to the prize. */
  chest: 1_800,
} as const;

/** How long each step takes with less motion: short, and the same for every fish. */
export const CALM_TIMES = { flight: 0, warning: 500, wait: 300, empty: 400, hooked: 0, fight: 300, chest: 500 } as const;

export interface Show {
  steps: { step: Step; at: number }[];
  /** When the show reaches its end, in milliseconds from the cast. */
  length: number;
  /** The step it ends on. */
  end: Step;
}

/** The show of a cast. */
export function showOf(cast: Cast, calm = false): Show {
  const steps: { step: Step; at: number }[] = [];
  let at = 0;
  const go = (step: Step, ms: number) => {
    steps.push({ step, at });
    at += Math.max(0, ms);
  };
  go('flight', calm ? CALM_TIMES.flight : TIMES.flight);
  if (cast.fish === null) {
    go('wait', calm ? CALM_TIMES.empty : TIMES.empty);
    steps.push({ step: 'nothing', at });
    return { steps: steps.filter(keep), length: at, end: 'nothing' };
  }
  const shadow = fishOf(cast.fish).shadow;
  if (shadow === 'lord') go('warning', calm ? CALM_TIMES.warning : TIMES.warning);
  go('wait', calm ? CALM_TIMES.wait : TIMES.wait[shadow]);
  go('hooked', calm ? CALM_TIMES.hooked : TIMES.hooked);
  go('fight', calm ? CALM_TIMES.fight : TIMES.fight[shadow]);
  if (!cast.landed) {
    steps.push({ step: 'away', at });
    return { steps: steps.filter(keep), length: at, end: 'away' };
  }
  if (cast.fish === 'chest') go('chest', calm ? CALM_TIMES.chest : TIMES.chest);
  steps.push({ step: 'landed', at });
  return { steps: steps.filter(keep), length: at, end: 'landed' };
}

/** A step of no length is left out of the list, but for the first and the last: nothing is shown for no time. */
function keep(entry: { step: Step; at: number }, index: number, all: { step: Step; at: number }[]): boolean {
  if (index === 0 || index === all.length - 1) return true;
  return all[index + 1].at > entry.at;
}

/** The step of a show `elapsed` ms after the cast. */
export function stepAt(show: Show, elapsed: number): Step {
  let now = show.steps[0].step;
  for (const { step, at } of show.steps) if (elapsed >= at) now = step;
  return now;
}

/** Where REEL takes a show that is at `elapsed`: the start of its next step (its end, from the last but one). */
export function reeledTo(show: Show, elapsed: number): number {
  const next = show.steps.find(({ at }) => at > elapsed);
  return next ? next.at : show.length;
}

/**
 * The lights of the chest's roulette, from its first to the prize drawn: its
 * prizes lit in turn, round and on, slowing to a stop. Each entry is the
 * prize lit and when, in milliseconds from the start of the roulette.
 */
export function chestLights(prize: number, length: number = TIMES.chest, turns = 3): { lit: number; at: number }[] {
  const n = CHEST.length;
  const steps = turns * n + prize + 1;
  const lights: { lit: number; at: number }[] = [];
  for (let i = 0; i < steps; i++) {
    // Eased so that the light slows as it comes to the prize: quick at first, the last steps long.
    const progress = steps <= 1 ? 1 : i / (steps - 1);
    lights.push({ lit: i % n, at: Math.round(length * 0.92 * (0.35 * progress + 0.65 * progress ** 2)) });
  }
  return lights;
}
