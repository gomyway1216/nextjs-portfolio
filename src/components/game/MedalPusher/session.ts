/**
 * A whole machine in play: the field, the credits, the chuckers' held spins,
 * the slot on the centre screen, the games it leads to, the prize balls and
 * the jackpot. Like the field it takes time as a parameter and its random
 * numbers from the machine's seeded generator, so the cabinet on screen and
 * the simulation tab run exactly the same thing.
 */

import { buildTowers, createMachine, dropBall, dropMedal, queuePayout, step, type Machine } from './engine';
import {
  BOARD,
  CHESTS,
  CHEST_TOWERS_FROM,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  TIER_BONUS,
  TOWERS_FROM,
  drawDie,
  drawPocket,
  drawSpin,
  pocketPays,
  shuffleChests,
  squareAfter,
  type SpinResult,
  type Tier,
} from './lottery';

export const START_CREDITS = 100;
/** Spins the machine holds while the screen is busy; a chucker hit beyond that is wasted. */
export const MAX_STOCK = 4;
/** Prize balls lying on the field when a machine is switched on. */
export const START_BALLS = 2;
/**
 * How long things take on the screen, in seconds: a spin, a quicker one when
 * spins are queueing up, the extra suspense of a reach, how long a winning
 * line stays up, the die and each hop of the piece, the time to choose a
 * chest and for it to open, the roulette, and how long a prize stays up.
 */
export const TIMING = {
  spin: 1.6,
  quickSpin: 0.9,
  reach: 1.3,
  celebrate: 1.2,
  dice: 1.3,
  hop: 0.28,
  choose: 8,
  open: 1.1,
  roulette: 5,
  prize: 2.2,
} as const;

export interface ActiveSpin {
  result: SpinResult;
  elapsed: number;
  /** When the last reel stops. A winning line then stays up for a moment. */
  duration: number;
  /** Whether the reels have stopped and the line has been counted. */
  done: boolean;
}

/** A roll on the sugoroku board: the die, then the piece hopping square by square. */
export interface ActiveSugoroku {
  kind: 'sugoroku';
  roll: number;
  from: number;
  elapsed: number;
  /** When the piece lands. The prize then stays up for a moment. */
  duration: number;
  /** Medals it paid; −1 while the piece is still on its way. */
  payout: number;
}

/** A choice of three chests: one is picked, by the player or by the clock, and opens. */
export interface ActiveChest {
  kind: 'chest';
  /** What each chest holds, left to right. */
  prizes: number[];
  /** The chest the clock picks if nobody does. */
  fallback: number;
  /** The chest that was picked; −1 until then. */
  picked: number;
  elapsed: number;
  /** When it was picked, on the game's own clock. */
  pickedAt: number;
  /** Whether the cabinet has been told of the pick. */
  told: boolean;
  /** Medals it paid; −1 until the chest has opened. */
  payout: number;
}

export type ActiveBonus = ActiveSugoroku | ActiveChest;

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
  /** Medals the machine has paid onto the field as prizes. */
  paidOut: number;
  stock: number;
  /** Chucker hits, and how many of them found the stock already full. */
  hits: number;
  wasted: number;
  jackpot: number;
  /** Medals played since the jackpot last grew. */
  jackpotProgress: number;
  spin: ActiveSpin | null;
  bonus: ActiveBonus | null;
  roulette: ActiveRoulette | null;
  /** The square the sugoroku piece stands on. */
  square: number;
  /** Balls pushed over the front whose roulette has not started yet. */
  balls: number;
  /** Roulettes started, one for every ball that went over. */
  roulettes: number;
  spins: number;
  tiers: Record<Tier, number>;
  fevers: number;
  jackpots: number;
  refills: number;
  /** Whether a chest is picked the moment it is offered, as the simulation's player does. */
  quickPick: boolean;
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
  | { type: 'spinEnd'; result: SpinResult }
  | { type: 'sugorokuStart'; roll: number; from: number }
  | { type: 'sugorokuEnd'; square: number; payout: number; fever: boolean }
  | { type: 'chestStart' }
  | { type: 'chestPicked'; chest: number }
  | { type: 'chestEnd'; chest: number; payout: number }
  | { type: 'rouletteStart'; pocket: number; duration: number }
  | { type: 'rouletteEnd'; pocket: number; payout: number; jackpot: boolean };

export interface SessionOptions {
  /** Prize balls on the field at the start. */
  balls?: number;
  /** Pick a chest at once instead of waiting for the player. */
  quickPick?: boolean;
}

