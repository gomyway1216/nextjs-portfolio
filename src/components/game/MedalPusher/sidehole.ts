/**
 * The side holes at the front corners of the lower table, as things in the
 * cabinet: where each one's mouth is, the chute under it, the ball rail
 * across it and the cheek that parts it from the tray, and where a medal that
 * has gone down one, or a prize that has crossed one, is at this moment. The
 * engine has the rule (`FIELD.sideReach` and `frontPays`): a medal that goes
 * over the front edge within the holes' reach of either side is lost. This
 * file says what that looks like, so that the two renderers and the
 * instruction plate draw the same hole in the same place. It decides nothing.
 *
 * A side hole is the one that runs down the open side of the table, turned
 * round the corner: an L, down the side from where the wall stops and along
 * the front edge as far as the tray. Under the front edge it is a dark mouth
 * with a chute in it that falls away from the table, and the edge over it is
 * lit red as the open side's is. The tray is the middle of the front edge and
 * no more, between two cheeks.
 *
 * Across each mouth, beyond a medal's reach from the edge, lies a ball rail,
 * as a real pusher has along its front: bars that lean toward the tray. A
 * medal tips over the edge and goes down between the edge and the first bar.
 * A ball or a jewel is too big to: it comes down on the bars and rolls along
 * them into the tray, which is why the engine collects a prize wherever it
 * goes over.
 */

import { FIELD, MEDAL_RADIUS, frontPays } from './engine';

const W = FIELD.width;
const D = FIELD.depth;

export const SIDE_HOLE = {
  /** How far along the front edge a mouth runs from its side of the table: the engine's own number. */
  reach: FIELD.sideReach,
  /** How far under the front edge the chute in the mouth starts, and how much lower it is for each unit out from the edge. */
  drop: 4,
  slope: 0.5,
  /** How far out from the front edge the chute, the cheeks and the rails' ends are built: past the foot of the picture. */
  past: 14,
  /**
   * The ball rail: how far out from the front edge each of its two bars lies,
   * how thick a bar is, how high its top is at the side of the table, and how
   * much lower at the cheek, where it ends over the tray. The first bar is
   * further out than half a medal, so a medal whose middle has passed the
   * edge has nothing under its nose; the two are closer together than a ball
   * or a jewel is across, which rides between them.
   */
  rails: [4.2, 7.2] as readonly [number, number],
  bar: 0.4,
  top: -0.3,
  lean: 0.8,
  /** The cheek between a mouth and the tray, whose top is level with the table: half its width. */
  cheek: 0.7,
  /**
   * The arrows on the chute, which point the way a lost medal goes: how far
   * in from the side each one is, how far out from the edge its barbs start
   * and its point is, and how far it is from the end of one barb to the end of
   * the other.
   */
  marks: [5, 12.5] as readonly number[],
  near: 0.9,
  far: 3,
  span: 5,
} as const;

/**
 * How a medal that has gone over the edge of a mouth moves. Its middle is
 * past the edge, so it tips over it: it hangs on the edge, its nose going
 * down at `turn` radians a second until it is tipped `tip`, while it is
 * carried on at `forward` units a second, the pace the pile is pushed at, and
 * slips off faster and faster (`slip`, in units a second each second, twice
 * over). So its nose goes down between the edge and the first bar of the ball
 * rail and never meets the bar, and its tail never goes through the table.
 * When its tail is off the edge it drops as it is going, pulled down as a
 * medal that goes into the tray is (`gravity`, which is `EXIT`'s in
 * render.ts), comes down on the chute, lies along it within `settle` seconds
 * and is away down it under the bars, gathering `slide` units a second each
 * second. One that went over beside the cheek has part of itself over the
 * cheek, and comes off it into the mouth in `aside` seconds.
 */
export const SINK = { forward: 7, slip: 60, turn: 6.5, tip: 1, gravity: 190, settle: 0.1, slide: 80, aside: 0.15 } as const;

