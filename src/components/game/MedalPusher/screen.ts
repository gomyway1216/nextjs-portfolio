/**
 * What the centre screen shows at a given moment of a spin or of the roulette.
 * The session has already drawn the result; these only say how far the show
 * has got, so the reels and the lamps can be drawn from the session's clock.
 */

import { BOARD, CHEST_TOWERS_FROM, FEVER_SQUARE, ROULETTE, squareAfter, type Tier } from './lottery';
import { TIMING, reachTime, type ActiveRoulette, type ActiveSpin, type ActiveSugoroku, type Session } from './session';

/** The digits on a reel, in the order they come round. */
export const REEL_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** When each reel stops, as a share of the spin without its reach: left, then right. The centre goes last. */
const STOP = { left: 0.45, right: 0.75 } as const;
/**
 * Digits a second while a reel runs, while the centre holds a reach and while
 * it crawls to the end of a long one, and the seconds each takes to ease onto its digit.
 */
const SPEED = { fast: 15, slow: 6, crawl: 2.6 } as const;
const EASE = { fast: 0.22, slow: 0.7, crawl: 1 } as const;
/** The seconds the centre reel takes to drop from one speed to the next as a reach sets in. */
const SHIFT = 0.25;
/** How far past its digit a reel swings as it stops, in digits, and the seconds it takes to swing out and settle back. */
export const SWING = { past: 0.12, time: 0.18 } as const;
/** The speed a reel still has as it reaches its digit: just enough to carry it SWING.past beyond. A slow reel arrives with less. */
const KICK = (27 * SWING.past) / (4 * SWING.time);
/** A reel is too fast to read, and is drawn blurred, from this many digits a second. */
const BLUR_FROM = 10;

/** The moment each reel stops, in seconds from the start of the spin: left, centre, right. */
export function stopTimes(spin: ActiveSpin): [number, number, number] {
  const plain = spin.duration - reachTime(spin.result);
  return [plain * STOP.left, spin.duration, plain * STOP.right];
}

/**
 * The moment each reel lands on its digit: a beat before it stops, which it
 * spends swinging a little past the digit and back. This is when a reel is heard to stop.
 */
