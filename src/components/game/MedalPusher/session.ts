/**
 * A whole machine in play: the field, the credits, the chuckers' held spins,
 * the slot on the centre screen, the prize balls and the jackpot. Like the field it takes time
 * as a parameter and its random numbers from the machine's seeded generator,
 * so the cabinet on screen and the simulation tab run exactly the same thing.
 */

import { buildTowers, createMachine, dropBall, dropMedal, queuePayout, step, type Machine } from './engine';
import {
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  SPIN_PAYS,
  TOWERS_FROM,
  drawPocket,
  drawSpin,
  pocketPays,
  type SpinResult,
  type Tier,
} from './lottery';

export const START_CREDITS = 100;
/** Which lines of the slot are paid as a tower. The roulette's prizes always are. */
export const PAID_AS_TOWER: Record<Tier, boolean> = { miss: false, small: false, big: true, seven: false };
/** Spins the machine holds while the slot is busy; a chucker hit beyond that is wasted. */
export const MAX_STOCK = 4;
/** Prize balls lying on the field when a machine is switched on. */
export const START_BALLS = 2;
/**
 * How long things take on the screen, in seconds: a spin, a quicker one when
 * spins are queueing up, the extra suspense of a reach, the roulette, and how
 * long a winning line and a roulette prize stay up before the next spin.
 */
export const TIMING = { spin: 1.6, quickSpin: 0.9, reach: 1.3, roulette: 5, celebrate: 1.2, prize: 2.6 } as const;

export interface ActiveSpin {
  result: SpinResult;
  elapsed: number;
  /** When the last reel stops. A winning line then stays up for a moment. */
  duration: number;
  /** Whether the reels have stopped and the line has been paid. */
  done: boolean;
}

export interface ActiveRoulette {
  /** Index of the pocket it will stop on. */
  pocket: number;
  elapsed: number;
  /** When the light stops. The prize then stays up for a moment. */
  duration: number;
  /** Medals it paid; −1 while the light is still going round. */
  payout: number;
}

export interface Session {
  machine: Machine;
  credits: number;
  /** Medals the player has dropped, and what became of the field's medals since. */
  inserted: number;
  won: number;
  lost: number;
  /** Medals the machine has thrown onto the field as prizes. */
  paidOut: number;
  stock: number;
  /** Chucker hits, and how many of them found the stock already full. */
  hits: number;
  wasted: number;
  jackpot: number;
  /** Medals played since the jackpot last grew. */
  jackpotProgress: number;
  spin: ActiveSpin | null;
  roulette: ActiveRoulette | null;
  /** Balls pushed over the front whose roulette has not started yet. */
  balls: number;
  /** Roulettes started, one for every ball that went over. */
  roulettes: number;
  spins: number;
  tiers: Record<Tier, number>;
  jackpots: number;
  refills: number;
}

/** Something the cabinet should react to, in the order it happened. */
export type SessionEvent =
  | { type: 'won'; count: number }
  | { type: 'lost'; count: number }
  | { type: 'landed'; count: number }
  | { type: 'toppled'; count: number }
  | { type: 'ball'; count: number }
  | { type: 'checker'; gate: number; held: boolean }
  | { type: 'spinStart'; result: SpinResult; duration: number }
  | { type: 'spinEnd'; result: SpinResult; payout: number }
  | { type: 'rouletteStart'; pocket: number; duration: number }
  | { type: 'rouletteEnd'; pocket: number; payout: number; jackpot: boolean };

export function createSession(seed: number, balls: number = START_BALLS): Session {
  return {
    machine: createMachine(seed, balls),
    credits: START_CREDITS,
    inserted: 0,
    won: 0,
    lost: 0,
    paidOut: 0,
    stock: 0,
    hits: 0,
    wasted: 0,
    jackpot: JACKPOT_START,
    jackpotProgress: 0,
    spin: null,
    roulette: null,
    balls: 0,
    roulettes: 0,
    spins: 0,
    tiers: { miss: 0, small: 0, big: 0, seven: 0 },
    jackpots: 0,
    refills: 0,
  };
}

/** Drops one of the player's medals at `aimX`. Returns whether the machine took it. */
export function insert(session: Session, aimX: number): boolean {
  if (session.credits <= 0) return false;
  if (!dropMedal(session.machine, aimX)) return false;
  session.credits -= 1;
  session.inserted += 1;
  session.jackpotProgress += 1;
  if (session.jackpotProgress >= JACKPOT_STEP) {
    session.jackpotProgress = 0;
    session.jackpot += 1;
  }
  return true;
}

