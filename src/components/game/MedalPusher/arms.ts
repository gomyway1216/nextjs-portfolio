/**
 * The two feed arms as things in the cabinet: where each is hung, where the
 * end of its rail is, and where a medal rolling down it has got to. The engine
 * owns the arms: it keeps where each tip is across the field (`machine.tips`),
 * swings it, and decides when a medal leaves and where it lands. This file
 * only says where that puts things in the cabinet's own measures — across the
 * field, up from the lower table, and out from the back wall, which is what
 * `project` in view.ts takes — so that whatever draws the machine draws the
 * same arms, straight from the machine and with no easing of its own.
 *
 * An arm is a rail that slides through a collar hung in an upper corner of the
 * back panel. The collar swivels, and the rail's tip is pushed out over the
 * field to wherever the player aims; what is left of the rail sticks out behind
 * the collar. A medal goes in at the collar, rolls down the rail on its edge,
 * its face to the player, and drops off the tip.
 */

import { ARM_REST, ARM_SPEED, FIELD, MEDAL_RADIUS, RELEASE, ROLL_TIME, tipOf, type Arm, type FallingMedal } from './engine';

// How a tip moves is the engine's business; it is handed on from here so that the arms can be read about in one place.
export { armGoal, armRest, swing } from './engine';

/** A place in the cabinet: across the field, above the lower table, and out from the back wall. */
export interface Spot {
  x: number;
  height: number;
  depth: number;
}

export const ARMS = {
  /** The collar a rail slides through: this far in from its side wall, and this high. */
  collar: { inset: 2.4, height: 37.4 },
  /** How high a medal is when it drops off a tip. Lower than the top of the panel, so the rail has a slope to it. */
  tip: 27,
  /** How far out from the back panel both arms hang: where a medal is let go. */
  depth: RELEASE.depth,
  /** An arm with nothing to do rests with its tip this far short of the middle. */
  rest: ARM_REST,
  /** How fast the machine swings a tip to where it belongs, in field units a second. */
  speed: ARM_SPEED,
  /** The whole rail, collar to tip at its longest and a little over. */
  length: 64,
} as const;

/** The middle of an arm's collar: where its rail turns, and where a medal goes in. */
export function armCollar(arm: Arm): Spot {
  return { x: arm === 0 ? ARMS.collar.inset : FIELD.width - ARMS.collar.inset, height: ARMS.collar.height, depth: ARMS.depth };
}

/**
 * The end of an arm's rail when its tip is over `tipX`, which for the machine
 * as it stands is `machine.tips[arm]`: the place a medal's middle is as it
 * drops off. A place the arm cannot reach is taken as the end of its reach.
 */
export function armTip(arm: Arm, tipX: number): Spot {
  return { x: tipOf(arm, tipX), height: ARMS.tip, depth: ARMS.depth };
}

/** How far down a rail a medal is, from the collar (0) to the tip (1), with this much of its roll still to go. It picks up speed on the way. */
export function rolled(remaining: number): number {
  const done = Math.min(1, Math.max(0, 1 - remaining / ROLL_TIME));
  return done * (0.45 + 0.55 * done);
}

/**
 * Where the middle of a medal is on the rail of an arm whose tip is over
 * `tipX`, with `remaining` seconds of its roll to go, and how far it has
 * turned on the way from the collar: in radians, clockwise as the player sees
 * it, so the left arm's medals count up and the right arm's down.
 */
export function rollingSpot(arm: Arm, tipX: number, remaining: number): Spot & { turned: number } {
  const from = armCollar(arm);
  const to = armTip(arm, tipX);
  const share = rolled(remaining);
  const length = Math.hypot(to.x - from.x, to.height - from.height);
  return {
    x: from.x + (to.x - from.x) * share,
    height: from.height + (to.height - from.height) * share,
    depth: ARMS.depth,
    turned: ((arm === 0 ? 1 : -1) * share * length) / MEDAL_RADIUS,
  };
}

/** The height a medal in the air was let go at: an arm's tip for one the player fed, the top of the back panel for one the machine paid. */
export const letGoAt = (medal: FallingMedal): number => (medal.source === 'player' ? ARMS.tip : RELEASE.height);