export function landTimes(spin: ActiveSpin): [number, number, number] {
  return stopTimes(spin).map((stop) => stop - SWING.time) as [number, number, number];
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
 * One stretch of a reel's run, told backwards from the moment it lands on its
 * digit. Until `from + ease` seconds before that moment the reel runs `gain`
 * digits a second faster than it does afterwards; it sheds that evenly over
 * the next `ease` seconds, and has shed it all with `from` seconds to go.
 */
interface Stretch {
  from: number;
  ease: number;
  gain: number;
}

/** How a reel comes to its digit: the speed it arrives with, the stretches before that, and the seconds it has left to get there. */
interface Run {
  kick: number;
  stretches: Stretch[];
  left: number;
}

/**
 * The run of one reel. The outer reels run fast and ease onto their digit. On
 * a reach the centre runs with them until the right reel has stopped, then
 * holds back; on a long reach it drops again to a crawl for the last of it.
 */
function reelRun(spin: ActiveSpin, reel: number): Run {
  const stops = stopTimes(spin);
  // A reel lands on its digit a beat before it stops.
  const land = stops[reel] - SWING.time;
  const held = reel === 1 && spin.result.reach;
  const long = held && spin.result.reachKind === 'long';
  const last = long ? 'crawl' : held ? 'slow' : 'fast';
  // It never arrives with more than half the speed it came at, so a slow reel swings less far past.
  const kick = Math.min(KICK, SPEED[last] / 2);
  const stretches: Stretch[] = [{ from: 0, ease: EASE[last], gain: SPEED[last] - kick }];
  if (long) stretches.push({ from: TIMING.longReach - SWING.time - SHIFT, ease: SHIFT, gain: SPEED.slow - SPEED.crawl });
  if (held) stretches.push({ from: land - stops[2] - SHIFT, ease: SHIFT, gain: SPEED.fast - SPEED.slow });
  return { kick, stretches, left: land - spin.elapsed };
}

/** Digits a second a reel on this run is doing; 0 once it has reached its digit. */
function runSpeed({ kick, stretches, left }: Run): number {
  if (left <= 0) return 0;
  return stretches.reduce((speed, { from, ease, gain }) => speed + gain * Math.min(1, Math.max(0, (left - from) / ease)), kick);
}

/** Digits a reel on this run still has to go by before it reaches its digit. */
function runDistance({ kick, stretches, left }: Run): number {
  if (left <= 0) return 0;
  return stretches.reduce((distance, { from, ease, gain }) => distance + travel(left - from, gain, ease), kick * left);
}

/**
 * How far past its digit a reel stands `since` seconds after reaching it at
 * `speed` digits a second: it swings out, then back, and from SWING.time on
 * it is at rest exactly on the digit.
 */
export function settleOffset(since: number, speed: number): number {
  if (since <= 0 || since >= SWING.time) return 0;
  const progress = since / SWING.time;
  // Leaves at the speed it came with and is back, at rest, at the end; furthest out a third of the way through.
  return speed * SWING.time * progress * (1 - progress) ** 2;
}

/**
 * Where each reel stands, as a position along REEL_DIGITS (0 shows the first
 * digit, 0.5 is halfway to the second), wrapped into the strip. A reel that
 * has stopped is exactly on its digit.
 */
export function reelPositions(spin: ActiveSpin): [number, number, number] {
  const stops = stopTimes(spin);
  const count = REEL_DIGITS.length;
  return spin.result.digits.map((digit, reel) => {
    const home = REEL_DIGITS.indexOf(digit as (typeof REEL_DIGITS)[number]);
    if (spin.elapsed >= stops[reel]) return home;
    const run = reelRun(spin, reel);
    // Still on its way, or swinging a little past its digit and back onto it.
    const ahead = run.left > 0 ? -runDistance(run) : settleOffset(-run.left, run.kick);
    return (((home + ahead) % count) + count) % count;
  }) as [number, number, number];
}

/** Whether each reel is still running too fast to read. The cabinet marks those reels so that they are drawn blurred. */
export function reelsFast(spin: ActiveSpin): [boolean, boolean, boolean] {
  return spin.result.digits.map((_, reel) => runSpeed(reelRun(spin, reel)) >= BLUR_FROM) as [boolean, boolean, boolean];
}

/** Whether each reel has still to stop. When nothing may move, the cabinet dims those reels instead of turning them. */
export function reelsWaiting(spin: ActiveSpin): [boolean, boolean, boolean] {
  const stops = stopTimes(spin);
  return stops.map((stop) => !spin.done && spin.elapsed < stop) as [boolean, boolean, boolean];
}

/**
 * The digits the reels show when nothing may move: each reel keeps the digit
 * it had `before` until the moment it would have stopped, then shows its own.
 */
export function stoppedDigits(spin: ActiveSpin, before: readonly number[]): [number, number, number] {
  const waiting = reelsWaiting(spin);
  return spin.result.digits.map((digit, reel) => (waiting[reel] ? before[reel] : digit)) as [number, number, number];
}

/** How many times the light goes round before it settles, and the share of the time it takes to get there. */
const LAPS = 2;
const SETTLE = 0.86;

/** The pocket the roulette's light is on. It slows as it goes and ends on the pocket already drawn. */
export function roulettePocket(roulette: ActiveRoulette): number {
  const count = ROULETTE.length;
  const progress = Math.min(1, Math.max(0, roulette.elapsed / (roulette.duration * SETTLE)));
  // From the pocket it set off from, round twice and on to the one that was drawn.
  const steps = LAPS * count + ((roulette.pocket - roulette.from + count) % count);
  return (roulette.from + Math.floor(steps * (1 - (1 - progress) ** 3) + 1e-9)) % count;
}

/** Whether the light has reached its pocket and is only holding there. */
export const rouletteSettled = (roulette: ActiveRoulette): boolean => roulette.elapsed >= roulette.duration * SETTLE;

// ── What the whole screen shows ─────────────────────────────────────────────

export type ScreenMode = 'slot' | 'sugoroku' | 'chest' | 'roulette';
/** The headline across the screen: nothing, a reach or a long one, a winning line, or a prize and the way it is paid. */
export type Banner = 'none' | 'reach' | 'superReach' | 'line' | 'ball' | 'medals' | 'towers' | 'fever' | 'finish' | 'jackpot';

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
  /** The roulette's run: numbers in a row so far, and the medals it has stacked. */
  level: number;
  total: number;
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
    level: 0,
    total: 0,
  };
  const { roulette, bonus, spin } = session;
  if (roulette) {
    const run = { ...idle, mode: 'roulette' as const, level: roulette.level, total: roulette.total };
    if (!roulette.landed) return { ...run, lit: calm ? -1 : roulettePocket(roulette) };
    // A number is a tower going up; the end of the run is the jackpot or the total it built.
    if (roulette.jackpot) return { ...run, lit: roulette.pocket, banner: 'jackpot', amount: roulette.gain };
    if (roulette.over) return { ...run, lit: roulette.pocket, banner: 'finish', amount: roulette.total };
    return { ...run, lit: roulette.pocket, banner: 'towers', amount: roulette.gain };
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
    // A reach is called with or without motion: the words stay, and only what moves round them is left out.
    if (inReach(spin)) return { ...idle, banner: spin.result.reachKind === 'long' ? 'superReach' : 'reach' };
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
    a.secondsLeft !== b.secondsLeft ||
    a.level !== b.level ||
    a.total !== b.total
  ) {
    return false;
  }
  if (a.chests === null || b.chests === null) return a.chests === b.chests;
  return a.chests.every((chest, index) => chest.state === b.chests?.[index].state && chest.prize === b.chests?.[index].prize);
}

/** The medals written on each square of the board, for drawing it. */
export const BOARD_SQUARES: readonly number[] = BOARD;
