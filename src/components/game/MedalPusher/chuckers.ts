/**
 * The three START pockets — the chuckers — as the lip's rule has them: where
 * each is at a given moment, and how big its mouth is, in the cabinet's own
 * measures — across the field, up from the lower table, and out from the back
 * wall, which is what `project` in view.ts takes. The engine decides which
 * medal goes through which (`CHECKERS` and `checkerAt` in engine.ts): a medal
 * that goes over the lip with its middle within a mouth's play of its middle.
 * This file only says where that puts the mouths, at the lip's very edge.
 *
 * What the player is shown of that rule is the START plate's: a hole in the
 * plate below each mouth, a medal wide and a hair more, which a medal that
 * went over at the mouth slides into and drops through (catcher.ts).
 *
 * What lights a chucker is the session's `checker` event, which carries its
 * number (`gate`) and comes once for every medal through it.
 */

import type { Spot } from './arms';
import { CHECKERS, MEDAL_RADIUS, pusherFront } from './engine';
import { HEIGHT } from './view';

export const CHUCKERS = {
  /** How many there are. They are numbered from the left, from 0. */
  count: CHECKERS.positions.length,
  /**
   * Half the width of a mouth: a medal's radius, and as much again to either
   * side as a medal's middle may be off the mouth's and still have the whole
   * medal inside.
   */
  radius: MEDAL_RADIUS + CHECKERS.halfWidth,
  /** How high the mouths are: the top of the pusher, whose lip they are on. */
  height: HEIGHT.pusher,
} as const;

/**
 * The middle of a chucker's mouth at `time`, where a medal's middle is as it
 * goes over and the rule counts it: across the field where the engine has it,
 * at the height of the pusher's top, and on the lip's very edge wherever the
 * stroke has taken it. The hole a medal is seen to go into is below that, in
 * the START plate that hangs on the pusher's front: catcher.ts says where.
 */
export function chuckerSpot(chucker: number, time: number): Spot {
  if (!Number.isInteger(chucker) || chucker < 0 || chucker >= CHUCKERS.count) throw new Error('there is no such chucker');
  return { x: CHECKERS.positions[chucker], height: CHUCKERS.height, depth: pusherFront(time) };
}

/** The middles of all the mouths at `time`, from the left. */
export const chuckerSpots = (time: number): Spot[] => CHECKERS.positions.map((_x, chucker) => chuckerSpot(chucker, time));
