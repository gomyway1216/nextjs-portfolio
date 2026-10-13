/**
 * The catcher: the one piece of furniture that holds the three START pockets,
 * as a thing in the cabinet. It is hung on the front of the pusher, just
 * under its lip, and rides out and back with it. Its top is a deck with three
 * round mouths in it, side by side, each as wide as its pocket and each with
 * a thick rim and a dark throat under it; along the front of the deck runs a
 * rail, and from the rail an apron slopes down toward the player with the
 * word START under each mouth. It stops short of the lower table, so the
 * medals that lie there pass under it.
 *
 * The engine knows nothing of it. Its rule is the lip's: a medal that goes
 * over the lip with its middle inside a pocket starts a spin (`CHECKERS` in
 * engine.ts), and everything that goes over the lip lands on the lower table
 * at the foot of the pusher's face. The catcher is what the player is shown
 * of that rule. A medal that counted is seen to slide off the lip into its
 * pocket's mouth and go down the throat. One that went over between the
 * mouths tips over the lip's edge and goes down behind the catcher. Either
 * way it then lies on the lower table under the catcher, out of sight, and
 * comes out from under its front as the pusher draws back. Beside the catcher
 * the lip is as it always was.
 *
 * Everything here is in the cabinet's own measures — across the field, up
 * from the lower table, and out from the back wall — and decides nothing.
 */

import type { Spot } from './arms';
import { CHUCKERS, droppedThrough } from './chuckers';
import { CHECKERS, MEDAL_RADIUS, MEDAL_THICKNESS, pusherFront, type Medal } from './engine';
import { HEIGHT, project } from './view';

/** How far it is from one pocket to the next. */
const PITCH = CHECKERS.positions[1] - CHECKERS.positions[0];
const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;

export const CATCHER = {
  /** Where it begins and ends across the field: half the way to another pocket beyond the outer two. */
  from: CHECKERS.positions[0] - PITCH / 2,
  to: CHECKERS.positions[CHECKERS.positions.length - 1] + PITCH / 2,
  /** How much of its length belongs to each pocket. */
  tile: PITCH,
  /** How high its deck is: just under the edge of the pusher's top. */
  deck: P - 0.3,
  /** How far the mouths stand off from the lip: as far as their rims are wide, and a hair more. Between them and the lip the deck is closed. */
  back: 1,
  /** The rim round a mouth: how wide the ring is, and how far it stands up out of the deck. */
  rim: { wide: 0.95, high: 0.55 },
  /** The rail along the front of the deck: how far out from the lip its front edge is, how thick it is, and how high its top. */
  rail: { out: 11.9, thick: 0.6, top: P + 0.5 },
  /** The foot of the apron: how far out from the lip, and how high above the lower table, which is higher than the medals that lie there. */
  foot: { out: 15.6, height: 2.6 },
  /** How high the floor of a throat is: nearly as deep as the catcher goes. */
  throat: 3,
  /** Seconds a medal that drops through a pocket is shown on its way into the mouth and down the throat. */
  sink: 0.34,
  /**
   * How high the catcher is taken to be for a prize ball that lies under it.
   * A ball is taller than the catcher. One that has come over the lip there
   * is shown under it all the same, as a medal is, rather than standing up
   * through its deck.
   */
  hood: 9.4,
} as const;

/** How long the apron is, from the rail down its slope to its foot. */
export const APRON = Math.hypot(CATCHER.foot.out - CATCHER.rail.out, CATCHER.rail.top - CATCHER.foot.height);

/**
 * The middle of a mouth at `time`: across the field where the engine has its
 * pocket, at the height of the deck, and out in front of the lip by the
 * closed strip and half the mouth.
 */
export function mouthSpot(chucker: number, time: number): Spot {
  if (!Number.isInteger(chucker) || chucker < 0 || chucker >= CHUCKERS.count) throw new Error('there is no such chucker');
  return { x: CHECKERS.positions[chucker], height: CATCHER.deck, depth: pusherFront(time) + CATCHER.back + CHUCKERS.radius };
}

/** The middles of all the mouths at `time`, from the left. */
export const mouthSpots = (time: number): Spot[] => CHECKERS.positions.map((_x, chucker) => mouthSpot(chucker, time));

