/**
 * What the centre screen shows at a given moment of a spin or of the roulette.
 * The session has already drawn the result; these only say how far the show
 * has got, so the reels and the lamps can be drawn from the session's clock.
 */

import { BOARD, BOWLS, CHEST_TOWERS_FROM, FEVER_SQUARE, ROULETTE, squareAfter, type Tier } from './lottery';
import { TIMING, reachTime, type ActiveBowl, type ActiveRoulette, type ActiveSpin, type ActiveSugoroku, type Session } from './session';

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

// ── The ball in the bowls ───────────────────────────────────────────────────

/**
 * A bowl seen from above, as a disc of radius 1: the circle the ball runs
 * round under the rim, the ring the holes' centres lie on, the size of a
 * hole, and how far outside a hole's centre the ball rolls by on its lip.
 * `drop` is how far below one bowl's floor the next bowl's is. The bottom
 * bowl is a funnel with its one hole, `last` across, in the middle.
 */
export const BOWL_SHAPE = { rim: 0.86, ring: 0.4, hole: 0.16, lip: 0.18, drop: 2.1, last: 0.22 } as const;

/** A point of a bowl, from its centre: x to the right, y down the screen. */
export interface BowlPoint {
  x: number;
  y: number;
}

/**
 * Where the ball is: which bowl it is in, counted from the top, where in it,
 * how far above its floor while it is still falling in from the bowl above,
 * and how far it has sunk into its hole: 0 while it rolls, 1 once it has dropped.
 */
export interface BallSpot extends BowlPoint {
  bowl: number;
  lift: number;
  sunk: number;
}

/** The point `radius` from the centre, `turn` turns clockwise from the top. */
const bowlPoint = (radius: number, turn: number): BowlPoint => ({
  x: radius * Math.sin(turn * 2 * Math.PI),
  y: -radius * Math.cos(turn * 2 * Math.PI),
});

/**
 * Where the first hole of each bowl lies, in turns clockwise from the top.
 * The top bowl's three start at the far side; the middle bowl's two are to
 * the right and the left, so that neither hides the other.
 */
const FIRST_HOLE: readonly number[] = [0, 0.25, 0];

/** Where a hole lies, in turns clockwise from the top: a bowl's holes are evenly spaced. */
const holeTurn = (hole: number, bowl: number): number => FIRST_HOLE[bowl] + hole / BOWLS[bowl].length;
/** How far from the middle of its bowl a hole is. Only the bottom bowl's is in the middle. */
const holeRing = (bowl: number): number => (BOWLS[bowl].length > 1 ? BOWL_SHAPE.ring : 0);

/** The centre of a hole of a bowl; of the top bowl, when no other is named. */
export const holeSpot = (hole: number, bowl = 0): BowlPoint => bowlPoint(holeRing(bowl), holeTurn(hole, bowl));

/**
 * Where the ball comes into each bowl, in turns clockwise from the top, and
 * the whole laps it makes there before it heads for its hole. The machine
 * lets it go at the far side of the top bowl. Into the bowls below it comes
 * at the front, on the player's side, where the bowl above is not in the way
 * and its fall can be seen.
 */
const LET_GO: readonly number[] = [1 / 6, 0.4, 0.4];
const BALL_LAPS: readonly number[] = [4, 3, 4];
/** How sharply the ball slows: the higher, the faster it sets off and the longer it crawls at the end. */
const SLOWING = 1.8;
/**
 * The shares of its roll after which the ball leaves the rim, begins to feel
 * the holes, and is down among them.
 */
const ROLL = { rim: 0.2, nearing: 0.48, holes: 0.6 } as const;
/** The share of its pace the ball loses on the lip of a hole, and gains again between two: in the top bowl, and in the middle one. */
const HESITATE: readonly number[] = [0.6, 0.78];
/** The share of its time the ball takes, at the very end, to tip off the lip into its hole. */
const TIP = 0.06;
/** The seconds the ball takes to fall from a hole into the bowl below. */
export const BALL_FALL = 0.75;
/** The share of that fall in which the ball, drawn smaller while it was down its hole, is its own size again; it is under the bowl above all that while. */
const OUT_OF_HOLE = 0.4;
/**
 * The near miss in the middle bowl. On its last pass of the other hole the
 * ball leans in over it by this share of the lip, sinking by `sink` as it
 * does, for about `width` turns either side, and then rolls on to its own.
 */
