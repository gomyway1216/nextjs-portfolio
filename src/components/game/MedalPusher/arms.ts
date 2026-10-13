/**
 * The ways into the field, as things in the cabinet. For a medal the player
 * feeds: the two feed arms — where each is hung, the slot at its near end,
 * where the far end of its rail is, and where a medal on its way has got to.
 * For what the machine lets go itself: the slot its medals are paid from and
 * the hatch its prize balls come out of, both in the hood over the screen.
 * The engine owns all of it: it keeps where each arm's tip is across the
 * field (`machine.tips`), swings it, and decides when a medal leaves and
 * where everything lands. This file only says where that puts things in the
 * cabinet's own measures — across the field, up from the lower table, and
 * out from the back wall, which is what `project` in view.ts takes — so that
 * whatever draws the machine draws the same arms, straight from the machine
 * and with no easing of its own.
 *
 * An arm is one straight rail. Its near end is hung on a collar at a front
 * corner of the cabinet, by the player's hands, and that end is the slot: a
 * medal is shown to it face on, goes into its mouth edge first, and comes out
 * on the rail. The rail runs away from the player, a little downhill, over
 * the lower table to end over the pusher, in front of the foot of the screen.
 * The collar swivels, and the far end, the tip, is swung across the field to
 * wherever the player aims. The medal rolls the length of the rail on its
 * edge, leaning back in its channel, hops off the tip and comes down on the
 * back of the pusher.
 */

import { ARM_SPEED, ARM_START, FEED, FIELD, MEDAL_RADIUS, ROLL_TIME, armFor, tipOf, type Arm, type FallingMedal } from './engine';
import { HEIGHT, HOUSING } from './view';

// How a tip moves is the engine's business; it is handed on from here so that the arms can be read about in one place.
export { armGoal, armStart, swing } from './engine';

/** A place in the cabinet: across the field, above the lower table, and out from the back wall. */
export interface Spot {
  x: number;
  height: number;
  depth: number;
}

export const ARMS = {
  /**
   * The collar a rail is hung on, which is its slot: this far in from its
   * side, this high, and this far out from the back wall. That is past the
   * front edge of the lower table and above where its sides are open, so
   * the slot is large in the picture and hides nothing that leaves the
   * table.
   */
  collar: { inset: 12.5, height: 45, depth: 112 },
  /** How high a medal is when it leaves a tip: over the tallest tower that can stand on the pusher. */
  tip: 33,
  /**
   * How far out from the back wall a tip is: over the pusher, short of where
   * medals land, so one that leaves it carries on the way it was rolling. It
   * is far enough out that, from the player's seat, neither a rail nor a
   * medal at its tip is ever in front of the screen or the lamps under it.
   */
  depth: 22,
  /** A new machine's arms each point this far to their own side of the middle. */
  start: ARM_START,
  /** How fast the machine swings a tip to where it belongs, in field units a second. */
  speed: ARM_SPEED,
  /** How far a medal on a rail leans back against the wall of its channel, in radians from upright. Its face is turned up toward the middle of the cabinet, where the player looks from. */
  lean: 0.6,
} as const;

/**
 * The slot at the near end of each arm, which is a funnel: a ring that faces
 * the player, a mouth set back inside it, and between the two a throat that
 * narrows from the one to the other.
 */
export const SLOT = {
  /** How big the ring round its face is. */
  ring: 4.9,
  /** How much of that ring is inside its ring of light, and how much of it is the throat inside that. */
  light: 0.9,
  throat: 0.78,
  /** How far in front of the slot a medal is shown for a moment before it is taken in. */
  out: 7,
  /** How far in front of its collar the slot's face stands, and how far behind the collar its body ends. */
  face: 1.6,
  back: 4.2,
  /** How big its body is at the back. It flares from there to the ring. */
  waist: 3.6,
  /**
   * The mouth a medal goes in at, standing on its edge: how wide it is,
   * which is getting on for four times as wide as a medal is thick, and how
   * tall, which is a little more than a medal is across.
   */
  mouth: { wide: 3.4, tall: MEDAL_RADIUS * 2 + 0.6 },
  /** How far in from the face the mouth is. */
  deep: 2.4,
  /** How far the slot's face is tipped back, in radians: it looks up at the player, who looks down into it. */
  tilt: 0.38,
} as const;

/**
 * A point of an arm's slot: `across` its face to the player's right, `up`
 * its face, and `out` from the collar the way the slot faces, which is toward
 * the player and upward by its tilt. The middle of its face is `SLOT.face`
 * out, and the middle of its mouth `SLOT.face − SLOT.deep`.
 */
