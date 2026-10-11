/**
 * The two feed arms as things in the cabinet: where each is hung, where its
 * tip is for a given aim, and where a medal rolling down it has got to. The
 * engine decides when a medal leaves an arm and where it lands. This file only
 * says where things are, in the cabinet's own measures — across the field, up
 * from the lower table, and out from the back wall, which is what `project` in
 * view.ts takes — so that whatever draws the machine draws the same arms.
 *
 * An arm is a rail that slides through a collar hung in an upper corner of the
 * back panel. The collar swivels, and the rail's tip is pushed out over the
 * field to wherever the player aims; what is left of the rail sticks out behind
 * the collar. A medal goes in at the collar, rolls down the rail on its edge,
 * its face to the player, and drops off the tip.
 */

import { FIELD, MEDAL_RADIUS, RELEASE, ROLL_TIME, armFor, tipOf, type Arm, type FallingMedal, type Machine } from './engine';

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
  rest: 14,
  /** How fast a tip is drawn swinging to where it belongs, in field units a second. The machine itself does not wait for it. */
  speed: 240,
  /** The whole rail, collar to tip at its longest and a little over. */
  length: 64,
} as const;

/** The middle of an arm's collar: where its rail turns, and where a medal goes in. */
export function armCollar(arm: Arm): Spot {
  return { x: arm === 0 ? ARMS.collar.inset : FIELD.width - ARMS.collar.inset, height: ARMS.collar.height, depth: ARMS.depth };
}

/** The end of an arm's rail when the arms are pointed at `aim`: the place a medal's middle is as it drops off. */
export function armTip(arm: Arm, aim: number): Spot {
  return { x: tipOf(arm, aim), height: ARMS.tip, depth: ARMS.depth };
}

/** Where across the field an arm rests its tip when it has nothing to do. */
export const armRest = (arm: Arm): number => FIELD.width / 2 + (arm === 0 ? -ARMS.rest : ARMS.rest);

/**
 * Where across the field an arm's tip belongs: over the aim, as far as the arm
 * reaches, when the aim is on its side or a medal is on its rail, and at rest
 * otherwise. An arm with a medal on it is always over the aim, so this is also
 * where that medal will be let go.
 */
export function armGoal(machine: Machine, arm: Arm): number {
  const loaded = machine.rolling.some((medal) => medal.arm === arm);
  return loaded || armFor(machine.aim) === arm ? tipOf(arm, machine.aim) : armRest(arm);
}

/** A tip on its way to where it belongs, `dt` seconds on: it swings there at the arms' speed and stops. */
export function swing(tipX: number, goal: number, dt: number): number {
  const reach = ARMS.speed * dt;
  return Math.abs(goal - tipX) <= reach ? goal : tipX + Math.sign(goal - tipX) * reach;
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
