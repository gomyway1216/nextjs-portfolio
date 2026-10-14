/**
 * The tower lifts: where a medal tower comes from.
 *
 * Under every place a tower can stand there is a lift in the pusher's deck,
 * with a round hatch over it: two doors that meet along a seam, and a collar
 * round them that is a ring of light. When a prize is paid as towers, this
 * is what the hatches of the places it goes to do, and it is meant to be
 * watched:
 *
 * 1. The ring of light in the collar comes on, running round from the back.
 * 2. The doors slide apart into the deck, and the dark of the shaft shows.
 * 3. Out of the collar a clear guard rises, a sleeve as high as the tower
 *    will be, and the first medal comes up into the light at the mouth of
 *    the shaft.
 * 4. The tower comes up inside the guard from underneath, a medal at a
 *    time: each new one is pushed in at the bottom and lifts the rest. This
 *    is the long part, five or six medals a second, so a tower of 22 takes
 *    four seconds to build.
 * 5. Built, it stands in its guard for a moment.
 * 6. The guard sinks back into the collar, and from the moment it begins to
 *    the tower stands free.
 * 7. The hatch closes round the tower's foot and the ring goes out.
 *
 * That is how the machine that is built round medal towers does it, Sega's
 * "Babel no Medal Tower": a mechanism inside the table makes the tower from
 * below, slowly, each layer raised in under the ones before it, behind a
 * clear wall that is raised while the tower is being made, so that the
 * medals round it cannot knock it over, and lowered when it is done. The
 * building is the show. There the mechanism is in the fixed table in front
 * of the pusher and a layer is a ring of six medals; here the towers stand
 * on the pusher, one medal wide, as they always have, so the lifts are in
 * the pusher's deck and ride with it.
 *
 * For the machine this means three things. A tower is real medals from the
 * moment its prize is paid: the ones still under the deck are counted with
 * it. From that moment until its guard begins to sink it is held where its
 * lift is, and the medals lying round it are pushed aside by it and cannot
 * push it; it is pushed like any tower from then on. And it gains its medals
 * at `TOWER.perSecond`, once the hatch and the guard have taken `LIFT.opens`.
 *
 * Every tower comes up this way, however small. The smallest there is is the
 * jewels' bonus, a tower of three: its guard stands as high as three medals,
 * its two medals are up in a third of a second, and it stands free a little
 * over two seconds after its prize is paid. A tower under some size that was
 * simply set down would be the one thing on this machine that came from
 * nowhere, and a second kind of tower for the save and both renderers to
 * know of.
 *
 * This file is the engine's side of it and imports nothing that runs.
 */

import type { Machine, Medal } from './engine';

export const LIFT = {
  /** Seconds the ring of light round a hatch takes to come on, before its doors begin to part. */
  lamps: 0.2,
  /** Seconds the doors take to slide open, and the guard to rise after them. */
  doors: 0.4,
  rises: 0.5,
  /**
   * Seconds from one hatch starting to the next one out from the middle
   * starting, across a row: a prize's hatches open as a ripple from the
   * middle outward. It is in the picture and not in the rule: every tower of
   * a prize is held from the same moment and gains its first medal at the
   * same moment, and `opens` has room for the outermost of them.
   */
  ripple: 0.1,
  /** Seconds from the prize to the first medal coming up: the ring of light, doors, guard, and the ripple out to the last place of a row. */
  opens: 1.3,
  /** Seconds a built tower stands in its raised guard before the guard begins to sink. */
  stands: 0.5,
  /** Seconds the guard takes to sink, and the hatch to close after it. */
  sinks: 0.6,
  shuts: 0.3,
  /** Seconds from the guard beginning to sink until the lift is done: the two above. */
  closes: 0.9,
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
  /** Seconds until the first medal comes up: the ring of light is coming on, the hatch is opening and the guard rising. */
  wait: number;
  /**
   * Seconds the guard has been sinking: from 0, when the tower is let go,
   * up to `LIFT.closes`. Before that it is less than nothing: −1 for as long
   * as the tower is not built, and from the step its last medal comes up the
   * seconds it has yet to stand in its raised guard, counted up from
   * −`LIFT.stands` to 0. A tower never stands for as long as a second, so
   * the two are not mistaken for each other.
   */
  sunk: number;
}

/** A lift that starts on a tower: `tower` is the medal just put on its hatch, `front` where the lip is. */
export const startLift = (tower: Medal, front: number): Lift => ({ id: tower.id, x: tower.x, behind: front - tower.y, size: tower.stack + tower.grow, wait: LIFT.opens, sunk: -1 });

/** A lift found already at work on a tower with no word of when it began: its guard is up and its medals are coming. */
export const liftAtWork = (tower: Medal, front: number): Lift => ({ ...startLift(tower, front), wait: 0 });

/** Whether a lift still holds its tower: from the moment it starts until its guard begins to sink. */
export const holds = (lift: Lift): boolean => lift.sunk < 0;

/** Whether a lift's tower is built and standing in its raised guard: the moment between the last medal and the guard sinking. */
export const stands = (lift: Lift): boolean => lift.sunk < 0 && lift.sunk > -1;

/**
 * How far up its guard is, from 0 (in the deck) to 1 (as high as the tower
 * will be), moving at an even pace: rising over the last `LIFT.rises` of the
 * lift's wait, up while the tower is built and while it stands, sinking
 * after. `early` is how many seconds ahead of the outermost hatch of a row
 * this one is, which is its place in the ripple: its guard is up that much
 * sooner and begins to sink that much sooner, while the tower still stands.
 */
export function guardUp(lift: Lift, early = 0): number {
  if (lift.sunk > -1) return Math.min(1, Math.max(0, 1 - (lift.sunk + early) / LIFT.sinks));
  return Math.min(1, Math.max(0, 1 - (lift.wait - early) / LIFT.rises));
}

/**
 * Runs the lifts for `dt` seconds: hatches finish opening, the towers whose
 * guards are up each gain a medal at a time, `perSecond` of them a second,
 * a tower that has its last medal stands for a moment, and the guards of the
 * ones that have stood sink and are gone. A tower that is going up with no
 * lift under it, which only a machine put together by hand has, gains its
 * medals the same way.
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
    if (lift.sunk > -1) {
      // Standing, and then sinking: the one clock runs through nothing, where the tower is let go.
      lift.sunk += dt;
      if (lift.sunk >= LIFT.closes) done = true;
      continue;
    }
    if (lift.wait > 0) continue;
    const tower = machine.medals.find((medal) => medal.id === lift.id);
    // Gone: the guard has nothing more to hold. Built: it stands for a moment first.
    if (!tower) lift.sunk = 0;
    else if (tower.grow === 0) lift.sunk = -LIFT.stands;
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
