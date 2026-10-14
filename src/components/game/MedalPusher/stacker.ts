/**
 * The tower tubes: where a medal tower is stacked, and how it comes out.
 *
 * Two windows are cut in the cabinet's back wall, one at each of the screen's
 * lower corners, and in each stands a glass tube from the pusher's deck up
 * into the corner of the screen. A prize that is paid as towers is stacked in
 * them, in sight, before any of it is on the field:
 *
 * 1. The medals drop into the tube one at a time, out of the hopper through a
 *    slot in the top of the window, and land on the stack. The platform the
 *    stack stands on sinks a medal's thickness with every medal, so each one
 *    drops the same short way and the top of the stack stays at the top of
 *    the window, in the corner of the screen, where the count over the window
 *    is. A tube stacks `STACK.perSecond` medals a second, the two at once.
 * 2. Built, the tower is let down on its platform to the level of the deck.
 * 3. The gate at the foot of the window slides aside.
 * 4. The arm behind it pushes the whole tower out: straight out of the tube
 *    onto the deck, and on across the pusher to its place in the middle of the
 *    field, a little behind the lip, where a tower has always stood. Whatever
 *    lies in its way is pushed aside, and nothing pushes the tower.
 * 5. The arm lets it go, and it is a tower like any other: carried by the
 *    pusher, pushed by the medals round it, and over the lip in the end. The
 *    arm draws back, the gate shuts and the platform rises to take the next.
 *
 * It follows two machines of Sega's. In バベルのメダルタワー a mechanism in the
 * cabinet stacks a tower of up to a thousand medals in view ("メダルタワー生成
 * メカ"), and in ホリアテール a roulette's winnings are stacked onto a tower
 * that is paid out when it falls. And Sega's patent for a medal game machine
 * (US 12,542,033 B2, filed 2022) forms the tower in an area beside the field,
 * behind a clear wall the players see it through, and an extruder pushes the
 * finished tower out through a door in that wall onto the field, the feeding
 * and the pusher stopped meanwhile. Here the area is the tube in the window,
 * the door is the gate and the extruder is the arm; nothing stops, since
 * nothing on the pusher can move a tower on the arm.
 *
 * Which tube a tower is stacked in: the one that will be free soonest. Each
 * tube holds the tower it is building and up to `STACK.queue − 1` more
 * waiting their turn; what does not fit is poured by the hopper as loose
 * medals, which is what the machine has always done with a prize too big to
 * stack. While a ball's roulette is running, its numbers are stacked onto one
 * tower, as ホリアテール stacks its roulette's: a tower that is built and has
 * room on top waits in its tube for the next number, and goes out when the
 * run is over, or when it is as tall as a tower can be.
 *
 * This file is the engine's side of it and imports nothing that runs. Where
 * that puts the tubes, the gate and the arm in the cabinet, and how they are
 * drawn, is in works.ts.
 */

import type { Machine, Medal } from './engine';

export const STACK = {
  /**
   * The most medals in one tower: about four and a half times as tall as a
   * medal is wide. It is as tall as a tower can stand on this pusher, since
   * the tips of the feed arms hang over the towers (arms.ts).
   */
  most: 64,
  /** Medals a second that drop into a tube. */
  perSecond: 12,
  /** Seconds the platform takes to let a built tower down to the deck. */
  lowers: 0.8,
  /** Seconds the gate takes to slide aside. */
  opens: 0.35,
  /** Seconds the arm takes to push a tower out of its tube and across to its place. */
  pushes: 2.2,
  /** The share of that spent bringing it straight out of the tube onto the deck, before it is pushed across. */
  out: 0.25,
  /** Seconds from the arm letting a tower go until the tube can take medals again: the arm draws back, the gate shuts, the platform rises. */
  returns: 1,
  /** The share of that the arm takes to draw back into the window; the gate shuts behind it. */
  back: 0.55,
  /** Towers a tube holds at once: the one it is building and the ones waiting their turn. */
  queue: 3,
  /** How many times harder than a single medal a tower on the arm is to push: nothing on the pusher moves it. */
  hold: 1e9,
} as const;

/** Seconds a tube takes over a tower besides stacking it: let down, gate, arm, and back again. */
export const CYCLE = STACK.lowers + STACK.opens + STACK.pushes + STACK.returns;

/** The most towers the two tubes take on at once. */
export const TUBE_ROOM = 2 * STACK.queue;

export const TUBE = {
  /** How far across the field each tube stands, the left one's first: in the screen's lower corners. */
  x: [8.5, 91.5],
  /**
   * Where the arm leaves each tube's towers: how far across, and how far
   * behind the pusher's lip. That is where the first towers stood when they
   * came up through the deck, and near enough the lip to go over soon. Left
   * there, a tower of fifty in the middle of the field goes over the lip in
   * about twenty seconds, fed down the middle at two medals a second, and
   * about four of its medals in five go over the front; left against the
   * back wall it takes four or five minutes, and the side holes take four in
   * five of it.
   */
  site: [43, 57],
  behind: 9,
  /**
   * How far behind the face of the back wall the middle of a tube is: a
   * medal's radius and the glass. This file cannot read the medal's size
   * from the engine, which reads this file first; the tests hold the two to
   * each other.
   */
  back: -3.8,
  /** How far out from the wall's face the arm brings a tower before it pushes it across: clear of the window's edges. */
  mouth: 3.2,
  /** How high above the lower table the top of a stack stays while it is being built. */
  feed: 35,
} as const;

