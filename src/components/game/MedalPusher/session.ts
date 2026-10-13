/**
 * A whole machine in play: the field, the credits, the chuckers' held spins,
 * the slot on the centre screen, the games it leads to, the prize balls and
 * the jackpot. Like the field it takes time as a parameter and its random
 * numbers from the machine's seeded generator, so the cabinet on screen and
 * the simulation tab run exactly the same thing.
 */

import { buildTowers, createMachine, dropBall, dropMedal, queuePayout, step, type Arm, type Machine } from './engine';
import {
  BOARD,
  BOWLS,
  CHESTS,
  CHAIN_GOAL,
  CHEST_TOWERS_FROM,
  FALLS,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  TIER_BONUS,
  drawDie,
  drawFall,
  drawPocket,
  drawSpin,
  holePays,
  pouredOf,
  shuffleChests,
  squareAfter,
  type SpinResult,
  type Tier,
} from './lottery';

export const START_CREDITS = 100;
/** Spins the machine holds while the screen is busy; a chucker hit beyond that is wasted. */
export const MAX_STOCK = 8;
/** Prize balls lying on the field when a machine is switched on. */
export const START_BALLS = 2;
/**
 * How long things take on the screen, in seconds: a spin, a quicker one when
 * spins are queueing up, the extra suspense of a reach and what a long reach
 * adds to it, how long a winning line stays up, the die and each hop of the
 * piece, the time to choose a chest and for it to open, one turn of the
 * roulette and the pause before the next, the ball's time in the top bowl,
 * and how long a prize stays up. Then the challenge's own: the ball's time in
 * the middle bowl and in the bottom one, each from the moment it drops out of
 * the bowl above; how long a prize from one of the upper bowls stays up while
 * it is counted out; and how long the jackpot does.
 */
export const TIMING = {
  spin: 1.6,
  quickSpin: 0.9,
  reach: 1.3,
  longReach: 1.6,
  celebrate: 1.2,
  dice: 1.3,
  hop: 0.28,
  choose: 8,
  open: 1.1,
  roulette: 2.8,
  step: 1.1,
  bowl: 6.5,
  prize: 2.2,
  bowlMiddle: 6,
  bowlLast: 4.2,
  bowlPrize: 3.6,
  jackpot: 8,
} as const;

/** The seconds the ball spends in each bowl, the top one first. */
export const BOWL_TIMES: readonly number[] = [TIMING.bowl, TIMING.bowlMiddle, TIMING.bowlLast];

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

/**
 * The jackpot challenge a full run ends in: three bowls, one under another.
 * The ball rolls round a bowl and drops into one of its holes, which lets it
 * down into the bowl below or ends the challenge with a prize. The whole way
 * down is drawn before the ball is let go.
 */
export interface ActiveBowl {
  /** The hole the ball takes in each bowl it gets to, the top bowl's first. The last of them holds its prize. */
  holes: number[];
  /** The bowl the ball is in, counted from the top. */
  stage: number;
  /** Seconds since the ball came into this bowl, and how long it rolls there before it drops. */
  elapsed: number;
  duration: number;
  /** Medals the challenge paid; −1 while the ball is still on its way. */
  payout: number;
}

/**
 * The roulette a ball starts: a run of turns. Each turn the light goes round
 * and stops on a pocket. A number is stacked on the pusher as a tower and the
 * roulette turns again; a cross ends the run; enough numbers in a row send the
 * ball into the bowls, with the jackpot at the bottom of them.
 */