const TEETER = { lean: 0.62, sink: 0.3, width: 0.06 } as const;
/** In the funnel the ball turns faster as it closes on the middle: the share of its turns it would make at an even pace, and how sharply the rest speed up. */
const FUNNEL = { even: 0.3, quicken: 2.4 } as const;

/** 0 to 1 with no jolt at either end. */
const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** The moment the ball tips off the lip into its hole, in seconds after it came into its bowl. */
export const ballTipsAt = (duration: number = TIMING.bowl): number => duration * (1 - TIP);

/** When the ball starts to roll in a bowl: at once in the top one, and after its fall from the bowl above in the others. */
export const ballRollsAt = (bowl: number): number => (bowl === 0 ? 0 : BALL_FALL);

/**
 * Where the ball is `since` seconds after it came into a bowl, on its way
 * to the hole of that bowl already drawn for it. `from` is the hole of the
 * bowl above that it dropped through; the top bowl has none, and the machine
 * lets the ball go under its rim.
 *
 * In the top bowl it circles under the rim, spirals in as it slows, hesitates
 * on the lip of each hole it passes, comes to rest on the lip of its own and
 * tips in. In the middle bowl it first falls in from the hole above, forward
 * to the rim, and does the same with a near miss: on its last pass of the other
 * hole it leans in over it before rolling on. The bottom bowl is a funnel:
 * the ball spirals to the middle, faster and faster, and drops into the one
 * hole there. From `duration` on it lies exactly on its hole.
 */
export function bowlBall(since: number, hole: number, duration: number = TIMING.bowl, bowl = 0, from = 0): BallSpot {
  const elapsed = Math.max(0, since);
  const { rim, lip, drop, last } = BOWL_SHAPE;
  const ring = holeRing(bowl);
  const home = holeTurn(hole, bowl);
  const at = (point: BowlPoint, sunk = 0, lift = 0): BallSpot => ({ ...point, bowl, lift, sunk });
  if (elapsed >= duration) return at(holeSpot(hole, bowl), 1);
  const entry = LET_GO[bowl];
  const start = ballRollsAt(bowl);
  if (elapsed < start) {
    // Through the air from the hole above to where it comes in under the rim, faster as it falls. It sets off
    // exactly as it was left in the hole above, so that nothing jumps as one bowl hands it to the next.
    const fallen = elapsed / start;
    const above = holeSpot(from, bowl - 1);
    const below = bowlPoint(rim, entry);
    return at({ x: above.x + (below.x - above.x) * fallen, y: above.y + (below.y - above.y) * fallen }, 1 - smooth(fallen / OUT_OF_HOLE), drop * (1 - fallen * fallen));
  }
  const rolling = ballTipsAt(duration);
  // The lip it comes to rest on: beside its hole, or round the one in the middle of the funnel.
  const edge = ring > 0 ? ring + lip : last;
  // Where it is turned to when it gets there: over its hole, or wherever the funnel has brought it round to.
  const rest = ring > 0 ? home : entry + BALL_LAPS[bowl];
  if (elapsed >= rolling) {
    // Off the lip and down, faster as it goes.
    const fallen = ((elapsed - rolling) / (duration - rolling)) ** 2;
    return at(bowlPoint(ring + (edge - ring) * (1 - fallen), rest), fallen);
  }
  const progress = (elapsed - start) / (rolling - start);
  if (ring === 0) {
    // The funnel: in to the middle all the way, turning faster as the circle tightens.
    const turned = FUNNEL.even * progress + (1 - FUNNEL.even) * progress ** FUNNEL.quicken;
    return at(bowlPoint(rim - (rim - edge) * progress, entry + BALL_LAPS[bowl] * turned));
  }
  const holes = BOWLS[bowl].length;
  // Round its laps and on to the lip of its hole, slowing all the way.
  const turns = BALL_LAPS[bowl] + ((((home - entry) % 1) + 1) % 1);
  const even = entry + turns * (1 - (1 - progress) ** SLOWING);
  // Once it is down among the holes it lingers over each and hurries between them. The holes are
  // where this sine is zero, so it shifts the ball along its way without moving where it ends.
  const among = smooth((progress - ROLL.nearing) / (ROLL.holes - ROLL.nearing));
  const beat = (even - FIRST_HOLE[bowl]) * holes * 2 * Math.PI;
  const turn = even - (HESITATE[bowl] * among * Math.sin(beat)) / (holes * 2 * Math.PI);
  const radius = rim - (rim - edge) * smooth((progress - ROLL.rim) / (ROLL.holes - ROLL.rim));
  if (bowl === 0) return at(bowlPoint(radius, turn));
  // The near miss: over the other hole, the last time it passes it, it leans in and all but goes.
  const lean = Math.exp(-(((even - (entry + turns - 1 / holes)) / TEETER.width) ** 2));
  return at(bowlPoint(radius - lip * TEETER.lean * lean, turn), TEETER.sink * lean);
}

