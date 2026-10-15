/**
 * The START plate, as a thing in the cabinet: the board hung on the front of
 * the pusher, from just under its lip, that the three START holes are cut
 * in. It is as wide as the pusher, leans down toward the player to a foot
 * clear of the medals on the lower table, and rides out and back with the
 * pusher (`PLATE` in engine.ts has its measures). Nothing stands up from it:
 * the frames round the holes, their flaps, their lamps and the two START
 * signs are all let into its top, flush, so that whatever slides down it
 * slides over them.
 *
 * Everything that goes over the lip comes down on it, and the machine has
 * already settled where each thing comes down and how long it takes (a
 * `FallingMedal` from the `slide` or the `spill`, `downThePlate` and `spill`
 * in engine.ts). This file shows the way there and decides nothing: each way
 * ends exactly where the machine has the thing come down, and nothing on it
 * is ever inside the plate or the pusher.
 *
 * - A medal tips off the lip on to the plate: it slides over the edge until
 *   its middle is past it, tips forward about the edge until its nose is on
 *   the plate, slides on with its tail on the edge until the tail leaves it,
 *   and lies along the plate.
 * - A medal whose middle came over in line with a hole, within the play a
 *   medal has in it (`CHECKERS.halfWidth`), slides down over the hole and
 *   drops through it, lying along the plate as it goes, out of the light;
 *   once it is clear of the board it falls straight down, comes down on its
 *   lower edge and lies down flat under the plate, at the foot of the
 *   pusher's face (`PLATE.through`).
 * - A medal whose middle came over the hole's opening but not in line with it
 *   has one side of it over the hole's frame: it stops there, rocks over the
 *   frame's edge toward the hole and back, the more and the longer the nearer
 *   it was to fitting, and slides on.
 * - Every other medal slides down the plate, past the holes, and off its foot:
 *   its nose comes down on the lower table, its tail slides down the plate to
 *   the foot's edge and down the plumb end of the foot, and it lies flat just
 *   in front of the foot.
 * - A prize ball is too big for a hole and rolls down over them, over the
 *   foot's edge and down against the foot. A jewel tumbles down the plate
 *   end over end, over the holes, and lands on its point against the foot.
 * - A tower that goes over the lip comes down on the plate: if it went over
 *   at a hole its medals go down that hole one after another, and otherwise
 *   they are thrown out over the plate and come down past its foot.
 *
 * Two things about the holes change. One of them is lit gold at a time, the
 * lucky lamp, which steps along with each stroke of the pusher (`luckySlot`
 * in engine.ts). And during chance time their flaps are open: every hole is
 * lit, and each takes medals at a wider width (`CHECKERS.wingWidth`). A flap
 * lies flush along each side of a hole's opening, inside its frame, and opens
 * by swinging down under the plate, which leaves the opening that much wider.
 *
 * Everything here is in the cabinet's own measures: across the field, up
 * from the lower table, and out from the back wall.
 */

import type { Spot } from './arms';
import {
  CHECKERS,
  FIELD,
  MEDAL_RADIUS,
  MEDAL_SLIDE,
  MEDAL_THICKNESS,
  PLATE,
  PUSHER,
  ROLL_DOWN,
  START_RIDE,
  TEETER,
  clearOfFoot,
  luckySlot,
  pusherFront,
  spillHeight,
  type FallingMedal,
} from './engine';
import { project } from './view';

/** How far it is from one hole to the next. */
const PITCH = CHECKERS.positions[1] - CHECKERS.positions[0];
const P = PUSHER.height;
const T = MEDAL_THICKNESS;
const R = MEDAL_RADIUS;
const D = R * 2;
const LEAN = PLATE.lean;
const SIN = Math.sin(LEAN);
const COS = Math.cos(LEAN);
/** How far the plate's top is below the pusher's top at the lip. */
const STEP = P - PLATE.deck;