/** Seconds from the moment a medal's middle goes over the edge of a mouth until its tail is off the edge: it has slipped half its own width. */
export const SUNK_OFF = (-SINK.forward + Math.sqrt(SINK.forward ** 2 + 4 * SINK.slip * MEDAL_RADIUS)) / (2 * SINK.slip);

/**
 * How a prize crosses a mouth: seconds to come down off the edge onto the
 * bars, how fast it gathers pace along them toward the tray, in units a
 * second each second, how fast it falls once it is past the cheek, and
 * seconds from there until it is out of sight. With motion reduced it does
 * not roll along the bars: it crosses them at `over` units a second and is
 * gone the way it was going.
 */
export const RAIL_RIDE = { settle: 0.16, pace: 95, gravity: 190, gone: 0.3, over: 15 } as const;

/** Which side hole a medal that goes over the front edge at `x` goes down: −1 for the left one, 1 for the right, and 0 over the tray, where it is won. */
export const holeAt = (x: number): -1 | 0 | 1 => (frontPays(x) ? 0 : x < W / 2 ? -1 : 1);

/** How far in from its own side of the table a place across the field is. */
export const fromSide = (x: number, side: number): number => (side < 0 ? x : W - x);
/** The place across the field that is `across` in from a side of the table. */
export const acrossAt = (across: number, side: number): number => (side < 0 ? across : W - across);

/** How high the chute in a mouth is, `out` from the front edge: under the table, so less than nothing. */
export const holeFloor = (out: number): number => -(SIDE_HOLE.drop + Math.max(0, out) * SIDE_HOLE.slope);

/** How high the top of the ball rail is, `across` in from the side: it leans toward the tray, which is where a prize on it rolls. */
export const railTop = (across: number): number => SIDE_HOLE.top - SIDE_HOLE.lean * Math.min(1, Math.max(0, across / SIDE_HOLE.reach));

/** How far out from the front edge the middle of the rail is, which is where a prize on it rides. */
export const RAIL_MIDDLE = (SIDE_HOLE.rails[0] + SIDE_HOLE.rails[1]) / 2;

/** How high above the bars' tops the middle of something round rides, `radius` from its middle to its rim: it sits down between the two. */
export const railSeat = (radius: number): number => Math.sqrt(Math.max(0, radius * radius - ((SIDE_HOLE.rails[1] - SIDE_HOLE.rails[0]) / 2) ** 2));

/** How the chute lies, in radians: a medal that has come down on it lies along it. */
export const HOLE_LEAN = Math.atan(SIDE_HOLE.slope);

export interface Sunk {
  x: number;
  /** The height of the medal's middle. */
  height: number;
  depth: number;
  /** How far it has tipped forward, nose down. */
  tilt: number;
}

/**
 * Where a medal that went over the front edge at a mouth is, `age` seconds
 * on, last seen on the table at (x, y), on `side` of it: it tips over the
 * edge, hanging on it, and slips off nose first into the mouth, comes down on
 * the chute, and is away down it under the ball rail. `thick` is how thick a
 * medal is.
 */
