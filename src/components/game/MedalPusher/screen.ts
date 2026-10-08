/**
 * What the centre screen shows at a given moment of a spin or of the roulette.
 * The session has already drawn the result; these only say how far the show
 * has got, so the reels and the lamps can be drawn from the session's clock.
 */

import { BOARD, CHEST_TOWERS_FROM, FEVER_SQUARE, ROULETTE, TOWERS_FROM, squareAfter, type Tier } from './lottery';
import { TIMING, type ActiveRoulette, type ActiveSpin, type ActiveSugoroku, type Session } from './session';

/** The digits on a reel, in the order they come round. */
export const REEL_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** When each reel stops, as a share of the spin without its reach: left, then right. The centre goes last. */
const STOP = { left: 0.45, right: 0.75 } as const;
/** Digits a second while a reel runs, and the seconds it takes to ease onto its digit. */
const SPEED = { fast: 15, slow: 6 } as const;
const EASE = { fast: 0.22, slow: 0.7 } as const;

/** The moment each reel stops, in seconds from the start of the spin: left, centre, right. */
export function stopTimes(spin: ActiveSpin): [number, number, number] {
  const plain = spin.duration - (spin.result.reach ? TIMING.reach : 0);
  return [plain * STOP.left, spin.duration, plain * STOP.right];
}

/** Whether the outer reels have stopped alike and the centre is still to decide it. */
export function inReach(spin: ActiveSpin): boolean {
  return spin.result.reach && spin.elapsed >= stopTimes(spin)[2] && spin.elapsed < spin.duration;
}

/** Digits still to go by before a reel that stops in `left` seconds is home. */
function travel(left: number, speed: number, ease: number): number {
  if (left <= 0) return 0;
  // Full speed until the last `ease` seconds, then slowing evenly to a stop.
  return left > ease ? speed * (left - ease / 2) : (speed * left * left) / (2 * ease);
}

/**
 * Where each reel stands, as a position along REEL_DIGITS (0 shows the first
 * digit, 0.5 is halfway to the second), wrapped into the strip.
 */
export function reelPositions(spin: ActiveSpin): [number, number, number] {
  const stops = stopTimes(spin);
  const count = REEL_DIGITS.length;
  return spin.result.digits.map((digit, reel) => {
    // On a reach the centre reel slows down for the suspense.
    const slow = reel === 1 && spin.result.reach;
    const behind = travel(stops[reel] - spin.elapsed, slow ? SPEED.slow : SPEED.fast, slow ? EASE.slow : EASE.fast);
    const home = REEL_DIGITS.indexOf(digit as (typeof REEL_DIGITS)[number]);
    return (((home - behind) % count) + count) % count;
  }) as [number, number, number];
}

/** How many times the light goes round before it settles, and the share of the time it takes to get there. */
const LAPS = 3;
const SETTLE = 0.86;

/** The pocket the roulette's light is on. It slows as it goes and ends on the pocket already drawn. */
export function roulettePocket(roulette: ActiveRoulette): number {
  const count = ROULETTE.length;
  const progress = Math.min(1, Math.max(0, roulette.elapsed / (roulette.duration * SETTLE)));
  const steps = LAPS * count + roulette.pocket;
  return Math.floor(steps * (1 - (1 - progress) ** 3) + 1e-9) % count;
}

/** Whether the light has reached its pocket and is only holding there. */
export const rouletteSettled = (roulette: ActiveRoulette): boolean => roulette.elapsed >= roulette.duration * SETTLE;

// ── What the whole screen shows ─────────────────────────────────────────────

export type ScreenMode = 'slot' | 'sugoroku' | 'chest' | 'roulette';
/** The headline across the screen: nothing, a reach, a winning line, or a prize and the way it is paid. */
export type Banner = 'none' | 'reach' | 'line' | 'ball' | 'medals' | 'towers' | 'fever' | 'jackpot';

export interface ChestView {
  state: 'closed' | 'picked' | 'open';
  /** What it held, once it is open. */
  prize: number | null;
  /** Whether this is the chest that was picked. */
  chosen: boolean;
}

export interface ScreenState {
  mode: ScreenMode;
  banner: Banner;
  /** Medals the banner announces. */
  amount: number;
  /** The winning line that is up on the reels, if one is. */
  line: Exclude<Tier, 'miss'> | null;
  /** The pocket the roulette's light is on, or −1. */
  lit: number;
  /** The square the sugoroku piece is drawn on. */
  square: number;
  /** The face the die shows; 0 when there is no die. */
  die: number;
  /** Whether the die is still tumbling. */
  rolling: boolean;
  chests: ChestView[] | null;
  /** Whole seconds left to pick a chest. */
  secondsLeft: number;
}