export const CATCHER = {
  /** Where the plate begins and ends across the field: the whole width of the pusher. */
  from: 0,
  to: FIELD.width,
  /** How far it is from one hole to the next. */
  tile: PITCH,
  /** How high its top edge is, at the lip: just under the edge of the pusher's top. */
  deck: PLATE.deck,
  /** How far down the plate from the lip a hole's opening begins. */
  back: PLATE.hole.from,
  /** The frame round a hole, let into the plate: how far out from the opening it reaches. It stands up from the plate not at all. */
  rim: { wide: 0.6 },
  /** The plate's foot: how far out from the lip, and how high above the lower table the edge of its top is. */
  foot: { out: PLATE.reach, height: PLATE.foot },
  /** How thick the board is, square to its top. */
  thick: PLATE.thick,
  /**
   * Seconds a medal the lip's rule counted is shown from the lip down through
   * its hole to the lower table: the machine's own number (`START_RIDE`).
   * It slides down to the hole for `ride` of that, drops through the hole
   * until `drop`, falls to the table until `land`, and lies down.
   */
  sink: START_RIDE,
  ride: 0.3,
  drop: 0.55,
  land: 0.7,
  /** How much light a medal that has gone down a hole still gets under the plate. */
  shade: 0.5,
  /** Seconds a prize ball or a jewel takes from the lip down the plate and off its foot: the machine's own number (`ROLL_DOWN`). */
  slide: ROLL_DOWN,
} as const;

/** The plane the plate's top lies in: how far it leans from level, in radians, down toward the player, and how long it is from the lip to the foot. */
export const SLOPE = { angle: LEAN, long: PLATE.long } as const;

/**
 * A START hole: how long its opening is, down the plate, which is a little
 * more than a medal is across, so that one sliding down over it drops in; the
 * lamp let into the lower bar of its frame, by how far below the opening its
 * middle is and how big it is; and its flaps, which lie along the sides of
 * the opening: how far a flap hangs down under the plate when it is open.
 */
export const START_SLOT = {
  long: PLATE.hole.long,
  lamp: { out: 0.55, radius: 0.45 },
  wing: { hang: 1.6 },
} as const;

/** How far down the plate the middle of a hole is. */
export const HOLE_MIDDLE = CATCHER.back + START_SLOT.long / 2;

/** Half the width of a hole's opening: a medal's radius and the rule's width, which is wider while the flaps are open. */
export const slotHalf = (wings = false): number => MEDAL_RADIUS + (wings ? CHECKERS.wingWidth : CHECKERS.halfWidth);

/**
 * The hole the lucky lamp is shown on at `time`, from the left.
 *
 * The lamp itself steps as the pusher comes to the back of its stroke, by
 * the machine's clock, and a medal's hole was lit or was not as the medal
 * came over the lip (`luckySlot` in engine.ts; the session keeps that with
 * the medal). But the medal drops into its hole a ride later, and medals come
 * over the lip late in the pusher's way back: for many of them the lamp
 * steps while they slide. So the light is shown where the lamp stood a ride
 * ago. It is then on a medal's hole as the medal drops exactly when it was as
 * the medal came over, for every medal, and it is seen to step a ride after
 * the pusher turns. Where nothing is shown moving (`still`) a medal is taken
 * as it comes over, and the light is where the lamp is.
 */
export const lampShown = (time: number, still = false): number => luckySlot(Math.max(0, time - (still ? 0 : START_RIDE)));

/** Which holes are lit gold at `time`, from the left: the one the lucky lamp is shown on (`lampShown`), or all of them while the flaps are open. */
export const litSlots = (time: number, wings = false, still = false): boolean[] => CHECKERS.positions.map((_x, slot) => wings || slot === lampShown(time, still));

/** A point of the plate at `time`: `x` across the field, `down` the plate from the lip, and `lift` clear of its top, square to it (under it for less than nothing). */
export function slopeSpot(x: number, down: number, time: number, lift = 0): Spot {
  return { x, height: PLATE.deck - down * SIN + lift * COS, depth: pusherFront(time) + down * COS + lift * SIN };
}

/** Where a point `down` the plate and `lift` clear of it is, out from the pusher's face and up from the lower table. */
const onPlate = (down: number, lift: number): { out: number; height: number } => ({ out: down * COS + lift * SIN, height: PLATE.deck - down * SIN + lift * COS });

/** The corners of the plate's top at `time`: its edge along the lip, from the left, and then its foot, from the right. */
export function plateCorners(time: number): Spot[] {
  const { from, to } = CATCHER;
  return [slopeSpot(from, 0, time), slopeSpot(to, 0, time), slopeSpot(to, SLOPE.long, time), slopeSpot(from, SLOPE.long, time)];
}

/** The middle of a hole's opening at `time`: across the field where the engine has it, on the plate. */
export function mouthSpot(chucker: number, time: number): Spot {
  if (!Number.isInteger(chucker) || chucker < 0 || chucker >= CHECKERS.positions.length) throw new Error('there is no such chucker');
  return slopeSpot(CHECKERS.positions[chucker], HOLE_MIDDLE, time);
}