/**
 * A point of the apron at `time`: `across` from its left end, and `down` its
 * slope from the rail, both in field units. The apron is `CATCHER.to −
 * CATCHER.from` across and `APRON` down.
 */
export function apronSpot(across: number, down: number, time: number): Spot {
  const share = down / APRON;
  return {
    x: CATCHER.from + across,
    height: CATCHER.rail.top + (CATCHER.foot.height - CATCHER.rail.top) * share,
    depth: pusherFront(time) + CATCHER.rail.out + (CATCHER.foot.out - CATCHER.rail.out) * share,
  };
}

/**
 * Whether something `radius` across lying on the lower table at (x, depth)
 * is under the catcher at `time`, wholly or in part.
 */
export function underCatcher(x: number, depth: number, radius: number, time: number): boolean {
  return x + radius > CATCHER.from && x - radius < CATCHER.to && depth - radius < pusherFront(time) + CATCHER.foot.out;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Where a medal on its way out of sight at the catcher is shown, and how. */
export interface Caught extends Spot {
  /** How far it is tipped forward over the lip, in radians. */
  tilt: number;
  /** How much light it still gets, from 1 in the open to nearly none at the bottom of a throat. */
  light: number;
  /** The pocket it is going down, or −1 if it is going down behind the catcher. */
  chucker: number;
}

/**
 * How a medal that has just come over the lip at the catcher is shown, or
 * null for one that is shown where the engine has it: a ball, a medal that is
 * not on its way down, one that has gone out of sight, and one that came over
 * the lip beside the catcher.
 *
 * A medal that came through a pocket starts with its middle on the lip's
 * edge, where it was the moment before. It slides out over the mouth, to the
 * middle of it, and goes down the throat level, losing the light as it goes.
 * One that came over between the mouths, or at one without fitting it, tips
 * over the edge and goes down behind the catcher, on its edge. It is exact
 * about which is which in the step the medal comes over, and as near after
 * that as `droppedThrough` is.
 */
export function caught(medal: Medal, time: number): Caught | null {
  if (medal.ball || medal.level !== 0 || medal.sinceDrop < 0) return null;
  const front = pusherFront(time);
  const chucker = droppedThrough(medal, CATCHER.sink);
  if (chucker >= 0) {
    const t = medal.sinceDrop / CATCHER.sink;
    const slide = ease(Math.min(1, t / 0.4));
    const fall = Math.max(0, (t - 0.2) / 0.8);
    const mouth = mouthSpot(chucker, time);
    const top = P + T / 2;
    return {
      x: medal.x + (mouth.x - medal.x) * slide,
      height: top - (top - (CATCHER.throat - T)) * fall * fall,
      depth: front + (mouth.depth - front) * slide,
      tilt: 0.18 * Math.sin(Math.PI * Math.min(1, t / 0.5)),
      light: 1 - 0.85 * fall,
      chucker,
    };
  }
  // Only a medal that is wholly behind the catcher goes down behind it: one that hangs past its end is seen beside it, and falls as the engine has it.
  if (medal.sinceDrop >= CHUCKERS.drop || medal.x - MEDAL_RADIUS < CATCHER.from || medal.x + MEDAL_RADIUS > CATCHER.to) return null;
  const t = medal.sinceDrop / CHUCKERS.drop;
  return {
    x: medal.x,
    height: T / 2 + P * (1 - t * t),
    depth: front + 0.3,
    tilt: 1.3 * ease(Math.min(1, t * 2.5)),
    light: 1,
    chucker: -1,
  };
}

/**
 * Where a mouth is on the drawing at `time`: the middle of its opening, and
 * how wide and how tall the opening is there, in pixels of the drawing. A
 * round mouth in a level deck is seen as an oval.
 */
export function mouthOnDrawing(chucker: number, time: number): { x: number; y: number; wide: number; tall: number } {
  const spot = mouthSpot(chucker, time);
  const at = project(spot.x, spot.height + CATCHER.rim.high, spot.depth);
  const wide = CHUCKERS.radius * 2 * at.scale;
  return { x: at.x, y: at.y, wide, tall: wide * at.tilt };
}