export function slotSpot(arm: Arm, across: number, up: number, out: number): Spot {
  const collar = armCollar(arm);
  const sin = Math.sin(SLOT.tilt);
  const cos = Math.cos(SLOT.tilt);
  return { x: collar.x + across, height: collar.height + up * cos + out * sin, depth: collar.depth - up * sin + out * cos };
}

/** The hatch a prize ball comes out of: a round door in the middle of the hood's face. */
export const HATCH = { x: FIELD.width / 2, height: (HOUSING.hood + HEIGHT.top) / 2, depth: HOUSING.out, radius: 4.7 } as const;

/**
 * The slot the machine pays its medals from: the gap under the hood, all the
 * way across. A medal is let go this high and this far out from the wall,
 * which is inside the hood, out of sight: it is seen as it drops out from
 * under the hood's lip.
 */
export const PAYOUT_SLOT = { height: HOUSING.hood + 2.6, depth: HOUSING.out - 3.2 } as const;

/** The middle of an arm's collar: where its rail turns, and where a medal goes in. */
export function armCollar(arm: Arm): Spot {
  return { x: arm === 0 ? ARMS.collar.inset : FIELD.width - ARMS.collar.inset, height: ARMS.collar.height, depth: ARMS.collar.depth };
}

/**
 * The far end of an arm's rail when its tip is over `tipX`, which for the
 * machine as it stands is `machine.tips[arm]`: the place a medal's middle is
 * as it leaves. A place the arm cannot reach is taken as the end of its
 * reach.
 */
export function armTip(arm: Arm, tipX: number): Spot {
  return { x: tipOf(arm, tipX), height: ARMS.tip, depth: ARMS.depth };
}

/** How long an arm's rail is, collar to tip, when its tip is over `tipX`. */
export function railLength(arm: Arm, tipX: number): number {
  const from = armCollar(arm);
  const to = armTip(arm, tipX);
  return Math.hypot(to.x - from.x, to.height - from.height, to.depth - from.depth);
}

/**
 * Which way an arm's rail runs across the floor, as the angle `attitude` in
 * mat4.ts takes for the line a medal is tipped about: from the x axis toward
 * the player. It is given so that a medal tipped back about that line turns
 * its face up toward the middle of the cabinet, on either arm.
 */
export function railHeading(arm: Arm, tipX: number): number {
  const from = armCollar(arm);
  const to = armTip(arm, tipX);
  const side = arm === 0 ? 1 : -1;
  return Math.atan2(side * (to.depth - from.depth), side * (to.x - from.x));
}

/**
 * An arm's channel, as three directions in the cabinet, each of length one:
 * `along` runs down the rail from the collar to the tip; `face` is the way
 * the face of a medal in it looks; `foot` points from the middle of that
 * medal to the edge it stands on. The channel's floor is under the foot, and
 * the wall the medal leans on is behind its back.
 */
export function railFrame(arm: Arm, tipX: number): { from: Spot; to: Spot; length: number; along: Spot; face: Spot; foot: Spot } {
  const from = armCollar(arm);
  const to = armTip(arm, tipX);
  const length = railLength(arm, tipX);
  const heading = railHeading(arm, tipX);
  const sin = Math.sin(ARMS.lean);
  const cos = Math.cos(ARMS.lean);
  return {
    from,
    to,
    length,
    along: { x: (to.x - from.x) / length, height: (to.height - from.height) / length, depth: (to.depth - from.depth) / length },
    face: { x: -Math.sin(heading) * cos, height: sin, depth: Math.cos(heading) * cos },
    foot: { x: -Math.sin(heading) * sin, height: -cos, depth: Math.cos(heading) * sin },
  };
}

/** How far along its rail a medal is, from the collar (0) to the tip (1), with this much of its way still to go. It picks up a little speed on the way. */
export function rolled(remaining: number): number {
  const done = Math.min(1, Math.max(0, 1 - remaining / FEED.arm));
  return done * (0.8 + 0.2 * done);
}

/**
 * Where the middle of a medal is on the rail of an arm whose tip is over
 * `tipX`, with `remaining` seconds of its way to go, and how far it has
 * turned since the collar, in radians: as far as it has rolled.
 */