/** The middles of all the holes at `time`, from the left. */
export const mouthSpots = (time: number): Spot[] => CHECKERS.positions.map((_x, chucker) => mouthSpot(chucker, time));

/**
 * The corners of a hole at `time`: of its opening in the plate, or of
 * something round the opening or inside it — `grow` further out all round,
 * and `lift` clear of the plate (under it for less than nothing). Its upper
 * edge first, from the left, and then its lower, from the right. With
 * `wings` it is as wide as it is while the flaps are open.
 */
export function slotCorners(chucker: number, time: number, wings = false, grow = 0, lift = 0): Spot[] {
  const { x } = mouthSpot(chucker, time);
  const half = slotHalf(wings) + grow;
  const upper = CATCHER.back - grow;
  const lower = CATCHER.back + START_SLOT.long + grow;
  return [slopeSpot(x - half, upper, time, lift), slopeSpot(x + half, upper, time, lift), slopeSpot(x + half, lower, time, lift), slopeSpot(x - half, lower, time, lift)];
}

/**
 * The corners of one of a hole's flaps at `time`: the left one (`side` −1)
 * or the right (1). Shut, it lies flush in the plate along that side of the
 * opening, from the edge of the narrower opening out to the edge of the wider
 * one, the length of the opening. Open, which `wings` says, it has swung down
 * on its hinge, which is its outer edge under the board, and hangs square
 * under the plate.
 * Its hinge end first, at the upper end of the opening, then its free edge
 * there, then its free edge and its hinge at the lower end.
 */
export function wingCorners(chucker: number, side: number, time: number, wings = false): Spot[] {
  const { x } = mouthSpot(chucker, time);
  const hinge = x + side * slotHalf(true);
  const upper = CATCHER.back;
  const lower = CATCHER.back + START_SLOT.long;
  if (wings) {
    const hang = -START_SLOT.wing.hang;
    const under = -CATCHER.thick;
    return [slopeSpot(hinge, upper, time, under), slopeSpot(hinge, upper, time, hang), slopeSpot(hinge, lower, time, hang), slopeSpot(hinge, lower, time, under)];
  }
  const free = x + side * slotHalf(false);
  return [slopeSpot(hinge, upper, time), slopeSpot(free, upper, time), slopeSpot(free, lower, time), slopeSpot(hinge, lower, time)];
}

/** Where the lamp of a hole is at `time`: let into the lower bar of its frame, in the middle. */
export function lampSpot(chucker: number, time: number): Spot {
  const { x } = mouthSpot(chucker, time);
  return slopeSpot(x, CATCHER.back + START_SLOT.long + START_SLOT.lamp.out, time);
}

/**
 * The two START signs on the plate, one to either side of the holes: each
 * reaches from `margin` in from the plate's end to `margin` short of the
 * frame of the outer hole on its side, as wide as that is while the flaps are
 * open, and from `margin` down from the lip to `margin` short of the foot.
 */
export const SIGNS = { margin: 0.8 } as const;

/** The span across the field of a START sign: the left one (`side` −1) or the right (1). */
export function signSpan(side: number): { from: number; to: number } {
  const inner = slotHalf(true) + CATCHER.rim.wide + SIGNS.margin;
  return side < 0
    ? { from: CATCHER.from + SIGNS.margin, to: CHECKERS.positions[0] - inner }
    : { from: CHECKERS.positions[CHECKERS.positions.length - 1] + inner, to: CATCHER.to - SIGNS.margin };
}

/** How wide a START sign is across the field, and how long down the plate. */
export const SIGN = { wide: signSpan(-1).to - signSpan(-1).from, long: SLOPE.long - SIGNS.margin * 2 } as const;

/** A point of a START sign at `time`: `across` from its left end and `down` from its upper edge, both in field units, and `lift` clear of the plate. */
export function signSpot(side: number, across: number, down: number, time: number, lift = 0): Spot {
  return slopeSpot(signSpan(side).from + across, SIGNS.margin + down, time, lift);
}

/**
 * Whether something `radius` across lying on the lower table at (x, depth)
 * is under the plate at `time`, wholly or in part. The plate is as wide as
 * the field, so it is only how far out it is that tells.
 */