/** What a tube is doing: stacking (or standing ready), letting a built tower down, opening its gate, pushing the tower out, or drawing back. */
export type TubePhase = 'stacking' | 'lowering' | 'opening' | 'pushing' | 'returning';
export const TUBE_PHASES: readonly TubePhase[] = ['stacking', 'lowering', 'opening', 'pushing', 'returning'];

/** How long each phase but stacking lasts, in seconds. */
export const PHASE_TIME: Readonly<Record<Exclude<TubePhase, 'stacking'>, number>> = {
  lowering: STACK.lowers,
  opening: STACK.opens,
  pushing: STACK.pushes,
  returning: STACK.returns,
};

export interface Tube {
  phase: TubePhase;
  /**
   * While it stacks, how much of the next medal's drop has gone by, from 0 up
   * to 1, when it lands; otherwise the seconds the phase has run.
   */
  clock: number;
  /** Medals standing in the tube, on its platform. */
  stacked: number;
  /** Medals the tower in the tube will have when it is built: none when there is no tower in it. */
  size: number;
  /** The towers waiting their turn in this tube, first first: how many medals each will have. */
  waiting: number[];
  /** While the arm pushes a tower out, that medal's id; nothing (0) otherwise. */
  tower: number;
}

export interface Stacker {
  /** The left tube and the right one. */
  tubes: [Tube, Tube];
  /** Towers the arms have begun to push out since the machine was switched on. */
  made: number;
}

export const idleTube = (): Tube => ({ phase: 'stacking', clock: 0, stacked: 0, size: 0, waiting: [], tower: 0 });
export const idleStacker = (): Stacker => ({ tubes: [idleTube(), idleTube()], made: 0 });

/** How many towers a tube holds: the one in it, if there is one, and the ones waiting their turn. */
export const towersIn = (tube: Tube): number => (tube.size > 0 ? 1 : 0) + tube.waiting.length;

/** Whether the stacker has anything to do: a tower in a tube, one waiting, or an arm out. */
export const stackerBusy = (stacker: Stacker): boolean => stacker.tubes.some((tube) => tube.phase !== 'stacking' || tube.size > 0 || tube.waiting.length > 0);

/** Medals the tubes hold: stacked, still to drop in, and waiting their turn. A tower the arm is pushing is on the field. */
export const medalsInTubes = (stacker: Stacker): number => stacker.tubes.reduce((sum, tube) => tube.waiting.reduce((all, size) => all + size, sum + tube.size), 0);

/**
 * How a prize of `medals` is split into towers when `towers` of them can be
 * taken on: as few as will hold it, as even as they can be. What they cannot
 * hold is left out of the list.
 */
export function towerSizes(medals: number, towers: number = TUBE_ROOM): number[] {
  if (!Number.isInteger(medals) || medals < 0) throw new Error('a payout is a whole number of medals');
  if (!Number.isInteger(towers) || towers < 0) throw new Error('towers is a whole number of towers');
  const count = Math.min(towers, Math.ceil(medals / STACK.most));
  const stacked = Math.min(medals, count * STACK.most);
  return Array.from({ length: count }, (_, index) => Math.floor(stacked / count) + (index < stacked % count ? 1 : 0));
}

/** Seconds until a tube has finished everything it holds: the medals still to drop, and a cycle for each tower. */
export function busyFor(tube: Tube): number {
  let seconds = 0;
  if (tube.phase === 'stacking') {
    if (tube.size > 0) seconds += (tube.size - tube.stacked - tube.clock) / STACK.perSecond + CYCLE;
  } else {
    // What is left of the phase it is in, and of the phases after it.
    const from = TUBE_PHASES.indexOf(tube.phase);
    seconds -= tube.clock;
    for (let phase = from; phase < TUBE_PHASES.length; phase++) seconds += PHASE_TIME[TUBE_PHASES[phase] as Exclude<TubePhase, 'stacking'>];
  }
  for (const size of tube.waiting) seconds += size / STACK.perSecond + CYCLE;
  return seconds;
}

/**
 * Whether a tube's tower stays open while it is built: one that is being
 * gathered and has room on top, with nothing waiting behind it, waits in the
 * tube for more instead of going out.
 */
const staysOpen = (tube: Tube, gather: boolean): boolean => gather && tube.size < STACK.most && tube.waiting.length === 0;

/**
 * Gives the tubes `medals` to stack and returns how many they took. With
 * `gather`, they go first on top of a tower that is still open; whatever is
 * left is stacked as new towers, as few and as even as will hold it, each in
 * the tube that will be free soonest, for as long as the tubes have room.
 */
