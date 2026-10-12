/**
 * Shorthand for the tests: feeding a medal at a spot, the way a player does it in two moves.
 *
 * The machine takes an aim for each arm and is told which arm to feed. Most tests only care where a medal comes
 * down, so these point the arm on that side of the field at the spot and feed it, and leave the other arm alone.
 */
import { aimArm, armFor, dropMedal, tipOf, type Machine } from '@/components/game/MedalPusher/engine';
import { insert, type Session } from '@/components/game/MedalPusher/session';

/** Points the arm on the side of `x` at it and feeds that arm one medal. Returns whether the arm took it. */
export function dropAt(machine: Machine, x: number): boolean {
  const arm = armFor(x);
  aimArm(machine, arm, x);
  return dropMedal(machine, arm);
}

/** The same through a session: the medal comes out of the purse. */
export function insertAt(session: Session, x: number): boolean {
  const arm = armFor(x);
  aimArm(session.machine, arm, x);
  return insert(session, arm);
}

/** Points the arm on the side of `x` at it and leaves the other where it is pointed. Nothing is fed. */
export function aimSide(machine: Machine, x: number): void {
  aimArm(machine, armFor(x), x);
}

/** Points both arms at one spot, each as near to it as it reaches: what a single aim used to do. */
export function aimBoth(machine: Machine, x: number): void {
  machine.aims = [tipOf(0, x), tipOf(1, x)];
}