export function underCatcher(_x: number, depth: number, radius: number, time: number): boolean {
  return depth - radius < pusherFront(time) + CATCHER.foot.out;
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Where a medal on its way down the plate is shown, and how. */
export interface Caught extends Spot {
  /** How far it is tipped out of level, in radians. */
  tilt: number;
  /** Which way it is tipped: 0 is forward, toward the player, as the plate leans, and a quarter turn is to the left. */
  heading: number;
  /** How much light it still gets, from 1 in the open to `CATCHER.shade` under the plate. */
  light: number;
  /** The hole it is on its way into, or −1 if it is on its way into none. */
  chucker: number;
  /** The hole whose frame it rocks on without fitting, or −1. */
  near: number;
  /**
   * Where on its way it is: on the `plate`, sliding down it or thrown over
   * it; rocking on a hole's `rim`; going down into a hole, the `slot`, with
   * some of it under the plate; or `off` the plate's foot, on the lower table.
   */
  leg: 'plate' | 'rim' | 'slot' | 'off';
}

type Pose = Pick<Caught, 'x' | 'height' | 'depth' | 'tilt' | 'heading'>;

/** The middle of a medal, out from the pusher's face and up from the lower table, and how far it is tipped forward. */
interface Side {
  out: number;
  height: number;
  tilt: number;
}

/** The middle of a medal whose underside has its middle at (out, height), tipped forward by `tilt`: half its thickness up from that, square to its face. */
const middleOver = (out: number, height: number, tilt: number): Side => ({ out: out + (T / 2) * Math.sin(tilt), height: height + (T / 2) * Math.cos(tilt), tilt });

// ── The way a medal goes down the plate ─────────────────────────────────────

/** How far past the lip's edge, along its face, a medal's middle is when its nose first comes down on the plate. */
const TIPPED = 0.6;
/** How far a medal goes along its way as its tail slides off the lip's edge and down the pusher's face on to the plate. */
const SETTLE = 0.4;

/** How far forward a medal leans when its underside rests on the lip's edge `past` behind its middle and its nose is on the plate. */
const restingTilt = (past: number): number => LEAN + Math.asin((STEP * COS) / (past + R));

/** Where a medal going over the lip is when its middle is `past` beyond the lip's edge, along its underside, which rests on the edge. */
function overTheLip(past: number): Side {
  const tilt = past < TIPPED ? restingTilt(TIPPED) * ease(past / TIPPED) : restingTilt(past);
  return middleOver(past * Math.cos(tilt), P - past * Math.sin(tilt), tilt);
}

/** How far down the plate the middle of a medal is once it lies on it, having come off the lip: its tail is on the plate's upper edge. */
const LAID = R;

/**
 * Where a medal is as its tail comes off the lip's edge, `share` of the way:
 * its tail slides down the pusher's face, from the lip's edge to the plate's
 * upper edge just under it, and its nose slides down the plate, so that it
 * leans less and less, until it lies along the plate.
 */
function settling(share: number): Side {
  const tail = P - STEP * ease(share);
  const tilt = LEAN + Math.asin(((tail - PLATE.deck) * COS) / D);
  return middleOver(R * Math.cos(tilt), tail - R * Math.sin(tilt), tilt);
}

/** The slope distance down the plate's plane at which the nose of a medal lying along it reaches the lower table, past the foot: the plane goes on under the foot. */
const NOSE_DOWN = PLATE.deck / SIN - R;
/** How far a medal leans when its tail is on the edge of the foot and its nose on the table. */
const ON_FOOT = Math.asin(PLATE.foot / D);

/**
 * Where a flat medal that is going down the plate and off its foot is, when
 * the middle of its underside is `out` from the pusher's face. It lies along
 * the plate while all of it is on it or past its foot on the line of the
 * plate; once its nose is on the lower table, its tail slides down the plate
 * to the foot's edge, so that it leans less and less; then its tail comes down
 * the plumb end of the foot, which it keeps to, and it lies flat on the
 * table, its middle `PLATE.reach + R` out. No part of it is ever inside the
 * plate.
 */
export function ridingAt(out: number): Side {
  if (out <= NOSE_DOWN * COS) return middleOver(out, PLATE.deck - (out / COS) * SIN, LEAN);
  // Its nose on the table and its tail on the plate, `along` down it.
  const underside = (along: number) => {
    const tail = { out: along * COS, height: PLATE.deck - along * SIN };
    const nose = tail.out + Math.sqrt(Math.max(0, D * D - tail.height * tail.height));
    return { out: (tail.out + nose) / 2, height: tail.height / 2, tilt: Math.asin(Math.min(1, tail.height / D)) };
  };
  if (out <= underside(SLOPE.long).out) {
    let lo = NOSE_DOWN - R;
    let hi = SLOPE.long;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (underside(mid).out < out) lo = mid;
      else hi = mid;
    }
    const at = underside((lo + hi) / 2);
    return middleOver(at.out, at.height, at.tilt);
  }
  // Its tail coming down the plumb end of the foot.
  if (out < CATCHER.foot.out + R) {
    const tilt = Math.min(ON_FOOT, Math.acos(clamp01((out - CATCHER.foot.out) / R)));
    return middleOver(CATCHER.foot.out + R * Math.cos(tilt), R * Math.sin(tilt), tilt);
  }
  return middleOver(out, 0, 0);
}

