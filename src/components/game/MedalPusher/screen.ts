/**
 * What the centre screen shows at a given moment of a spin or of the roulette.
 * The session has already drawn the result; these only say how far the show
 * has got, so the reels and the lamps can be drawn from the session's clock.
 */

import { BOARD, BOWL, CHEST_TOWERS_FROM, FEVER_SQUARE, ROULETTE, squareAfter, type Tier } from './lottery';
import { TIMING, type ActiveBowl, type ActiveRoulette, type ActiveSpin, type ActiveSugoroku, type Session } from './session';

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

// ── The ball in the bowl ────────────────────────────────────────────────────

/**
 * The bowl seen from above, as a disc of radius 1: the circle the ball runs
 * round under the rim, the ring the holes' centres lie on, the size of a
 * hole, and how far outside a hole's centre the ball rolls by on its lip.
 */
export const BOWL_SHAPE = { rim: 0.86, ring: 0.4, hole: 0.16, lip: 0.18 } as const;

/** A point of the bowl, from its centre: x to the right, y down the screen. */
export interface BowlPoint {
  x: number;
  y: number;
}

/** Where the ball is, and how far it has sunk into its hole: 0 while it rolls, 1 once it has dropped. */
export interface BallSpot extends BowlPoint {
  sunk: number;
}

/** The point `radius` from the centre, `turn` turns clockwise from the top. */
const bowlPoint = (radius: number, turn: number): BowlPoint => ({
  x: radius * Math.sin(turn * 2 * Math.PI),
  y: -radius * Math.cos(turn * 2 * Math.PI),
});

/** Where a hole lies, in turns clockwise from the top: they are evenly spaced, the first at the top. */
const holeTurn = (hole: number): number => hole / BOWL.length;

/** The centre of a hole. */
export const holeSpot = (hole: number): BowlPoint => bowlPoint(BOWL_SHAPE.ring, holeTurn(hole));

/** Where the ball is let go, in turns clockwise from the top, and the whole laps it makes before it heads for its hole. */
const LET_GO = 1 / 6;
const BALL_LAPS = 4;
/** How sharply the ball slows: the higher, the faster it sets off and the longer it crawls at the end. */
const SLOWING = 1.8;
/**
 * The shares of its roll after which the ball leaves the rim, begins to feel
 * the holes, and is down among them.
 */
const ROLL = { rim: 0.2, nearing: 0.48, holes: 0.6 } as const;
/** The share of its pace the ball loses on the lip of a hole, and gains again between two. */
const HESITATE = 0.6;
/** The share of its time the ball takes, at the very end, to tip off the lip into its hole. */
const TIP = 0.06;

/** 0 to 1 with no jolt at either end. */
const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** The moment the ball tips off the lip into its hole, in seconds after it was let go. */
export const ballTipsAt = (duration: number = TIMING.bowl): number => duration * (1 - TIP);

/**
 * Where the ball is `elapsed` seconds after it was let go, on its way to the
 * hole already drawn. It circles under the rim, spirals in as it slows,
 * hesitates on the lip of each hole it passes, comes to rest on the lip of
 * its own and tips in. It never moves away from the centre, and from
 * `duration` on it lies exactly on its hole.
 */
export function bowlBall(elapsed: number, hole: number, duration: number = TIMING.bowl): BallSpot {
  const { rim, ring, lip } = BOWL_SHAPE;
  const home = holeTurn(hole);
  if (elapsed >= duration) return { ...holeSpot(hole), sunk: 1 };
  const rolling = ballTipsAt(duration);
  if (elapsed >= rolling) {
    // Off the lip and down, faster as it goes.
    const fallen = ((elapsed - rolling) / (duration - rolling)) ** 2;
    return { ...bowlPoint(ring + lip * (1 - fallen), home), sunk: fallen };
  }
  const progress = Math.max(0, elapsed) / rolling;
  // Round `BALL_LAPS` times and on to the lip of its hole, slowing all the way.
  const turns = BALL_LAPS + ((((home - LET_GO) % 1) + 1) % 1);
  const even = LET_GO + turns * (1 - (1 - progress) ** SLOWING);
  // Once it is down among the holes it lingers over each and hurries between them. The holes are
  // where this sine is zero, so it shifts the ball along its way without moving where it ends.
  const among = smooth((progress - ROLL.nearing) / (ROLL.holes - ROLL.nearing));
  const turn = even - (HESITATE * among * Math.sin(even * BOWL.length * 2 * Math.PI)) / (BOWL.length * 2 * Math.PI);
  const radius = rim - (rim - ring - lip) * smooth((progress - ROLL.rim) / (ROLL.holes - ROLL.rim));
  return { ...bowlPoint(radius, turn), sunk: 0 };
}

/**
 * Where the cabinet draws the ball of a challenge in play. With `calm` it does
 * not roll: it waits where it was let go and is in its hole once it has dropped.
 */
export function ballSpot(bowl: ActiveBowl, calm: boolean): BallSpot {
  return bowlBall(calm && bowl.payout < 0 ? 0 : bowl.elapsed, bowl.hole, bowl.duration);
}

// ── What the whole screen shows ─────────────────────────────────────────────

export type ScreenMode = 'slot' | 'sugoroku' | 'chest' | 'roulette' | 'bowl';
/** The headline across the screen: nothing, a reach, a winning line, or a prize and the way it is paid. */
export type Banner = 'none' | 'reach' | 'line' | 'ball' | 'medals' | 'towers' | 'fever' | 'finish' | 'jackpot';

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
  /** The hole the bowl's ball has dropped into, or −1. */
  hole: number;
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

/** The jackpot challenge: the bowl while the ball rolls, then the hole it dropped into and what that paid. */
function bowlState(run: ScreenState, roulette: ActiveRoulette, bowl: ActiveBowl): ScreenState {
  const state: ScreenState = { ...run, mode: 'bowl', lit: -1 };
  if (bowl.payout < 0) return state;
  return { ...state, hole: bowl.hole, banner: roulette.jackpot ? 'jackpot' : 'towers', amount: bowl.payout };
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
    hole: -1,
  };
  const { roulette, bonus, spin } = session;
  if (roulette) {
    const run = { ...idle, mode: 'roulette' as const, level: roulette.level, total: roulette.total };
    if (roulette.bowl) return bowlState(run, roulette, roulette.bowl);
    if (!roulette.landed) return { ...run, lit: calm ? -1 : roulettePocket(roulette) };
    // A number is a tower going up; a cross ends the run on the total it built.
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
    a.secondsLeft !== b.secondsLeft ||
    a.level !== b.level ||
    a.total !== b.total ||
    a.hole !== b.hole
  ) {
    return false;
  }
  if (a.chests === null || b.chests === null) return a.chests === b.chests;
  return a.chests.every((chest, index) => chest.state === b.chests?.[index].state && chest.prize === b.chests?.[index].prize);
}

/** The medals written on each square of the board, for drawing it. */
export const BOARD_SQUARES: readonly number[] = BOARD;