export function createSession(seed: number, options: SessionOptions = {}): Session {
  return {
    machine: createMachine(seed, options.balls ?? START_BALLS),
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
    bonus: null,
    roulette: null,
    square: 0,
    balls: 0,
    roulettes: 0,
    spins: 0,
    tiers: { miss: 0, small: 0, big: 0, seven: 0 },
    fevers: 0,
    jackpots: 0,
    refills: 0,
    quickPick: options.quickPick ?? false,
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

/** Picks a chest for the player. Returns whether there was a choice to make. */
export function pickChest(session: Session, chest: number): boolean {
  const { bonus } = session;
  if (!bonus || bonus.kind !== 'chest' || bonus.picked >= 0) return false;
  if (!Number.isInteger(chest) || chest < 0 || chest >= bonus.prizes.length) return false;
  bonus.picked = chest;
  bonus.pickedAt = bonus.elapsed;
  return true;
}

/** Whether anything is still in motion on the screen or queued to drop. */
export const isBusy = (session: Session): boolean =>
  session.spin !== null ||
  session.bonus !== null ||
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

/** The seconds a roll takes from the die to the piece landing. */
export const sugorokuDuration = (roll: number): number => TIMING.dice + roll * TIMING.hop;

function advanceSugoroku(session: Session, bonus: ActiveSugoroku, dt: number, events?: SessionEvent[]): void {
  bonus.elapsed += dt;
  if (bonus.payout < 0 && bonus.elapsed >= bonus.duration) {
    session.square = squareAfter(bonus.from, bonus.roll);
    bonus.payout = BOARD[session.square];
    const fever = session.square === FEVER_SQUARE;
    if (fever) session.fevers += 1;
    pay(session, bonus.payout, false);
    events?.push({ type: 'sugorokuEnd', square: session.square, payout: bonus.payout, fever });
  }
  if (bonus.elapsed >= bonus.duration + TIMING.prize) session.bonus = null;
}

function advanceChest(session: Session, bonus: ActiveChest, dt: number, events?: SessionEvent[]): void {
  bonus.elapsed += dt;
  if (bonus.picked < 0 && (session.quickPick || bonus.elapsed >= TIMING.choose)) {
    bonus.picked = bonus.fallback;
    bonus.pickedAt = bonus.elapsed;
  }
  if (bonus.picked < 0) return;
  if (!bonus.told) {
    bonus.told = true;
    events?.push({ type: 'chestPicked', chest: bonus.picked });
  }
  if (bonus.payout < 0 && bonus.elapsed >= bonus.pickedAt + TIMING.open) {
    bonus.payout = bonus.prizes[bonus.picked];
    pay(session, bonus.payout, bonus.payout >= CHEST_TOWERS_FROM);
    events?.push({ type: 'chestEnd', chest: bonus.picked, payout: bonus.payout });
  }
  if (bonus.payout >= 0 && bonus.elapsed >= bonus.pickedAt + TIMING.open + TIMING.prize) session.bonus = null;
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

  // One thing at a time on the screen: a roulette, a bonus game, or a spin.
  const { roulette, bonus, spin } = session;
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

  if (bonus) {
    if (bonus.kind === 'sugoroku') advanceSugoroku(session, bonus, dt, events);
    else advanceChest(session, bonus, dt, events);
    return;
  }

  if (spin) {
    spin.elapsed += dt;
    const { tier } = spin.result;
    if (!spin.done && spin.elapsed >= spin.duration) {
      spin.done = true;
      session.tiers[tier] += 1;
      events?.push({ type: 'spinEnd', result: spin.result });
    }
    if (spin.elapsed < spin.duration + (tier === 'miss' ? 0 : TIMING.celebrate)) return;
    session.spin = null;
    if (tier === 'miss') return;
    // The line stays up, then the game it leads to begins.
    const leadsTo = TIER_BONUS[tier];
    if (leadsTo === 'ball') {
      dropBall(session.machine);
    } else if (leadsTo === 'sugoroku') {
      const roll = drawDie(session.machine.rng);
      session.bonus = { kind: 'sugoroku', roll, from: session.square, elapsed: 0, duration: sugorokuDuration(roll), payout: -1 };
      events?.push({ type: 'sugorokuStart', roll, from: session.square });
    } else {
      const prizes = shuffleChests(session.machine.rng);
      const fallback = Math.min(CHESTS.length - 1, Math.floor(session.machine.rng() * CHESTS.length));
      session.bonus = { kind: 'chest', prizes, fallback, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1 };
      events?.push({ type: 'chestStart' });
    }
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