/** The measures of the way a medal goes from the lip to the lower table: how far it has gone when it lies on the plate, when its middle is over a hole's, and when it is down. */
const WAY = (() => {
  const laid = R + SETTLE;
  const laidOut = LAID * COS;
  return { laid, laidOut, hole: laid + (HOLE_MIDDLE - LAID) * COS, end: laid + (CATCHER.foot.out + R - laidOut) };
})();

/**
 * Where a medal is that has gone `way` along its way from the lip: over the
 * lip's edge (`overTheLip`), dropping on to the plate (`settling`), and down
 * the plate and off its foot (`ridingAt`), which it measures by how far the
 * middle of its underside is out from the face.
 */
function along(way: number): Side {
  if (way <= R) return overTheLip(way);
  if (way <= WAY.laid) return settling((way - R) / SETTLE);
  return ridingAt(WAY.laidOut + (way - WAY.laid));
}

/** How far along its way a medal sliding down the plate has gone, `u` of the time it takes: slowly off the lip, quickly down the plate, slowing on the table. */
const pace = (u: number): number => WAY.end * ease(clamp01(u));

/** The `u` at which `pace(u)` is `way`. */
function paceAt(way: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pace(mid) < way) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The share of `MEDAL_SLIDE` at which a medal sliding down the plate is level with the middle of the holes. */
export const AT_THE_HOLES = paceAt(WAY.hole);

/** Seconds after a near miss came over the lip at which it reaches the hole's frame and starts to rock. */
export const RIM_REACHED = MEDAL_SLIDE * AT_THE_HOLES;

const shown = (side: Side, x: number, front: number): Pose => ({ x, height: side.height, depth: front + side.out, tilt: side.tilt, heading: 0 });

/**
 * The way a medal that went down a hole falls under the plate, `u` of the way
 * from lying along the plate over the hole's middle (0) to lying flat on the
 * lower table (1): it drops square to the plate through the opening until it
 * is clear of the board's underside, by `CATCHER.drop`; falls straight down
 * until its lower edge is on the table, by `CATCHER.land`; and lies down,
 * its edge sliding out along the table and its middle coming straight down,
 * to lie `PLATE.through` out from the face. Shares are of the whole way from
 * the lip, so `u` starts at `CATCHER.ride`.
 */
function throughTheHole(u: number): Side & { light: number } {
  const { ride, drop, land, shade } = CATCHER;
  const clear = -(PLATE.thick + T / 2 + 0.05);
  if (u < drop) {
    const v = ease((u - ride) / (drop - ride));
    const at = onPlate(HOLE_MIDDLE, T / 2 + (clear - T / 2) * v);
    return { ...at, tilt: LEAN, light: 1 - (1 - shade) * v };
  }
  const under = onPlate(HOLE_MIDDLE, clear);
  const touching = R * SIN + (T / 2) * COS;
  if (u < land) {
    const v = (u - drop) / (land - drop);
    return { out: under.out, height: under.height - (under.height - touching) * v * v, tilt: LEAN, light: shade };
  }
  const tilt = LEAN * (1 - ease((u - land) / (1 - land)));
  return { out: under.out, height: R * Math.sin(tilt) + (T / 2) * Math.cos(tilt), tilt, light: shade };
}

/**
 * The way something that came over the lip is going down the plate, as the
 * machine settled it there (`downThePlate` in engine.ts), read off what is in
 * the air: a ball or a jewel `roll`s; a medal the lip's rule counted goes
 * down a `hole`, which is where the machine has it come down, under the
 * plate; one that was a near miss rocks on a hole's `rim`, which is what its
 * longer way down says, and how much longer says how near it was (from 0, a
 * medal with its middle only just over the opening, to 1, one that all but
 * fitted); and any other just `slide`s down and off. Null for anything else.
 */
