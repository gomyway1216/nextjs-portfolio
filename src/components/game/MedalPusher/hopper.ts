/**
 * The hopper: how the machine pays a prize that is too big to throw on a
 * medal at a time.
 *
 * A small win still comes out of the slot under the hood, a few medals a
 * second. But when thirty or more are waiting to be paid, two doors in the
 * hood's face drop open, one to either side of the ball hatch, and the medals
 * pour out of them down six channels, three to a door, as a sheet across the
 * pusher: four times as fast as the slot throws them, for as long as there
 * are any left. Then the doors are drawn shut again. It is the same queue of
 * the same medals either way, and every one of them is a real medal that
 * lands on the pusher and is pushed like any other.
 *
 * It follows what the big station pushers do. Konami's FORTUNE TRINITY pays
 * a jackpot out of six columns of hoppers in its centre unit, "like a
 * waterfall", in time with the show; its FORTUNE ORB pays onto a table in
 * front of the station's screen that tips its medals onto the pusher; a
 * Namco machine tips a box of them onto two slopes that run down to the
 * station. What all of them share is that a big prize is seen to come from
 * somewhere above the field and to arrive all across it, and that is what is
 * modelled here; which door, how many channels and how fast are this
 * cabinet's own.
 *
 * The sheet comes down across the very band the slot throws across, evenly:
 * a medal out of a channel lands anywhere in that channel's sixth of the
 * band. So where a prize's medals land does not depend on whether it was
 * thrown or poured, and neither does what the machine gives back.
 *
 * This file is the engine's side of it and imports nothing that runs: the
 * rule, the doors' state, and where across the field each channel is. Where
 * that puts the doors in the cabinet, and how they are drawn, is in works.ts.
 */

import type { Machine } from './engine';

export const POUR = {
  /** With this many medals or more waiting to be paid, the doors open. */
  threshold: 30,
  /** Medals a second out of the doors, all the channels together. */
  perSecond: 36,
  /** Channels a medal can come down: three to a door. */
  channels: 6,
  /**
   * The band of the pusher the sheet comes down across, which is the band the
   * slot throws across: the middle seven tenths of the field and a little more.
   * This file cannot read the field's width (78) from the engine, which reads
   * this file first; the tests hold the two to each other.
   */
  from: 78 * 0.14,
  to: 78 * 0.86,
  /** Seconds the doors take to drop open, and to be drawn shut. */
  opens: 0.45,
  closes: 0.6,
  /** Seconds a poured medal is on its way: down the door, through the air, and one short bounce. */
  fall: 0.62,
} as const;

/**
 * The two doors: how far across the hood's face each reaches. They stop
 * short of the middle, where the ball hatch is. This file cannot read the
 * field's width from the engine, which reads this file first; the tests hold
 * the two to each other.
 */
export const DOORS: readonly [{ from: number; to: number }, { from: number; to: number }] = [
  { from: 11.7, to: 33.4 },
  { from: 44.6, to: 66.3 },
];

/** Channels to a door. */
const EACH = POUR.channels / DOORS.length;

/** The order the channels let their medals go in: one door and then the other, working across both. */
export const CHANNEL_ORDER: readonly number[] = [0, 3, 1, 4, 2, 5];

/** Where across the field the middle of a channel's mouth is. Channels are numbered from the left, the left door's first. */
export function channelX(channel: number): number {
  const door = DOORS[Math.floor(channel / EACH)];
  return door.from + ((channel % EACH) + 0.5) * ((door.to - door.from) / EACH);
}

/** The part of the band a medal out of a channel lands in: from here, and this wide. */
export const CHANNEL_BAND = (POUR.to - POUR.from) / POUR.channels;
export const channelFrom = (channel: number): number => POUR.from + channel * CHANNEL_BAND;

/**
 * What the doors are doing: standing shut, dropping open, open with medals
 * pouring out, or being drawn shut.
 */