/** Another hundred medals for a player who has run out. */
export function refill(session: Session): boolean {
  if (session.credits > 0) return false;
  session.credits = START_CREDITS;
  session.refills += 1;
  return true;
}

/** Whether anything is still in motion on the screen or queued to drop. */
export const isBusy = (session: Session): boolean =>
  session.spin !== null ||
  session.roulette !== null ||
  session.stock > 0 ||
  session.balls > 0 ||
  session.machine.payoutQueue > 0 ||
  session.machine.growing > 0 ||
  session.machine.falling.length > 0;

/** Pays a prize onto the field: thrown on loose, or stacked on the pusher as towers. */
function pay(session: Session, medals: number, towers: boolean): void {
  if (medals <= 0) return;
  if (towers) buildTowers(session.machine, medals);
  else queuePayout(session.machine, medals);
  session.paidOut += medals;
}

/** Moves the machine forward by `dt` seconds. Events are appended to `events` when it is given. */
export function advance(session: Session, dt: number, events?: SessionEvent[]): void {
  const field = step(session.machine, dt);
  if (field.won > 0) {
    session.won += field.won;
    session.credits += field.won;
    events?.push({ type: 'won', count: field.won });
  }
  if (field.lost > 0) {
    session.lost += field.lost;
    events?.push({ type: 'lost', count: field.lost });
  }
  if (field.landed > 0) events?.push({ type: 'landed', count: field.landed });
  if (field.toppled > 0) events?.push({ type: 'toppled', count: field.toppled });
  if (field.balls > 0) {
    session.balls += field.balls;
    events?.push({ type: 'ball', count: field.balls });
  }
  for (const gate of field.checkers) {
    session.hits += 1;
    const held = session.stock < MAX_STOCK;
    if (held) session.stock += 1;
    else session.wasted += 1;
    events?.push({ type: 'checker', gate, held });
  }

  const { roulette, spin } = session;
  if (roulette) {
    roulette.elapsed += dt;
    if (roulette.payout < 0 && roulette.elapsed >= roulette.duration) {
      const jackpot = ROULETTE[roulette.pocket] === 'jackpot';
      roulette.payout = pocketPays(ROULETTE[roulette.pocket], session.jackpot);
      pay(session, roulette.payout, roulette.payout >= TOWERS_FROM);
      if (jackpot) {
        session.jackpots += 1;
        session.jackpot = JACKPOT_START;
        session.jackpotProgress = 0;
      }
      events?.push({ type: 'rouletteEnd', pocket: roulette.pocket, payout: roulette.payout, jackpot });
    }
    if (roulette.elapsed >= roulette.duration + TIMING.prize) session.roulette = null;
    return;
  }

  if (spin) {
    spin.elapsed += dt;
    const { tier } = spin.result;
    if (!spin.done && spin.elapsed >= spin.duration) {
      spin.done = true;
      session.tiers[tier] += 1;
      const payout = tier === 'seven' ? 0 : SPIN_PAYS[tier];
      // Three sevens pay no medals: a prize ball comes down onto the pusher.
      if (tier === 'seven') dropBall(session.machine);
      pay(session, payout, PAID_AS_TOWER[tier]);
      events?.push({ type: 'spinEnd', result: spin.result, payout });
    }
    if (spin.elapsed >= spin.duration + (tier === 'miss' ? 0 : TIMING.celebrate)) session.spin = null;
    return;
  }

  // A ball that has gone over the front has its roulette before any held spin.
  if (session.balls > 0) {
    session.balls -= 1;
    session.roulettes += 1;
    const pocket = drawPocket(session.machine.rng);
    session.roulette = { pocket, elapsed: 0, duration: TIMING.roulette, payout: -1 };
    events?.push({ type: 'rouletteStart', pocket, duration: TIMING.roulette });
    return;
  }

  if (session.stock > 0) {
    session.stock -= 1;
    session.spins += 1;
    const result = drawSpin(session.machine.rng);
    // With spins queueing behind it, the reels hurry.
    const duration = (session.stock >= 2 ? TIMING.quickSpin : TIMING.spin) + (result.reach ? TIMING.reach : 0);
    session.spin = { result, elapsed: 0, duration, done: false };
    events?.push({ type: 'spinStart', result, duration });
  }
}
