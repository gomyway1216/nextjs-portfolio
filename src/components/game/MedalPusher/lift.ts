/**
 * The tower lifts: where a medal tower comes from.
 *
 * Under every place a tower can stand there is a lift in the pusher's deck,
 * with a round hatch over it. When a prize is paid as towers the hatches of
 * the places it goes to open, and out of each a clear guard rises, a sleeve
 * as high as the tower will be. Then the tower comes up inside it from
 * underneath, a medal at a time: each new one is pushed in at the bottom and
 * lifts the rest. When the last is in, the guard sinks back into the deck and
 * the tower stands free on the closed hatch.
 *
 * That is how the machine that is built round medal towers does it, Sega's
 * "Babel no Medal Tower": a mechanism inside the table makes the tower from
 * below, each layer raised in under the ones before it, behind a clear wall
 * that is raised while the tower is being made, so that the medals round it
 * cannot knock it over, and lowered when it is done. There the mechanism is
 * in the fixed table in front of the pusher and a layer is a ring of six
 * medals; here the towers stand on the pusher, one medal wide, as they
 * always have, so the lifts are in the pusher's deck and ride with it.
 *
 * For the machine this means three things. A tower is real medals from the
 * moment its prize is paid: the ones still under the deck are counted with
 * it. While its guard is up it is held where its lift is, and the medals
 * lying round it are pushed aside by it and cannot push it; it is pushed
 * like any tower from the moment the guard begins to sink. And it gains its
 * medals at the pace it always did, after the half second the hatch and the
 * guard take.
 *
 * Every tower comes up this way, however small. The smallest there is is the
 * jewels' bonus, a tower of three: its guard stands as high as three medals,
 * its two medals are up in a ninth of a second, and it stands free about a
 * second after its prize is paid. A tower under some size that was simply set
 * down would be the one thing on this machine that came from nowhere, and a
 * second kind of tower for the save and both renderers to know of.
 *
 * This file is the engine's side of it and imports nothing that runs.
 */

import type { Machine, Medal } from './engine';

export const LIFT = {
  /** Seconds a hatch takes to open and its guard to rise, before the first medal comes up. */
  opens: 0.5,
  /** Seconds the guard takes to sink once the tower is built. */
  closes: 0.45,
  /** How many times harder than a single medal a tower in its guard is to push: nothing on the pusher moves it. */
  hold: 1e9,
  /** How far the guard's wall stands out from the tower inside it: what lies round a tower in its guard lies that much further off. */
  wall: 0.5,
} as const;

export interface Lift {
  /** The tower it is building: that medal's id. */
  id: number;
  /** Where its hatch is in the pusher's deck: how far across, and how far behind the lip. */
  x: number;
  behind: number;
  /** Medals the tower has when it is built, which is how high the guard stands. */
  size: number;
  /** Seconds until the first medal comes up: the hatch is opening and the guard rising. */
  wait: number;
  /** Seconds the guard has been sinking, the tower built; −1 until then. */
  sunk: number;
}

/** A lift that starts on a tower: `tower` is the medal just put on its hatch, `front` where the lip is. */
export const startLift = (tower: Medal, front: number): Lift => ({ id: tower.id, x: tower.x, behind: front - tower.y, size: tower.stack + tower.grow, wait: LIFT.opens, sunk: -1 });

/** A lift found already at work on a tower with no word of when it began: its guard is up and its medals are coming. */
export const liftAtWork = (tower: Medal, front: number): Lift => ({ ...startLift(tower, front), wait: 0 });

/** Whether a lift still holds its tower: from the moment it starts until its guard begins to sink. */
export const holds = (lift: Lift): boolean => lift.sunk < 0;

/**
 * How far up its guard is, from 0 (in the deck) to 1 (as high as the tower
 * will be), moving at an even pace: rising while the lift waits, up while the
 * tower is built, sinking after.
 */
export function guardUp(lift: Lift): number {
  if (lift.sunk >= 0) return Math.max(0, 1 - lift.sunk / LIFT.closes);
  return 1 - lift.wait / LIFT.opens;
}

/**
 * Runs the lifts for `dt` seconds: hatches finish opening, the towers whose
 * guards are up each gain a medal at a time, `perSecond` of them a second,
 * and the guards of the finished ones sink and are gone. A tower that is
 * going up with no lift under it, which only a machine put together by hand
 * has, gains its medals the same way.
 */
export function runLifts(machine: Machine, dt: number, perSecond: number): void {
  const { lifts } = machine;
  if (lifts.length === 0 && machine.growing === 0) {
    machine.towerClock = 0;
    return;
  }
  const waiting = new Set<number>();
  for (const lift of lifts) {
    if (lift.wait > 0) {
      lift.wait = Math.max(0, lift.wait - dt);
      // It comes up no sooner than the step after its guard is.
      waiting.add(lift.id);
    }
  }
  const coming = (medal: Medal): boolean => medal.grow > 0 && !waiting.has(medal.id);
  if (machine.growing > 0 && machine.medals.some(coming)) {
    machine.towerClock += dt * perSecond;
    while (machine.towerClock >= 1 && machine.growing > 0) {
      machine.towerClock -= 1;
      for (const medal of machine.medals) {
        if (coming(medal)) {
          medal.grow -= 1;
          medal.stack += 1;
          machine.growing -= 1;
        }
      }
    }
  } else {
    machine.towerClock = 0;
  }
  if (lifts.length === 0) return;
  let done = false;
  for (const lift of lifts) {
    if (lift.sunk >= 0) {
      lift.sunk += dt;
      if (lift.sunk >= LIFT.closes) done = true;
      continue;
    }
    if (lift.wait > 0) continue;
    // Built, or gone: the guard has nothing more to hold.
    const tower = machine.medals.find((medal) => medal.id === lift.id);
    if (!tower || tower.grow === 0) lift.sunk = 0;
  }
  if (done) machine.lifts = lifts.filter((lift) => lift.sunk < LIFT.closes);
}

/**
 * Puts every tower that a lift still holds where its lift is, `front` being
 * where the lip is now, and returns the ids of those towers: nothing that
 * leans on one of them moves it.
 */
export function holdTowers(machine: Machine, front: number, held: Set<number>): Set<number> {
  held.clear();
  for (const lift of machine.lifts) {
    if (!holds(lift)) continue;
    const tower = machine.medals.find((medal) => medal.id === lift.id);
    if (!tower) continue;
    tower.x = lift.x;
    tower.y = front - lift.behind;
    held.add(lift.id);
  }
  return held;
}