export type DoorPhase = 'shut' | 'opening' | 'pouring' | 'closing';

export interface Hopper {
  phase: DoorPhase;
  /** Seconds the doors have been dropping open or being drawn shut; nothing otherwise. */
  clock: number;
  /**
   * Pours begun since the machine was switched on. A pour begins each time
   * the doors begin to drop open: from shut, or from wherever they had got to
   * on their way shut when another prize big enough to pour came. It only ever
   * goes up, so two looks at the hopper that find the same number have seen
   * the same pour, however alike the rest of it is.
   */
  pours: number;
  /** Medals poured since that pour began. It is kept once the doors are shut again, until the next pour begins. */
  poured: number;
}

/** A hopper with its doors shut, that has poured nothing yet. */
export const shutHopper = (): Hopper => ({ phase: 'shut', clock: 0, pours: 0, poured: 0 });

/** How far open the doors are, from 0 (shut) to 1, moving at an even pace. */
export function doorsOpen(hopper: Hopper): number {
  if (hopper.phase === 'opening') return Math.min(1, hopper.clock / POUR.opens);
  if (hopper.phase === 'closing') return Math.max(0, 1 - hopper.clock / POUR.closes);
  return hopper.phase === 'pouring' ? 1 : 0;
}

/** Whether the hopper is at work: its doors anything but shut. */
export const hopperBusy = (hopper: Hopper): boolean => hopper.phase !== 'shut';

/**
 * Runs the hopper for `dt` seconds and says whether the paying is its
 * business just now. While its doors are anything but shut the slot under
 * the hood throws nothing: what is waiting goes out of the doors, or waits
 * for them to shut. `landing` is the band of depth a medal lands in and
 * `release` how far out from the wall the machine lets its medals go, which
 * are the engine's to say.
 */
export function runHopper(machine: Machine, dt: number, landing: { from: number; to: number }, release: number): boolean {
  const { hopper } = machine;
  if (hopper.phase === 'shut') {
    if (machine.payoutQueue < POUR.threshold) return false;
    hopper.phase = 'opening';
    hopper.clock = 0;
    hopper.pours += 1;
    hopper.poured = 0;
    machine.payoutClock = 0;
  }
  if (hopper.phase === 'opening') {
    hopper.clock += dt;
    if (hopper.clock >= POUR.opens) {
      hopper.phase = 'pouring';
      hopper.clock = 0;
    }
    return true;
  }
  if (hopper.phase === 'pouring') {
    machine.payoutClock += dt * POUR.perSecond;
    while (machine.payoutClock >= 1 && machine.payoutQueue > 0) {
      machine.payoutClock -= 1;
      machine.payoutQueue -= 1;
      const channel = CHANNEL_ORDER[hopper.poured % POUR.channels];
      const x = channelFrom(channel) + machine.rng() * CHANNEL_BAND;
      const y = landing.from + machine.rng() * (landing.to - landing.from);
      machine.falling.push({ id: machine.nextId++, x, y, level: 1, fromX: channelX(channel), fromY: release, rank: 0, ball: false, remaining: POUR.fall, duration: POUR.fall, source: 'pour' });
      hopper.poured += 1;
    }
    if (machine.payoutQueue === 0) {
      hopper.phase = 'closing';
      hopper.clock = 0;
      machine.payoutClock = 0;
    }
    return true;
  }
  // Being drawn shut. Another prize big enough to pour drops them open again from where they have got to.
  // The doors carry on from there; the pour is a new one, counted from nothing like any other.
  if (machine.payoutQueue >= POUR.threshold) {
    const open = doorsOpen(hopper);
    hopper.phase = 'opening';
    hopper.clock = POUR.opens * open;
    hopper.pours += 1;
    hopper.poured = 0;
    return true;
  }
  hopper.clock += dt;
  if (hopper.clock >= POUR.closes) {
    hopper.phase = 'shut';
    hopper.clock = 0;
  }
  return true;
}