export type PlateWay = { kind: 'roll' } | { kind: 'slide' } | { kind: 'hole'; hole: number } | { kind: 'rim'; hole: number; nearness: number; hang: number };

/** The hole nearest to `x` across the field. */
const nearestHole = (x: number): number => {
  let best = 0;
  CHECKERS.positions.forEach((at, hole) => {
    if (Math.abs(x - at) < Math.abs(x - CHECKERS.positions[best])) best = hole;
  });
  return best;
};

/** How far out from the pusher's face a thing on its way down comes down, with the face where it will be then: the machine's own place for it. */
const landingOut = (medal: FallingMedal, time: number): number => medal.y - pusherFront(time + medal.remaining);

export function plateWay(medal: FallingMedal, time: number): PlateWay | null {
  if (medal.source !== 'slide') return null;
  if (medal.ball || medal.jewel) return { kind: 'roll' };
  if (landingOut(medal, time) < CATCHER.foot.out) return { kind: 'hole', hole: nearestHole(medal.x) };
  const hang = medal.duration - MEDAL_SLIDE;
  if (hang <= 1e-9) return { kind: 'slide' };
  return { kind: 'rim', hole: nearestHole(medal.x), nearness: Math.sqrt(clamp01((hang - TEETER.least) / (TEETER.most - TEETER.least))), hang };
}

/**
 * How near a medal that rocks on a hole's frame was to fitting it: from 0,
 * for one whose middle was only just over the opening, to 1, for one that all
 * but fitted; and 0 for anything else. The nearer it was, the longer it rocks
 * there and the further over.
 */
export function nearness(medal: FallingMedal, time: number): number {
  const way = plateWay(medal, time);
  return way?.kind === 'rim' ? way.nearness : 0;
}

/** How far over a near miss rocks at the most, in radians, and how much it shakes as it makes up its mind. */
const ROCK = { most: 0.45, shake: 0.18 } as const;

/**
 * A medal lying along the plate over the middle of a hole, at `x` across the
 * field, rocked by `rock` over the edge of the opening on the side its middle
 * is off the hole's, toward the hole: it turns about that edge, so the side of
 * it over the opening goes down into the hole and the side over the frame
 * lifts off it.
 */
function rocked(x: number, hole: number, wings: boolean, rock: number, front: number): Pose {
  const centre = CHECKERS.positions[hole];
  const away = Math.sign(x - centre) || 1;
  const edge = centre + away * slotHalf(wings);
  const turn = away * rock;
  // About the edge, in the plate's own terms: across from the edge, and up from the plate's top.
  const across = x - edge;
  const up = T / 2;
  const turnedAcross = across * Math.cos(turn) - up * Math.sin(turn);
  const turnedUp = across * Math.sin(turn) + up * Math.cos(turn);
  const at = onPlate(HOLE_MIDDLE, turnedUp);
  // Leaning with the plate and turned across it, it is tipped by one angle about one level line: these are they.
  return {
    x: edge + turnedAcross,
    height: at.height,
    depth: front + at.out,
    tilt: Math.acos(Math.cos(LEAN) * Math.cos(turn)),
    heading: Math.atan2(Math.sin(turn), Math.sin(LEAN) * Math.cos(turn)),
  };
}

/**
 * How a medal that came over the lip is shown on its way down the plate, or
 * null for anything that is not such a medal (`plateWay`): one the lip's rule
 * counted down its hole, a near miss rocking on a hole's frame on its way,
 * and any other down the plate and off its foot (see the top of this file).
 * With `calm` nothing is seen to rock, and one that went down a hole is shown
 * where it lies under the plate from the moment it came over. `wings` says the
 * flaps are open, as they were when it came over.
 */
