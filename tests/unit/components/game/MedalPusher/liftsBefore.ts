/**
 * The tower lifts as versions 7 to 9 of a save wrote them, for the tests of
 * those saves. Until the tower tubes, a tower came up through a hatch in the
 * pusher's deck on a lift, and gained its medals standing there; a lift is
 * still read from an older save, and given back to the tubes (storage.ts,
 * `intoTubes`). The numbers are the last that game had.
 */

import type { Medal } from '@/components/game/MedalPusher/engine';

export const LIFT = {
  lamps: 0.2,
  doors: 0.4,
  rises: 0.5,
  ripple: 0.1,
  /** Seconds from a prize to its towers' first medal coming up. */
  opens: 1.3,
  /** Seconds a built tower stood in its guard before the guard began to sink. */
  stands: 0.5,
  sinks: 0.6,
  shuts: 0.3,
  /** Seconds from a guard beginning to sink until its lift was done. */
  closes: 0.9,
} as const;

/** The tallest tower there was then, and the medals a second each tower gained. */
export const TOWER_THEN = { max: 25, perSecond: 5.5, places: 18 } as const;

export interface Lift {
  id: number;
  x: number;
  behind: number;
  size: number;
  wait: number;
  sunk: number;
}

/** A medal as those versions wrote it: with the medals its tower had yet to gain. */
export type MedalThen = Medal & { grow: number };

/** Whether a lift still held its tower, and whether that tower stood built in its guard. */
export const holds = (lift: Lift): boolean => lift.sunk < 0;
export const stands = (lift: Lift): boolean => lift.sunk < 0 && lift.sunk > -1;

/** A lift found already at work on a tower with no word of when it began: its guard up and its medals coming. */
export const liftAtWork = (tower: MedalThen, front: number): Lift => ({ id: tower.id, x: tower.x, behind: front - tower.y, size: tower.stack + tower.grow, wait: 0, sunk: -1 });