/** How long the die tumbles before it shows what was rolled, as a share of its time on screen. */
const TUMBLE = 0.72;
/** Faces a second while it tumbles. */
const TUMBLE_RATE = 13;

/** The square the piece has hopped to so far. */
export function sugorokuSquare(bonus: ActiveSugoroku): number {
  if (bonus.payout >= 0) return squareAfter(bonus.from, bonus.roll);
  const hops = Math.min(bonus.roll, Math.max(0, Math.floor((bonus.elapsed - TIMING.dice) / TIMING.hop + 1e-9)));
  return squareAfter(bonus.from, hops);
}

/** What the screen shows for the session as it stands. `calm` leaves out the motion that only decorates. */
export function screenState(session: Session, calm: boolean): ScreenState {
  const idle: ScreenState = {
    mode: 'slot',
    banner: 'none',
    amount: 0,
    line: null,
    lit: -1,
    square: session.square,
    die: 0,
    rolling: false,
    chests: null,
    secondsLeft: 0,
  };
  const { roulette, bonus, spin } = session;
  if (roulette) {
    if (roulette.payout < 0) return { ...idle, mode: 'roulette', lit: calm ? -1 : roulettePocket(roulette) };
    const jackpot = ROULETTE[roulette.pocket] === 'jackpot';
    const banner: Banner = jackpot ? 'jackpot' : roulette.payout >= TOWERS_FROM ? 'towers' : 'medals';
    return { ...idle, mode: 'roulette', lit: roulette.pocket, banner, amount: roulette.payout };
  }
  if (bonus?.kind === 'sugoroku') {
    const square = sugorokuSquare(bonus);
    if (bonus.payout >= 0) {
      return { ...idle, mode: 'sugoroku', square, die: bonus.roll, banner: square === FEVER_SQUARE ? 'fever' : 'medals', amount: bonus.payout };
    }
    const rolling = !calm && bonus.elapsed < TIMING.dice * TUMBLE;
    const die = rolling ? 1 + (Math.floor(bonus.elapsed * TUMBLE_RATE) % 6) : calm && bonus.elapsed < TIMING.dice * TUMBLE ? 0 : bonus.roll;
    return { ...idle, mode: 'sugoroku', square: calm ? bonus.from : square, die, rolling };
  }
  if (bonus?.kind === 'chest') {
    const opened = bonus.payout >= 0;
    const chests: ChestView[] = bonus.prizes.map((prize, index) => ({
      state: opened ? 'open' : index === bonus.picked ? 'picked' : 'closed',
      prize: opened ? prize : null,
      chosen: index === bonus.picked,
    }));
    const secondsLeft = bonus.picked < 0 ? Math.max(0, Math.ceil(TIMING.choose - bonus.elapsed)) : 0;
    const banner: Banner = !opened ? 'none' : bonus.payout >= CHEST_TOWERS_FROM ? 'towers' : 'medals';
    return { ...idle, mode: 'chest', chests, secondsLeft, banner, amount: Math.max(0, bonus.payout) };
  }
  if (spin) {
    const { tier } = spin.result;
    if (spin.done && tier !== 'miss') return { ...idle, line: tier, banner: tier === 'seven' ? 'ball' : 'line' };
    if (!calm && inReach(spin)) return { ...idle, banner: 'reach' };
  }
  return idle;
}

/** Whether two states would draw the same screen. */
export function sameScreen(a: ScreenState, b: ScreenState): boolean {
  if (
    a.mode !== b.mode ||
    a.banner !== b.banner ||
    a.amount !== b.amount ||
    a.line !== b.line ||
    a.lit !== b.lit ||
    a.square !== b.square ||
    a.die !== b.die ||
    a.rolling !== b.rolling ||
    a.secondsLeft !== b.secondsLeft
  ) {
    return false;
  }
  if (a.chests === null || b.chests === null) return a.chests === b.chests;
  return a.chests.every((chest, index) => chest.state === b.chests?.[index].state && chest.prize === b.chests?.[index].prize);
}

/** The medals written on each square of the board, for drawing it. */
export const BOARD_SQUARES: readonly number[] = BOARD;