export function slidDown(medal: FallingMedal, time: number, calm = false, wings = false): Caught | null {
  const way = plateWay(medal, time);
  if (!way || way.kind === 'roll') return null;
  const front = pusherFront(time);
  const elapsed = medal.duration - medal.remaining;
  const { x } = medal;
  if (way.kind === 'hole') {
    const chucker = way.hole;
    const u = calm ? 1 : clamp01(elapsed / CATCHER.sink);
    if (u < CATCHER.ride) return { ...shown(along(WAY.hole * ease(u / CATCHER.ride)), x, front), light: 1, chucker, near: -1, leg: 'plate' };
    const at = throughTheHole(u);
    return { ...shown(at, x, front), light: at.light, chucker, near: -1, leg: 'slot' };
  }
  /** On its way down without stopping, `way` of it gone. */
  const going = (gone: number, near: number): Caught => {
    const side = along(gone);
    return { ...shown(side, x, front), light: 1, chucker: -1, near, leg: side.out > CATCHER.foot.out ? 'off' : 'plate' };
  };
  if (way.kind === 'slide' || calm) return going(pace(elapsed / medal.duration), -1);
  const { hole, hang } = way;
  if (elapsed < RIM_REACHED) return going(pace(elapsed / MEDAL_SLIDE), hole);
  if (elapsed >= RIM_REACHED + hang) return going(pace((elapsed - hang) / MEDAL_SLIDE), hole);
  // On the frame: it rocks toward the hole and back, the more the nearer it was, and shakes a little as it makes up its mind.
  const u = (elapsed - RIM_REACHED) / hang;
  const swing = Math.sin(Math.PI * u) + ROCK.shake * way.nearness * Math.sin(Math.PI * 7 * u) * (1 - u);
  const rock = ROCK.most * (0.4 + 0.6 * way.nearness) * Math.max(0, swing);
  return { ...rocked(x, hole, wings, rock, front), light: 1, chucker: -1, near: hole, leg: 'rim' };
}

// ── A ball ──────────────────────────────────────────────────────────────────

/**
 * How far a ball of this `radius` turns about the lip's edge before it comes
 * down on the plate: from standing on the pusher at the edge, it rolls over
 * the edge, which it keeps touching, until it touches the plate too, beyond
 * the plate's upper edge.
 */
const lipTurn = (radius: number): number => LEAN + Math.acos(1 - (STEP * COS) / radius);

/**
 * Where the middle of a prize ball of this `radius` that is rolling down the
 * plate is, or null for anything else: a medal, and a ball in the air on
 * its way from the hatch. A ball is too big for a hole. It rolls over the
 * lip's edge until it touches the plate, rolls down the plate over the holes,
 * gathering pace, and at the foot rolls over the foot's edge, against it all
 * the way, and comes down on the lower table in front of the foot, touching
 * it (`clearOfFoot`). That is where the machine has it come down (`ROLL_DOWN`
 * in engine.ts), and from then on it is shown where the machine has it. It is
 * never under the plate, and nothing of it is ever inside it.
 */
export function rolledDown(ball: FallingMedal, radius: number, time: number): Spot | null {
  if (ball.source !== 'slide' || !ball.ball) return null;
  const t = clamp01(1 - ball.remaining / ball.duration);
  const { x } = ball;
  const front = pusherFront(time);
  const over = lipTurn(radius);
  // Where it is on the plate when it first touches it, and from there to the foot.
  const first = { out: radius * Math.sin(over), height: P + radius * Math.cos(over) };
  const start = first.out * COS - (first.height - PLATE.deck) * SIN;
  const lip = 0.12;
  const foot = 0.78;
  if (t < lip) {
    const turned = over * ease(t / lip);
    return { x, height: P + radius * Math.cos(turned), depth: front + radius * Math.sin(turned) };
  }
  if (t < foot) {
    const v = (t - lip) / (foot - lip);
    const down = start + (SLOPE.long - start) * (0.35 * v + 0.65 * v * v);
    return slopeSpot(x, down, time, radius);
  }
  // Over the foot's edge: it turns about the edge, from resting on the plate to standing on the table.
  const v = (t - foot) / (1 - foot);
  const last = Math.atan2(clearOfFoot(radius), radius - PLATE.foot);
  const turned = LEAN + (last - LEAN) * v;
  return { x, height: PLATE.foot + radius * Math.cos(turned), depth: front + CATCHER.foot.out + radius * Math.sin(turned) };
}

// ── A tower ─────────────────────────────────────────────────────────────────

/** How a medal off a tower that is thrown over the plate tumbles in the air: a high one turns right over, a low one rocks; `id` gives each its own. */
const tumbleOf = (rank: number, id: number, t: number): number => (rank > 9 ? Math.PI * ease(t) : 0.4 * Math.sin(Math.PI * t) * (0.5 + ((id * 0.618034) % 1)));