/**
 * Where the cabinet draws the ball of a challenge in play. With `calm` it does
 * not fall or roll: it waits where it came into its bowl, and is in its hole
 * once it has dropped there for good.
 */
export function ballSpot(bowl: ActiveBowl, calm: boolean): BallSpot {
  const waits = calm && bowl.payout < 0;
  return bowlBall(waits ? ballRollsAt(bowl.stage) : bowl.elapsed, bowl.holes[bowl.stage], bowl.duration, bowl.stage, bowl.stage > 0 ? bowl.holes[bowl.stage - 1] : 0);
}

/**
 * How what the bowls paid is counted out: the number runs up to it, a prize
 * from an upper bowl in `prize` seconds and the jackpot in `jackpot`, moving
 * on `rate` times a second. It sets off `from` of the way there and not from
 * nothing, so that the first thing read is a prize already and not a medal
 * or two.
 */
const COUNT = { prize: 1.4, jackpot: 5, rate: 20, from: 0.1 } as const;

/** What the bowls paid, as far as it has been counted out `since` seconds after the ball dropped. */
export function countedUp(payout: number, since: number, jackpot: boolean): number {
  const share = Math.floor(Math.max(0, since) * COUNT.rate + 1e-9) / COUNT.rate / (jackpot ? COUNT.jackpot : COUNT.prize);
  return share >= 1 ? payout : Math.floor(payout * (COUNT.from + (1 - COUNT.from) * share));
}

// ── What the whole screen shows ─────────────────────────────────────────────

export type ScreenMode = 'slot' | 'sugoroku' | 'chest' | 'roulette' | 'bowl';
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
  /** The bowl the ball is in, counted from the top, or −1 when the bowls are not on. */
  stage: number;
  /** The hole the ball has dropped through in each bowl so far, the top bowl's first. */
  fallen: readonly number[];
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

/**
 * The jackpot challenge: the bowl the ball is in, with the holes it has gone
 * through above, and once it has dropped for good the hole it ended in and
 * what that paid, counted up to it. The run's total counts up with it.
 */
function bowlState(run: ScreenState, roulette: ActiveRoulette, bowl: ActiveBowl): ScreenState {
  const state: ScreenState = { ...run, mode: 'bowl', lit: -1, stage: bowl.stage, fallen: bowl.holes.slice(0, bowl.stage) };
  if (bowl.payout < 0) return state;
  const counted = countedUp(bowl.payout, bowl.elapsed - bowl.duration, roulette.jackpot);
  return { ...state, fallen: bowl.holes.slice(0, bowl.stage + 1), banner: roulette.jackpot ? 'jackpot' : 'medals', amount: counted, total: roulette.total - bowl.payout + counted };
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
    stage: -1,
    fallen: [],
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
    a.total !== b.total ||
    a.stage !== b.stage ||
    a.fallen.length !== b.fallen.length ||
    a.fallen.some((hole, bowl) => hole !== b.fallen[bowl])
  ) {
    return false;
  }
  if (a.chests === null || b.chests === null) return a.chests === b.chests;
  return a.chests.every((chest, index) => chest.state === b.chests?.[index].state && chest.prize === b.chests?.[index].prize);
}

/** The medals written on each square of the board, for drawing it. */
export const BOARD_SQUARES: readonly number[] = BOARD;