export function rollingSpot(arm: Arm, tipX: number, remaining: number): Spot & { turned: number } {
  const from = armCollar(arm);
  const to = armTip(arm, tipX);
  const share = rolled(remaining);
  return {
    x: from.x + (to.x - from.x) * share,
    height: from.height + (to.height - from.height) * share,
    depth: from.depth + (to.depth - from.depth) * share,
    turned: (share * railLength(arm, tipX)) / MEDAL_RADIUS,
  };
}

/** Where on its way in a medal is: being taken in at the slot, or rolling along its arm's rail. */
export type Leg = 'slot' | 'arm';

/** The leg a medal is on with this much of its way still to go. */
export const legOf = (remaining: number): Leg => (remaining <= FEED.arm ? 'arm' : 'slot');

/**
 * A place, and how a medal is held there: the three angles `attitude` in
 * mat4.ts takes. `turn` is added to the turn the medal lies at when it has
 * landed; `tilt` is how far it is tipped over from lying flat; `heading` is
 * the level line it is tipped about.
 */
export interface Held extends Spot {
  turn: number;
  tilt: number;
  heading: number;
}

/**
 * Where a fed medal's middle is, and how it is held, with `remaining`
 * seconds of its way to go on the arm whose tip is over `tipX`. Shown face
 * on in front of the slot, it is turned edge on and drawn into the mouth.
 * It comes out behind the collar on the rail, leans back into the channel,
 * and rolls to the tip. It gets there turned the way it will lie, so it does
 * not jump as it leaves.
 */
export function fedSpot(arm: Arm, tipX: number, remaining: number): Held & { leg: Leg } {
  const along = railHeading(arm, tipX);
  if (legOf(remaining) === 'slot') {
    const collar = armCollar(arm);
    const taken = Math.min(1, Math.max(0, (ROLL_TIME - remaining) / FEED.slot));
    const eased = taken * taken * (3 - 2 * taken);
    const whole = railLength(arm, tipX) / MEDAL_RADIUS;
    return { x: collar.x, height: collar.height, depth: collar.depth + SLOT.out * (1 - eased), leg: 'slot', turn: whole, tilt: Math.PI / 2, heading: along * eased };
  }
  const spot = rollingSpot(arm, tipX, remaining);
  const whole = rollingSpot(arm, tipX, 0).turned;
  // It leans back as it comes out from behind the collar, in the first tenth of the rail.
  const leaning = Math.min(1, rolled(remaining) / 0.1);
  return { x: spot.x, height: spot.height, depth: spot.depth, leg: 'arm', turn: whole - spot.turned, tilt: Math.PI / 2 - ARMS.lean * leaning, heading: along };
}

/**
 * Where something in the air was let go, as the cabinet shows it: a medal
 * the player fed, off the tip of its arm; a medal the machine pays, out of
 * the slot under the hood, straight above where it lands; a prize ball or a
 * jewel, in the hatch, its middle a little behind the door it comes out
 * through. The machine keeps only where across the field each was let go,
 * which is all it needs; the rest is the cabinet's.
 */
export function letGo(medal: FallingMedal): Spot {
  if (medal.source === 'player') return { x: medal.fromX, height: ARMS.tip, depth: ARMS.depth };
  if (medal.ball || medal.jewel) return { x: HATCH.x, height: HATCH.height, depth: HATCH.depth - 1 };
  return { x: medal.fromX, height: PAYOUT_SLOT.height, depth: PAYOUT_SLOT.depth };
}

/**
 * Where the middle of a medal or a ball in the air is: from where it was let
 * go to where it lands, falling faster and faster, and carrying on out from
 * the wall the way it left, quickly at first. `rest` is how high its middle
 * is once it is down. It is not for a medal off a falling tower, which only
 * slides out from where it stood.
 */
export function airSpot(medal: FallingMedal, rest: number): Spot {
  const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
  const from = letGo(medal);
  return {
    x: from.x + (medal.x - from.x) * t,
    height: rest + (from.height - rest) * (1 - t * t),
    depth: from.depth + (medal.y - from.depth) * (1 - (1 - t) * (1 - t)),
  };
}

/**
 * How a medal that has just left an arm is held: as it was on the rail,
 * which is how its fall begins. A falling medal does not say which arm it
 * left. Whoever watched it roll says so with `arm`; otherwise it is taken to
 * be the arm on the side it left from, which is a guess where the two arms'
 * reaches overlap.
 */
export function leftHeld(medal: FallingMedal, arm: Arm = armFor(medal.fromX)): { tilt: number; heading: number } {
  return { tilt: Math.PI / 2 - ARMS.lean, heading: railHeading(arm, medal.fromX) };
}