/** The share of a tower medal's way down a hole at which it lies along the plate over the hole, and starts down it. */
const ON_THE_HOLE = 0.5;

/**
 * How a medal off a tower that went over the lip is shown, `t` of the way
 * down, or null for anything else.
 *
 * Where it comes down was settled as the tower went over (`spill` in
 * engine.ts), and that says which way it goes. One that comes down under the
 * plate went down the hole the tower went over at: it comes from where it was
 * in the tower out and down on to the hole, turning to lie along the plate
 * over the hole's middle by half way, and goes down it as a medal down a hole
 * does. One that comes down in front of the foot goes out from the pusher's
 * face evenly all the way, coming down faster and faster as a spilled medal
 * does, thrown out over the plate; where it would be lower than a medal
 * riding down the plate and off its foot (`ridingAt`), it is on the plate
 * instead, sliding down it; and it lies flat where the machine has it.
 * Nothing of either is ever inside the plate. Both are measured from the
 * pusher's face as it moves, since the plate moves with it, and both end
 * where the machine has the medal come down.
 */
export function spilled(medal: FallingMedal, time: number): Caught | null {
  if (medal.source !== 'spill') return null;
  const t = clamp01(1 - medal.remaining / medal.duration);
  const front = pusherFront(time);
  // Out from the face: from the lip as the tower went over, to where it comes down as the face will be then.
  const fromOut = medal.fromY - pusherFront(time - (medal.duration - medal.remaining));
  const toOut = landingOut(medal, time);
  const x = medal.fromX + (medal.x - medal.fromX) * ease(Math.min(1, t / 0.15));
  if (toOut < CATCHER.foot.out) {
    const hole = nearestHole(medal.x);
    if (t >= ON_THE_HOLE) {
      const at = throughTheHole(CATCHER.ride + (1 - CATCHER.ride) * ((t - ON_THE_HOLE) / (1 - ON_THE_HOLE)));
      return { ...shown(at, x, front), light: at.light, chucker: hole, near: -1, leg: 'slot' };
    }
    // From where it was in the tower, out and down on to the hole: the way a medal goes over the lip and down to the
    // hole, lifted at first as high as it was in the tower, and coming down on to that way faster and faster.
    const v = t / ON_THE_HOLE;
    const side = along(WAY.hole * ease(v));
    const lift = (spillHeight(medal.rank, 0) - (P + T / 2)) * (1 - v * v);
    return { x, height: side.height + lift, depth: front + fromOut + side.out, tilt: side.tilt, heading: 0, light: 1, chucker: hole, near: -1, leg: 'plate' };
  }
  const out = fromOut + (toOut - fromOut) * t;
  const arc = spillHeight(medal.rank, t);
  // What holds it up where it would be lower than that: the pusher's top behind the lip, the plate and its foot.
  const riding = out < 0 ? middleOver(out, P, 0) : ridingAt(out);
  // The nearer it is to what holds it up, the more it lies as that has it; tumbling more than that, it is held up as far again as its rim dips.
  const lying = clamp01(1 - (arc - riding.height) / D);
  const landing = clamp01((t - 0.85) / 0.15);
  const tumble = tumbleOf(medal.rank, medal.id, t) * (1 - landing);
  const tilt = tumble + (riding.tilt - tumble) * lying;
  const height = Math.max(arc, riding.height + R * Math.abs(Math.sin(tilt - riding.tilt)));
  return { x, height, depth: front + out + (riding.out - out) * lying, tilt, heading: 0, light: 1, chucker: -1, near: -1, leg: out > CATCHER.foot.out ? 'off' : 'plate' };
}

/**
 * Where a hole is on the drawing at `time`: the middle of its opening, and
 * how wide and how tall the opening is there, in pixels of the drawing. With
 * `wings` it is as wide as it is while the flaps are open.
 */
export function mouthOnDrawing(chucker: number, time: number, wings = false): { x: number; y: number; wide: number; tall: number } {
  const spot = mouthSpot(chucker, time);
  const upper = slopeSpot(spot.x, CATCHER.back, time);
  const lower = slopeSpot(spot.x, CATCHER.back + START_SLOT.long, time);
  const at = project(spot.x, spot.height, spot.depth);
  return { x: at.x, y: at.y, wide: slotHalf(wings) * 2 * at.scale, tall: project(lower.x, lower.height, lower.depth).y - project(upper.x, upper.height, upper.depth).y };
}