export interface ActiveRoulette {
  /** Index of the pocket this turn will stop on, and of the one the light set off from. */
  pocket: number;
  from: number;
  /** Seconds into this turn, and how long the light takes to stop. */
  elapsed: number;
  duration: number;
  /** Whether this turn's pocket has been reached and paid. */
  landed: boolean;
  /** Numbers in a row so far, and the medals the run has paid, the bowls' prize included. */
  level: number;
  total: number;
  /** Medals the last pocket paid: its number, or 0 for a cross. Once the ball has dropped into its last hole, what that paid. */
  gain: number;
  /** Whether the run has ended, and whether it ended in the jackpot. */
  over: boolean;
  jackpot: boolean;
  /** The ball in the bowls, once the run is complete. */
  bowl: ActiveBowl | null;
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
  | { type: 'rouletteStep'; pocket: number; medals: number; level: number }
  | { type: 'rouletteEnd'; total: number; level: number }
  | { type: 'bowlStart'; holes: readonly number[]; duration: number }
  | { type: 'bowlEnd'; bowl: number; hole: number; payout: number; poured: number; total: number; jackpot: boolean }
  | { type: 'bowlDrop'; bowl: number; hole: number; duration: number };

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

/**
 * Feeds one of the player's medals into an arm, the left (0) or the right (1), wherever that arm is pointed.
 * Returns whether the machine took it: the purse has to hold a medal, and that arm's slot has to be free.
 */
export function insert(session: Session, arm: Arm): boolean {
  if (session.credits <= 0) return false;
  if (!dropMedal(session.machine, arm)) return false;
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

/** Whether anything is still in motion on the screen, on an arm, or queued to drop. */
export const isBusy = (session: Session): boolean =>
  session.spin !== null ||
  session.bonus !== null ||
  session.roulette !== null ||
  session.stock > 0 ||
  session.balls > 0 ||
  session.machine.payoutQueue > 0 ||
  session.machine.growing > 0 ||
  session.machine.rolling.length > 0 ||
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

/** The seconds of suspense a spin's reach adds before the centre reel stops: none, the usual, or the long one. */
export const reachTime = (result: SpinResult): number => (result.reach ? TIMING.reach + (result.reachKind === 'long' ? TIMING.longReach : 0) : 0);

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

/** Lets the ball go in the top bowl. The whole way down is drawn here, before it moves. */
function startBowl(session: Session, roulette: ActiveRoulette, events?: SessionEvent[]): void {
  const holes = [...FALLS[drawFall(session.machine.rng)]];
  roulette.bowl = { holes, stage: 0, elapsed: 0, duration: BOWL_TIMES[0], payout: -1 };
  roulette.gain = 0;
  events?.push({ type: 'bowlStart', holes, duration: BOWL_TIMES[0] });
}

/** How long what the bowls paid stays up: the jackpot is counted out for longer than a prize from one of the upper bowls. */
export const bowlShowTime = (jackpot: boolean): number => (jackpot ? TIMING.jackpot : TIMING.bowlPrize);

/**
 * The ball rolls round the bowl it is in and drops into its hole. A hole that
 * leads down puts it in the bowl below, where its time starts again. Any
 * other pays what it holds, part of it poured onto the field loose and the
 * rest stacked as towers, and with that the run is over.
 */
function advanceBowl(session: Session, roulette: ActiveRoulette, bowl: ActiveBowl, dt: number, events?: SessionEvent[]): void {
  bowl.elapsed += dt;
  if (bowl.payout < 0 && bowl.elapsed >= bowl.duration) {
    const taken = bowl.holes[bowl.stage];
    const hole = BOWLS[bowl.stage][taken];
    if (hole === 'down') {
      bowl.stage += 1;
      bowl.elapsed = 0;
      bowl.duration = BOWL_TIMES[bowl.stage];
      events?.push({ type: 'bowlDrop', bowl: bowl.stage, hole: taken, duration: bowl.duration });
      return;
    }
    bowl.payout = holePays(hole, session.jackpot);
    roulette.gain = bowl.payout;
    roulette.total += bowl.payout;
    roulette.over = true;
    roulette.jackpot = hole === 'jackpot';
    const poured = pouredOf(bowl.payout);
    pay(session, bowl.payout - poured, true);
    pay(session, poured, false);
    if (roulette.jackpot) {
      session.jackpots += 1;
      session.jackpot = JACKPOT_START;
      session.jackpotProgress = 0;
    }
    events?.push({ type: 'bowlEnd', bowl: bowl.stage, hole: taken, payout: bowl.payout, poured, total: roulette.total, jackpot: roulette.jackpot });
  }
  if (bowl.payout >= 0 && bowl.elapsed >= bowl.duration + bowlShowTime(roulette.jackpot)) session.roulette = null;
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

  // One thing at a time on the screen, and nothing that has started is cut short.
  // A winning line and the game it leads to are one turn: the game follows its
  // line at once, even if a ball has gone over in the meantime. When the screen
  // is free, a ball's roulette comes next, and only then a held spin.
  const { roulette, bonus, spin } = session;
  if (roulette?.bowl) {
    advanceBowl(session, roulette, roulette.bowl, dt, events);
    return;
  }
  if (roulette) {
    roulette.elapsed += dt;
    if (!roulette.landed && roulette.elapsed >= roulette.duration) {
      roulette.landed = true;
      const pocket = ROULETTE[roulette.pocket];
      if (pocket === 'stop') {
        roulette.gain = 0;
        roulette.over = true;
      } else {
        // The number goes up on the pusher as a tower straight away.
        roulette.level += 1;
        roulette.gain = pocket;
        roulette.total += pocket;
        pay(session, pocket, true);
        events?.push({ type: 'rouletteStep', pocket: roulette.pocket, medals: pocket, level: roulette.level });
      }
      if (roulette.over) events?.push({ type: 'rouletteEnd', total: roulette.total, level: roulette.level });
    }
    if (roulette.landed) {
      if (roulette.over) {
        if (roulette.elapsed >= roulette.duration + TIMING.prize) session.roulette = null;
      } else if (roulette.elapsed >= roulette.duration + TIMING.step) {
        if (roulette.level >= CHAIN_GOAL) {
          // A full run: the ball goes into the top bowl.
          startBowl(session, roulette, events);
          return;
        }
        // The light sets off again from where it stopped.
        roulette.from = roulette.pocket;
        roulette.pocket = drawPocket(session.machine.rng);
        roulette.elapsed = 0;
        roulette.landed = false;
        roulette.gain = 0;
      }
    }
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
    // The line stays up, then the game it leads to begins. A roulette that is
    // waiting on a ball waits for that game too, so the screen never announces
    // one game and plays another.
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

  // The screen is free. A ball that has gone over the front has its roulette before any held spin.
  if (session.balls > 0) {
    session.balls -= 1;
    session.roulettes += 1;
    const pocket = drawPocket(session.machine.rng);
    session.roulette = { pocket, from: 0, elapsed: 0, duration: TIMING.roulette, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false, bowl: null };
    events?.push({ type: 'rouletteStart', pocket, duration: TIMING.roulette });
    return;
  }

  if (session.stock > 0) {
    session.stock -= 1;
    session.spins += 1;
    const result = drawSpin(session.machine.rng);
    // With spins queueing behind it, the reels hurry.
    const duration = (session.stock >= 2 ? TIMING.quickSpin : TIMING.spin) + reachTime(result);
    session.spin = { result, elapsed: 0, duration, done: false };
    events?.push({ type: 'spinStart', result, duration });
  }
}