export function stackTowers(stacker: Stacker, medals: number, gather = false): number {
  if (!Number.isInteger(medals) || medals < 0) throw new Error('a payout is a whole number of medals');
  let left = medals;
  if (gather) {
    // The tallest open tower first: that is the one the run has been stacking.
    const open = stacker.tubes.filter((tube) => tube.phase === 'stacking' && tube.size > 0 && staysOpen(tube, true)).sort((a, b) => b.size - a.size);
    for (const tube of open) {
      const added = Math.min(left, STACK.most - tube.size);
      tube.size += added;
      left -= added;
    }
  }
  const room = stacker.tubes.reduce((sum, tube) => sum + Math.max(0, STACK.queue - towersIn(tube)), 0);
  for (const size of towerSizes(left, room)) {
    let best: Tube | null = null;
    let soonest = Infinity;
    // On a tie the tubes take turns, by how many towers have gone out.
    for (let turn = 0; turn < 2; turn++) {
      const tube = stacker.tubes[(stacker.made + turn) % 2];
      if (towersIn(tube) >= STACK.queue) continue;
      const free = busyFor(tube);
      if (free < soonest - 1e-9) {
        best = tube;
        soonest = free;
      }
    }
    if (!best) break;
    if (best.phase === 'stacking' && best.size === 0) best.size = size;
    else best.waiting.push(size);
    left -= size;
  }
  return medals - left;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * Where the arm of tube `index` has a tower, `clock` seconds into its push,
 * with the pusher's lip at `front`: across the field and out from the back
 * wall. First straight out of the tube to its mouth, then across to its
 * place, which keeps the same distance behind the lip wherever the lip is.
 */
export function armSpot(index: 0 | 1, clock: number, front: number): { x: number; y: number } {
  const u = clamp01(clock / STACK.pushes);
  const x = TUBE.x[index];
  if (u <= STACK.out) return { x, y: TUBE.back + (TUBE.mouth - TUBE.back) * smooth(u / STACK.out) };
  const f = smooth((u - STACK.out) / (1 - STACK.out));
  return { x: x + (TUBE.site[index] - x) * f, y: TUBE.mouth + (front - TUBE.behind - TUBE.mouth) * f };
}

/**
 * Runs the tubes for `dt` seconds. `front` is where the pusher's lip is at
 * the end of the step, and `gather` whether a tower that is built and has
 * room on top waits for more. A tower is put on the field, at the mouth of
 * its tube, as its arm begins to push it, and is let go when the push is
 * done.
 */
export function runStacker(machine: Machine, dt: number, front: number, gather: boolean): void {
  const { stacker } = machine;
  for (let index = 0; index < 2; index++) {
    const tube = stacker.tubes[index];
    if (tube.phase === 'stacking') {
      if (tube.stacked < tube.size) {
        tube.clock += dt * STACK.perSecond;
        while (tube.clock >= 1 && tube.stacked < tube.size) {
          tube.clock -= 1;
          tube.stacked += 1;
        }
      }
      if (tube.stacked >= tube.size) tube.clock = 0;
      if (tube.size > 0 && tube.stacked === tube.size && !staysOpen(tube, gather)) {
        tube.phase = 'lowering';
        tube.clock = 0;
      }
      continue;
    }
    tube.clock += dt;
    if (tube.clock < PHASE_TIME[tube.phase]) continue;
    tube.clock = 0;
    if (tube.phase === 'lowering') {
      tube.phase = 'opening';
    } else if (tube.phase === 'opening') {
      // The tower goes onto the field at the mouth of the tube, as it stands: the arm has it from here.
      const at = armSpot(index as 0 | 1, 0, front);
      const tower: Medal = { id: machine.nextId++, x: at.x, y: at.y, level: 1, tier: 0, sinceDrop: -1, stack: tube.size, ball: false, grown: 1 };
      machine.medals.push(tower);
      tube.tower = tower.id;
      tube.stacked = 0;
      tube.size = 0;
      tube.phase = 'pushing';
      stacker.made += 1;
    } else if (tube.phase === 'pushing') {
      tube.tower = 0;
      tube.phase = 'returning';
    } else {
      tube.phase = 'stacking';
      tube.size = tube.waiting.shift() ?? 0;
    }
  }
}

/**
 * Puts every tower an arm is pushing where its arm has it, `front` being
 * where the lip is now, and returns the ids of those towers: nothing that
 * leans on one of them moves it.
 */
export function holdTowers(machine: Machine, front: number, held: Set<number>): Set<number> {
  held.clear();
  machine.stacker.tubes.forEach((tube, index) => {
    if (tube.phase !== 'pushing') return;
    const tower = machine.medals.find((medal) => medal.id === tube.tower);
    if (!tower) return;
    const at = armSpot(index as 0 | 1, tube.clock, front);
    tower.x = at.x;
    tower.y = at.y;
    held.add(tower.id);
  });
  return held;
}