export function sinking(x: number, y: number, side: number, age: number, thick: number): Sunk {
  const across = fromSide(x, side);
  // The whole of it goes down the mouth: off the cheek it straddled, if it went over beside one.
  const within = Math.min(across, SIDE_HOLE.reach - SIDE_HOLE.cheek - MEDAL_RADIUS);
  const moved = Math.min(1, age / SINK.aside);
  const at = acrossAt(across + (within - across) * moved * moved * (3 - 2 * moved), side);
  const edge = Math.max(D, y);
  if (age < SUNK_OFF) {
    // On the edge: its middle is this far past it, along the medal's own slope, and its under side lies on the edge.
    const tilt = Math.min(SINK.tip, age * SINK.turn);
    const out = SINK.forward * age + SINK.slip * age * age;
    return { x: at, height: (thick / 2) * Math.cos(tilt) - out * Math.sin(tilt), depth: edge + out * Math.cos(tilt) + (thick / 2) * Math.sin(tilt), tilt };
  }
  // Off the edge: on the way it was going, and down, until its nose is on the chute; then lying along the chute, and away.
  const since = age - SUNK_OFF;
  const pace = SINK.forward + 2 * SINK.slip * SUNK_OFF;
  const settled = Math.min(1, since / SINK.settle);
  const tilt = SINK.tip + (HOLE_LEAN - SINK.tip) * settled * settled * (3 - 2 * settled);
  const depth = edge + (MEDAL_RADIUS + pace * since) * Math.cos(SINK.tip) + (thick / 2) * Math.sin(SINK.tip) + (SINK.slide * since * since) / 2;
  const free = (thick / 2) * Math.cos(SINK.tip) - (MEDAL_RADIUS + pace * since) * Math.sin(SINK.tip) - (SINK.gravity * since * since) / 2;
  // Its nose is its lowest point, and that is what the chute holds up.
  const lying = holeFloor(depth - D + MEDAL_RADIUS * Math.cos(tilt)) + MEDAL_RADIUS * Math.sin(tilt) + thick / 2 + 0.05;
  return { x: at, height: Math.max(free, lying), depth, tilt };
}

export interface Railed {
  x: number;
  /** The height of its middle. */
  height: number;
  depth: number;
  /** How far it has rolled, in units: what turns it. */
  rolled: number;
  /** Whether it is past the cheek and falling into the tray. */
  over: boolean;
}

/** How far along the bars a prize `across` in from the side has to roll before the whole of it is over the tray. */
const toTray = (across: number, radius: number): number => Math.max(0, SIDE_HOLE.reach - across) + SIDE_HOLE.cheek + radius;

/** It begins to roll along the bars when it is half way down on to them. */
const ROLLS_FROM = RAIL_RIDE.settle / 2;

/** Seconds a prize that went over a mouth `across` in from the side is still to be drawn for: on to the bars, along them and down into the tray. With motion reduced, across them and gone. */
export function railTime(across: number, radius: number, calm = false): number {
  if (calm) return RAIL_RIDE.settle + RAIL_RIDE.gone;
  return ROLLS_FROM + Math.sqrt((2 * toTray(across, radius)) / RAIL_RIDE.pace) + RAIL_RIDE.gone;
}

/**
 * Where a ball or a jewel that went over the front edge at a mouth is, `age`
 * seconds on. It was last seen on the table at (x, y), on `side` of it, and
 * it is `radius` from its middle to its rim. It comes down off the edge on to
 * the rail, between its two bars, rolls along them toward the tray, faster
 * and faster, and past the cheek it drops in. With motion reduced (`calm`) it
 * crosses the bars the way it was going and is gone.
 */
export function railed(x: number, y: number, side: number, age: number, radius: number, calm = false): Railed {
  const across = fromSide(x, side);
  const from = Math.max(D, y);
  const settled = Math.min(1, age / RAIL_RIDE.settle);
  // Off the edge and on to the bars: forward, and down from standing on the table to sitting between them.
  const eased = settled * settled * (3 - 2 * settled);
  const seated = (at: number): number => radius + (railTop(at) + railSeat(radius) - radius) * eased;
  if (calm) return { x, height: seated(across), depth: from + RAIL_RIDE.over * age, rolled: RAIL_RIDE.over * age, over: false };
  const depth = from + (D + RAIL_MIDDLE - from) * eased;
  const along = Math.max(0, age - ROLLS_FROM);
  const rolled = (RAIL_RIDE.pace * along * along) / 2;
  const reach = toTray(across, radius);
  const at = acrossAt(across + rolled, side);
  if (rolled < reach) return { x: at, height: seated(across + rolled), depth, rolled, over: false };
  // Past the cheek there is nothing under it but the tray.
  const since = along - Math.sqrt((2 * reach) / RAIL_RIDE.pace);
  return { x: at, height: railTop(SIDE_HOLE.reach) + railSeat(radius) - (RAIL_RIDE.gravity * since * since) / 2, depth, rolled, over: true };
}
