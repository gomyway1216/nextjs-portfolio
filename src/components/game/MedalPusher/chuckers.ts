/**
 * The three START pockets — the chuckers — as things in the cabinet: where
 * each is at a given moment, how big its mouth is, and which of them a medal
 * came through, in the cabinet's own measures — across the field, up from the
 * lower table, and out from the back wall, which is what `project` in view.ts
 * takes. The engine decides which medal drops through which (`CHECKERS` and
 * `checkerAt` in engine.ts). This file only says where that puts them, so that
 * whatever draws the machine draws them where the rule has them.
 *
 * The chuckers are on the pusher's lip, so they ride out and back with it and
 * never move along it. A medal that goes over the lip wholly inside one drops
 * through it and starts a spin; one that hangs over a mouth's edge goes over
 * the lip beside it like any other.
 *
 * What lights a chucker is the session's `checker` event, which carries its
 * number (`gate`) and comes once for every medal through it.
 */

import type { Spot } from './arms';
import { CHECKERS, MEDAL_RADIUS, checkerAt, pusherFront, type Medal } from './engine';
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
  /** Seconds a medal that has come over the lip is drawn falling to the lower table. One that drops through a mouth is seen for longer: catcher.ts says how long. */
  drop: 0.18,
} as const;

/**
 * The middle of a chucker's mouth at `time`, where a medal's middle is as it
 * drops through: across the field where the engine has it, at the height of
 * the pusher's top, and on the lip's very edge wherever the stroke has taken
 * it. The mouth a medal is seen to go into is drawn out beyond that edge, in
 * the catcher that hangs on the pusher's front: catcher.ts says where.
 */
export function chuckerSpot(chucker: number, time: number): Spot {
  if (!Number.isInteger(chucker) || chucker < 0 || chucker >= CHUCKERS.count) throw new Error('there is no such chucker');
  return { x: CHECKERS.positions[chucker], height: CHUCKERS.height, depth: pusherFront(time) };
}

/** The middles of all the mouths at `time`, from the left. */
export const chuckerSpots = (time: number): Spot[] => CHECKERS.positions.map((_x, chucker) => chuckerSpot(chucker, time));

/**
 * The chucker a medal on its way down from the lip came through, or −1 if it
 * came over beside them, is a ball or a jewel, or is not on its way down: one that lies
 * on the pusher, or has been on the lower table for `within` seconds or more.
 * It is exact in the step the medal comes over (`sinceDrop` is 0) and as near
 * after that as the pile has left the medal, which is near enough to draw it
 * in the mouth. It is not what counts: the count is the `checker` event.
 */
export function droppedThrough(medal: Medal, within: number = CHUCKERS.drop, wings = false): number {
  if (medal.ball || medal.jewel || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= within) return -1;
  return checkerAt(medal.x, wings ? CHECKERS.wingWidth : CHECKERS.halfWidth);
}

/**
 * The chucker a medal on its way down from the lip caught the edge of
 * without fitting it, or −1: one whose middle came over within `reach` of
 * where it would have fitted. Like `droppedThrough` it is exact in the step
 * the medal comes over and near enough after. With `wings` the slots are
 * taking medals at their wider width.
 */
export function grazed(medal: Medal, within: number, reach: number, wings = false): number {
  if (medal.ball || medal.jewel || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= within) return -1;
  const half = wings ? CHECKERS.wingWidth : CHECKERS.halfWidth;
  if (checkerAt(medal.x, half) >= 0) return -1;
  return checkerAt(medal.x, half + reach);
}
