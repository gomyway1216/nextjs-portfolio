/**
 * Onsen Shooting Gallery (湯の町射的): the rules, the shelf, and their exact
 * odds.
 *
 * The 射的 of the hot-spring towns' game rooms: a wooden counter, a cork gun
 * on a spring, and two metres off, three tiers of shelves under red felt with
 * a dark curtain behind them. A play buys a handful of corks; the lever is
 * pulled, a cork pushed into the muzzle, and the trigger lets the spring's air
 * push it out. A figure counts only if it comes off the shelf: one that rocks
 * and settles, or slides back a little and stays up, is stood up again for the
 * next player. Several onsen galleries count the figures knocked off as points
 * rather than hand them over; here each figure's tag is in medals.
 *
 * ## The rules
 *
 * - **A play takes six medals** (`STAKE`) **and gives six corks** (`CORKS`),
 *   fired one at a time.
 * - **The shelf** (`SHELF`): nine figures on three tiers. Small sweet boxes on
 *   the bottom tier, daruma and a box of onsen manjū in the middle, kokeshi
 *   and the big beckoning cat on top. Each kind (`KINDS`) has its tag in medals
 *   and its own chances.
 * - **The aim.** The player picks a figure; the sight sways up and down over it
 *   and back, through five bands (`BANDS`): over the top, the top edge, the
 *   upper half, the centre, and the base. FIRE shoots at the band the sight is
 *   on as it is pressed.
 * - **What a cork does** (`KINDS[kind].rows[position][band]`, out of `SLOTS`):
 *   the figure falls off the back of the shelf, slides back a step and stays
 *   up, rocks and settles where it was, or the cork misses it. Over the top is
 *   always a miss. A top-edge hit topples best but misses most; a centre hit
 *   mostly rocks; a base hit mostly slides. Small figures are hard to hit and
 *   easy to topple; the big ones are easy to hit and rarely fall. A figure that
 *   has slid back stands nearer the back edge (`position` 1, then 2), where the
 *   next hit topples it more easily; the manjū box can slide once, the cat
 *   twice, the others not at all.
 * - **The pay.** When the sixth cork has been fired, every figure off the
 *   shelf pays its tag. Six corks can knock six figures off at most; the cat
 *   needs two corks at least, as nothing knocks it off from where it is set.
 * - **Skip only fast-forwards:** it can be pressed once the last cork has been
 *   fired, and cuts its flight and the figure's fall short.
 * - **A page that goes away mid-play** (hidden, left, reloaded, or another tab
 *   taking the medals) **finishes the play:** the corks already fired keep the
 *   player's aim, and every cork still to come is fired blind, at a figure and
 *   a band drawn with the rest of the play.
 *
 * ## Skill, and why it never beats the machine
 *
 * Which figure, and where on it, is the player's to choose, and it matters: a
 * top edge topples a small box far more often than its base does, and two base
 * hits slide the cat to the brink of the shelf. But no band is sure of a hit,
 * a hit is not sure to topple, and a figure that fell is gone. So the return is
 * worked out for three players (`analyze`), exactly, as fractions of BigInts,
 * by dynamic programming over every state the shelf can be in (where each
 * figure stands, or that it fell, and how many corks are left):
 *
 * - **perfect play**: the best figure and band for every cork, chosen afresh
 *   for the shelf as it stands; no way of playing brings back more, and this is
 *   the machine's best return;
 * - **an everyday hand** (`TYPICAL_QUARTERS`): picks the figure and the band it
 *   aims at as well as a hand like it can, but fires on that band half the
 *   time, and a band higher or lower a quarter of the time each (at either end
 *   of the sway, the quarter that would go past it stays on the end band);
 * - **blind shots**: any figure still up, each as likely, at any of the five
 *   bands, each as likely.
 *
 * ## The draw
 *
 * Everything random about a play is drawn the moment its medals go in
 * (`drawPlay`), always eighteen numbers in [0, 1), three for each cork in turn:
 * where the cork goes (`slots`, one of `SLOTS` equally likely slots), and the
 * figure and the band a blind shot of it would take (`picks`, `bands`). The
 * figure and band the player fires at only choose what the slot drawn does:
 * each row shares the slots out from the first, as many for a fall as its
 * chance is in 64ths, then a slide, a rock, and a miss. The shot itself draws
 * nothing.
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── The shelf ───────────────────────────────────────────────────────────────

/** Medals a play takes. */
export const STAKE = 6;
/** Corks a play gives. */
export const CORKS = 6;
/** The equally likely ways a cork can go. Each row of chances adds up to this. */
export const SLOTS = 64;

/** The bands the sight sways through, top to bottom: over the top, the top edge, the upper half, the centre, the base. */
export const BAND_IDS = ['over', 'top', 'upper', 'centre', 'base'] as const;
export type BandId = (typeof BAND_IDS)[number];
export const BANDS = BAND_IDS.length;
/** The band over the top of a figure: a cork fired there always misses. */
export const OVER = 0;

/** What a cork does to the figure it is fired at. */
export const OUTCOMES = ['fall', 'slide', 'rock', 'miss'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** A band's chances, out of `SLOTS`: the figure falls, slides back a step, rocks and settles, or the cork misses it. */
export type Row = readonly [fall: number, slide: number, rock: number, miss: number];

/** A kind of figure on the shelf. */
export interface Kind {
  /** Its tag: the medals it pays when it is off the shelf at the end of a play. */
  medals: number;
  /**
   * Its chances, by where it stands (0 as it is set up; 1 and 2 once it has slid back one and two steps) and by band
   * (`BAND_IDS`). A figure's last position has no slide.
   */
  rows: readonly (readonly Row[])[];
}

export const KIND_IDS = ['box', 'daruma', 'kokeshi', 'manju', 'cat'] as const;
export type KindId = (typeof KIND_IDS)[number];

const MISS_ALL: Row = [0, 0, 0, SLOTS];

/**
 * The five kinds, each band's row out of 64 (fall, slide, rock, miss), over the top first.
 *
 * - **A sweet box** (2): small and light. Hard to hit, easy to topple; the top edge spins it off most, and a base hit
 *   can flick it off too.
 * - **A daruma** (3): round and heavy at its foot, it rocks back up when hit anywhere but near the top.
 * - **A kokeshi** (4): tall and thin, the hardest to hit; a top-edge hit topples it.
 * - **A box of onsen manjū** (5): wide and low, hard to miss and hard to tip: a hit slides it back to the shelf's edge,
 *   from where the next topples it.
 * - **The beckoning cat** (25): big, heavy porcelain. Nearly every cork hits it and nearly none moves it: base hits
 *   slide it back, twice, to the brink, and only from there does a top-edge hit topple it.
 */
export const KINDS: Readonly<Record<KindId, Kind>> = {
  box: {
    medals: 2,
    rows: [
      [MISS_ALL, [26, 0, 10, 28], [20, 0, 20, 24], [14, 0, 30, 20], [10, 0, 30, 24]],
    ],
  },
  daruma: {
    medals: 3,
    rows: [
      [MISS_ALL, [17, 0, 31, 16], [10, 0, 42, 12], [3, 0, 51, 10], [1, 0, 53, 10]],
    ],
  },
  kokeshi: {
    medals: 4,
    rows: [
      [MISS_ALL, [14, 0, 22, 28], [10, 0, 30, 24], [4, 0, 38, 22], [2, 0, 40, 22]],
    ],
  },
  manju: {
    medals: 5,
    rows: [
      [MISS_ALL, [4, 16, 36, 8], [2, 18, 38, 6], [1, 18, 41, 4], [1, 20, 39, 4]],
      [MISS_ALL, [22, 0, 34, 8], [17, 0, 41, 6], [12, 0, 48, 4], [9, 0, 51, 4]],
    ],
  },
  cat: {
    medals: 25,
    rows: [
      [MISS_ALL, [0, 8, 50, 6], [0, 10, 51, 3], [0, 12, 50, 2], [0, 16, 46, 2]],
      [MISS_ALL, [1, 10, 47, 6], [1, 12, 48, 3], [0, 14, 48, 2], [0, 16, 46, 2]],
      [MISS_ALL, [14, 0, 44, 6], [9, 0, 52, 3], [5, 0, 57, 2], [2, 0, 60, 2]],
    ],
  },
};

/** The big prize: what the medal floor names when it falls. */
export const GRAND: KindId = 'cat';

/** The tiers, top (the back) first, and the figures on each. */
export const TIERS = 3;
export const PER_TIER = 3;
/** The nine figures, tier by tier from the top, left to right on each: their kinds. */
export const SHELF: readonly KindId[] = ['kokeshi', 'cat', 'kokeshi', 'daruma', 'manju', 'daruma', 'box', 'box', 'box'];
export const TARGETS = SHELF.length;
export const tierOf = (target: number): number => Math.floor(target / PER_TIER);
export const kindOf = (target: number): Kind => KINDS[SHELF[target]];
/** How many places a figure can stand in: its rows. */
export const placesOf = (target: number): number => kindOf(target).rows.length;

/** Where a figure is: how many steps back it has slid (0 as set up), or `FALLEN`. */
export const FALLEN = -1;
/** The shelf as a play starts: every figure up, where it was set. */
export const SET_UP: readonly number[] = SHELF.map(() => 0);

/** What a figure's chances are, standing at `position`, for a cork at `band`. */
export const rowOf = (target: number, position: number, band: number): Row => kindOf(target).rows[position][band];

/** What a slot does to a figure at `position`, fired at at `band`: the slots go to a fall first, then a slide, a rock, a miss. */
export function outcomeOf(target: number, position: number, band: number, slot: number): Outcome {
  const [fall, slide, rock] = rowOf(target, position, band);
  if (slot < fall) return 'fall';
  if (slot < fall + slide) return 'slide';
  if (slot < fall + slide + rock) return 'rock';
  return 'miss';
}

/** The first slot that does `outcome` to a figure at `position` fired at at `band`, or -1 when it never does: for a test that rigs the draw. */
export function slotFor(target: number, position: number, band: number, outcome: Outcome): number {
  const row = rowOf(target, position, band);
  const at = OUTCOMES.indexOf(outcome);
  if (row[at] === 0) return -1;
  return row.slice(0, at).reduce((sum, n) => sum + n, 0);
}

// ── The draw ────────────────────────────────────────────────────────────────

/**
 * The equally likely picks a blind shot's figure is drawn from: every count of figures still up (one to nine) shares
 * them out evenly, so that a blind shot takes each figure up as likely, whichever are.
 */
export const PICKS = 2_520;

/** Everything random about a play, drawn as its medals go in. */
export interface Draw {
  /** Where each cork goes: one of `SLOTS`, for each cork in turn. */
  slots: number[];
  /** The figure each cork would be fired at blind: one of `PICKS`, shared out among the figures still up. */
  picks: number[];
  /** The band each cork would be fired at blind. */
  bands: number[];
}

/** How many numbers in [0, 1) a draw takes. */
export const DRAW_NUMBERS = CORKS * 3;

const pick = (n: number, of: number): number => Math.min(of - 1, Math.max(0, Math.floor(n * of)));

/** A play's draw, from `DRAW_NUMBERS` random numbers in [0, 1): for each cork in turn, its slot, its blind figure and its blind band. */
export function drawPlay(random: () => number): Draw {
  const draw: Draw = { slots: [], picks: [], bands: [] };
  for (let c = 0; c < CORKS; c++) {
    draw.slots.push(pick(random(), SLOTS));
    draw.picks.push(pick(random(), PICKS));
    draw.bands.push(pick(random(), BANDS));
  }
  return draw;
}

/** The number that draws `value` out of `of`. */
const numberFor = (value: number, of: number): number => (value + 0.5) / of;
/** The numbers that draw `draw`, in the order `drawPlay` takes them. */
export const numbersFor = (draw: Draw): number[] => draw.slots.flatMap((slot, c) => [numberFor(slot, SLOTS), numberFor(draw.picks[c], PICKS), numberFor(draw.bands[c], BANDS)]);

const isWhole = (value: unknown, below: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;

/** Whether a value is a draw the machine could have made. */
export function isDraw(value: unknown): value is Draw {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  const list = (v: unknown, below: number) => Array.isArray(v) && v.length === CORKS && v.every((n) => isWhole(n, below));
  return list(d.slots, SLOTS) && list(d.picks, PICKS) && list(d.bands, BANDS);
}
export const copyDraw = (draw: Draw): Draw => ({ slots: [...draw.slots], picks: [...draw.picks], bands: [...draw.bands] });

// ── A play ──────────────────────────────────────────────────────────────────

/** A cork fired: at which figure, and at which band of the sway. */
export type Shot = readonly [target: number, band: number];

/** The figures still up, in shelf order. */
export const standingOf = (positions: readonly number[]): number[] => positions.flatMap((p, t) => (p === FALLEN ? [] : [t]));

/** The figure a blind shot takes, among those up: pick `pick` of `PICKS`, shared out evenly. */
export const blindTarget = (positions: readonly number[], pick: number): number => {
  const up = standingOf(positions);
  return up[Math.floor((pick * up.length) / PICKS)];
};

/** Whether `shot` can be fired at a shelf standing as `positions`: a figure still up, and a band of the sway. */
export const shotFits = (positions: readonly number[], shot: unknown): shot is Shot =>
  Array.isArray(shot) && shot.length === 2 && isWhole(shot[0], TARGETS) && isWhole(shot[1], BANDS) && positions[shot[0]] !== FALLEN;

/** A cork fired, and what it did. */
export interface CorkPlay {
  cork: number;
  target: number;
  band: number;
  /** Whether it was fired blind (its page went away mid-play), not by the player. */
  blind: boolean;
  /** Where the figure stood as the cork was fired. */
  position: number;
  outcome: Outcome;
  /** The slot drawn for it: also which way a miss flies, and which way a figure spins off. */
  slot: number;
}

export interface Play {
  /** The corks fired so far, in order. */
  corks: CorkPlay[];
  /** Where each figure stands now, or `FALLEN`. */
  positions: number[];
  /** The figures off the shelf, in the order they fell. */
  fallen: number[];
  /** Medals the play pays: nothing until every cork has been fired. */
  won: number;
  /** Whether every cork has been fired. */
  complete: boolean;
}

/** What the figures off a shelf standing as `positions` pay. */
export const payOf = (positions: readonly number[]): number => positions.reduce((sum, p, t) => (p === FALLEN ? sum + kindOf(t).medals : sum), 0);

/**
 * A play as far as it has gone: the shots made (`shots`, a figure and a band for each cork fired), and, with
 * `finish`, every cork still to come fired blind, at the figure and band drawn for it. A shot that does not fit the
 * shelf as it stands (`shotFits`) ends the play's shots there: the record would not have been read back.
 */
export function playOf(draw: Draw, shots: readonly Shot[], finish = false): Play {
  const corks: CorkPlay[] = [];
  const positions = [...SET_UP];
  const fallen: number[] = [];
  for (let c = 0; c < CORKS; c++) {
    const own = c < shots.length;
    if (!own && !finish) break;
    if (standingOf(positions).length === 0) break;
    const shot: Shot = own ? shots[c] : [blindTarget(positions, draw.picks[c]), draw.bands[c]];
    if (!shotFits(positions, shot)) break;
    const [target, band] = shot;
    const position = positions[target];
    const slot = draw.slots[c];
    const outcome = outcomeOf(target, position, band, slot);
    if (outcome === 'fall') {
      positions[target] = FALLEN;
      fallen.push(target);
    } else if (outcome === 'slide') positions[target] = position + 1;
    corks.push({ cork: c, target, band, blind: !own, position, outcome, slot });
  }
  const complete = corks.length === CORKS;
  return { corks, positions, fallen, won: complete ? payOf(positions) : 0, complete };
}

/** The shots of a play played to its end: those made, then blind ones for the rest. */
export const finishedShots = (draw: Draw, shots: readonly Shot[]): Shot[] => playOf(draw, shots, true).corks.map(({ target, band }) => [target, band] as const);

/** Whether `shots` could be the shots of a play of `draw`: each a figure still up as it was fired, and no more than the corks. */
export function shotsFit(draw: Draw, shots: readonly unknown[]): shots is Shot[] {
  if (shots.length > CORKS) return false;
  const positions = [...SET_UP];
  for (let c = 0; c < shots.length; c++) {
    const shot = shots[c];
    if (!shotFits(positions, shot)) return false;
    const [target, band] = shot;
    const outcome = outcomeOf(target, positions[target], band, draw.slots[c]);
    if (outcome === 'fall') positions[target] = FALLEN;
    else if (outcome === 'slide') positions[target] += 1;
  }
  return true;
}

/** What the medal floor calls a play's win: the cat off the shelf, or three figures or more without it, by name. */
export const labelOf = (play: Play): string | null => {
  if (!play.complete || play.won <= 0) return null;
  if (play.fallen.some((t) => SHELF[t] === GRAND)) return 'gallery-cat';
  return play.fallen.length >= 3 ? 'gallery-trio' : null;
};

// ── The shelf's states ──────────────────────────────────────────────────────

/** Each figure's digit in a state's number: its position, or its count of places for fallen. */
const RADIX = SHELF.map((_, t) => placesOf(t) + 1);
const PLACE = RADIX.map((_, t) => RADIX.slice(0, t).reduce((m, r) => m * r, 1));
/** How many states the shelf can be in. */
export const STATES = RADIX.reduce((m, r) => m * r, 1);

/** A shelf standing as `positions`, as a number. */
export const stateOf = (positions: readonly number[]): number => positions.reduce((sum, p, t) => sum + (p === FALLEN ? RADIX[t] - 1 : p) * PLACE[t], 0);
/** The shelf a state's number stands for. */
export const positionsOf = (state: number): number[] =>
  SHELF.map((_, t) => {
    const digit = Math.floor(state / PLACE[t]) % RADIX[t];
    return digit === RADIX[t] - 1 ? FALLEN : digit;
  });

/** For every state and figure: the state after it falls, and after it slides (-1: it cannot), and what it pays. */
interface Moves {
  falls: Int32Array;
  slides: Int32Array;
  /** Each state's figures still up. */
  up: number[][];
  /** Each state's figures' positions. */
  at: Int8Array;
}
let movesMade: Moves | null = null;
function moves(): Moves {
  if (movesMade) return movesMade;
  const falls = new Int32Array(STATES * TARGETS).fill(-1);
  const slides = new Int32Array(STATES * TARGETS).fill(-1);
  const at = new Int8Array(STATES * TARGETS);
  const up: number[][] = [];
  for (let s = 0; s < STATES; s++) {
    const positions = positionsOf(s);
    up.push(standingOf(positions));
    for (let t = 0; t < TARGETS; t++) {
      at[s * TARGETS + t] = positions[t];
      if (positions[t] === FALLEN) continue;
      falls[s * TARGETS + t] = s + (RADIX[t] - 1 - positions[t]) * PLACE[t];
      if (positions[t] + 1 < placesOf(t)) slides[s * TARGETS + t] = s + PLACE[t];
    }
  }
  movesMade = { falls, slides, up, at };
  return movesMade;
}

/** The most a play can pay: the most medals six corks can knock off, each cork doing whatever it can. */
export const MOST_WIN = (() => {
  const best = new Map<string, number>();
  const most = (positions: number[], left: number): number => {
    if (left === 0) return 0;
    const key = `${positions.join(',')}:${left}`;
    const known = best.get(key);
    if (known !== undefined) return known;
    let top = 0;
    for (const target of standingOf(positions)) {
      const position = positions[target];
      const canFall = kindOf(target).rows[position].some((row) => row[0] > 0);
      const canSlide = position + 1 < placesOf(target);
      if (canFall) {
        const next = [...positions];
        next[target] = FALLEN;
        top = Math.max(top, kindOf(target).medals + most(next, left - 1));
      }
      if (canSlide) {
        const next = [...positions];
        next[target] = position + 1;
        top = Math.max(top, most(next, left - 1));
      }
    }
    best.set(key, top);
    return top;
  };
  return most([...SET_UP], CORKS);
})();

// ── Exact fractions ─────────────────────────────────────────────────────────

export interface Fraction {
  num: bigint;
  den: bigint;
}

// Written with BigInt() rather than literals: the site's TypeScript targets a version before BigInt literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) [x, y] = [y, x % y];
  return x;
};
export const fraction = (num: bigint | number, den: bigint | number = ONE): Fraction => {
  const n = typeof num === 'bigint' ? num : BigInt(num);
  const d = typeof den === 'bigint' ? den : BigInt(den);
  const g = gcd(n, d) || ONE;
  const sign = d < ZERO ? -ONE : ONE;
  return { num: (sign * n) / g, den: (sign * d) / g };
};
export const less = (a: Fraction, b: Fraction): boolean => a.num * b.den < b.num * a.den;
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};
/** A fraction written as "num/den", and read back. */
export const ratioOf = (f: Fraction): string => `${f.num.toString()}/${f.den.toString()}`;
export const parseRatio = (text: string): Fraction => {
  const [num, den] = text.split('/');
  return fraction(BigInt(num), BigInt(den));
};

// ── The players ─────────────────────────────────────────────────────────────

export type Player = 'perfect' | 'typical' | 'blind';
export const PLAYERS: readonly Player[] = ['perfect', 'typical', 'blind'];

/**
 * The everyday hand's spread, in quarters: the band it fires on when it aims at band `aim`. On it half the time, a band
 * higher or lower a quarter each; at either end of the sway the quarter that would go past it stays on the end band.
 */
export function TYPICAL_QUARTERS(aim: number): { band: number; quarters: number }[] {
  if (aim === 0) return [{ band: 0, quarters: 3 }, { band: 1, quarters: 1 }];
  if (aim === BANDS - 1) return [{ band: BANDS - 1, quarters: 3 }, { band: BANDS - 2, quarters: 1 }];
  return [{ band: aim, quarters: 2 }, { band: aim - 1, quarters: 1 }, { band: aim + 1, quarters: 1 }];
}

/** A player's weights over the bands for each band aimed at, and the whole the weights of one shot add up to. */
function spreadsOf(player: Player): { weights: number[][]; whole: number } {
  if (player === 'perfect') return { weights: Array.from({ length: BANDS }, (_, aim) => Array.from({ length: BANDS }, (_, b) => (b === aim ? 1 : 0))), whole: 1 };
  if (player === 'typical') {
    return {
      weights: Array.from({ length: BANDS }, (_, aim) => {
        const row = new Array<number>(BANDS).fill(0);
        for (const { band, quarters } of TYPICAL_QUARTERS(aim)) row[band] += quarters;
        return row;
      }),
      whole: 4,
    };
  }
  // Blind: every figure up as likely (PICKS shared out among them), every band as likely.
  return { weights: [new Array<number>(BANDS).fill(1)], whole: PICKS * BANDS };
}

/** A shot's choice as one number: the figure and the band aimed at (`target * BANDS + aim`); -1 where nothing is chosen. */
export const choiceOf = (target: number, aim: number): number => target * BANDS + aim;

// ── The dynamic programme ───────────────────────────────────────────────────

/**
 * The best choice for every shelf and every count of corks left, worked out in floating point: what a player who
 * chooses as `player` does is the choice of highest worth (none for blind shots). Index: `left * STATES + state`.
 */
export interface FloatSolution {
  player: Player;
  /** The worth of each shelf with `left` corks left, in medals. */
  worth: Float64Array;
  /** The choice made there (`choiceOf`), -1 where nothing is chosen. */
  choice: Int16Array;
}

/** Choices within this much of the best (relative) are compared exactly before one is taken. */
const NEAR = 1e-9;

/** What a cork at `band` at figure `t` of state `s` is worth, from the worths of the shelves one cork later, before dividing by `SLOTS`. */
function shotWorth(worthBelow: Float64Array, below: number, m: Moves, s: number, t: number, band: number, pay: number): number {
  const at = s * TARGETS + t;
  const [fall, slide, rock, miss] = rowOf(t, m.at[at], band);
  let ev = (rock + miss) * worthBelow[below + s];
  if (fall) ev += fall * (pay + worthBelow[below + m.falls[at]]);
  if (slide) ev += slide * worthBelow[below + m.slides[at]];
  return ev;
}

/** The float programme, from the end of a play back to its start. */
function solveFloat(player: Player): FloatSolution & { near: Uint8Array } {
  const m = moves();
  const { weights, whole } = spreadsOf(player);
  const worth = new Float64Array(STATES * (CORKS + 1));
  const choice = new Int16Array(STATES * (CORKS + 1)).fill(-1);
  // How many choices came within `NEAR` of the best: more than one, and the exact pass compares them.
  const near = new Uint8Array(STATES * (CORKS + 1));
  const bandWorth = new Float64Array(BANDS);
  for (let left = 1; left <= CORKS; left++) {
    const below = (left - 1) * STATES;
    for (let s = 0; s < STATES; s++) {
      const at = left * STATES + s;
      const up = m.up[s];
      if (up.length === 0) {
        worth[at] = worth[below + s];
        continue;
      }
      if (player === 'blind') {
        let sum = 0;
        for (const t of up) for (let b = 0; b < BANDS; b++) sum += shotWorth(worth, below, m, s, t, b, kindOf(t).medals);
        worth[at] = sum / (up.length * BANDS * SLOTS);
        continue;
      }
      let best = -Infinity;
      let bestAt = 0;
      const evs: number[] = [];
      for (const t of up) {
        for (let b = 0; b < BANDS; b++) bandWorth[b] = shotWorth(worth, below, m, s, t, b, kindOf(t).medals);
        for (let aim = 0; aim < BANDS; aim++) {
          let ev = 0;
          for (let b = 0; b < BANDS; b++) if (weights[aim][b]) ev += weights[aim][b] * bandWorth[b];
          ev /= whole * SLOTS;
          evs.push(ev);
          if (ev > best) {
            best = ev;
            bestAt = choiceOf(t, aim);
          }
        }
      }
      worth[at] = best;
      choice[at] = bestAt;
      const tolerance = NEAR * Math.max(1, Math.abs(best));
      near[at] = Math.min(255, evs.filter((ev) => ev >= best - tolerance).length);
    }
  }
  return { player, worth, choice, near };
}

const solutions = new Map<Player, FloatSolution>();
/** The best choices for `player`, worked out once, when first asked for (a few tens of milliseconds). */
export function solve(player: Player): FloatSolution {
  const known = solutions.get(player);
  if (known) return known;
  const { worth, choice } = solveFloat(player);
  const solved = { player, worth, choice };
  solutions.set(player, solved);
  return solved;
}

/** A player's exact odds: what a play brings back, the chance of each count of figures off the shelf, and of the cat. */
export interface PlayerOdds {
  /** Medals back per medal played. */
  back: Fraction;
  /** The chance of ending with none of the figures off the shelf, one, two, … up to `CORKS`. */
  fell: Fraction[];
  /** The chance that the beckoning cat is off the shelf at the end. */
  grand: Fraction;
}

export type MachineOdds = Record<Player, PlayerOdds>;

/**
 * A player's exact odds, by the same programme in BigInts: every shelf's worth with `left` corks left, times the
 * scale to the power `left`, is a whole number (the scale is a shot's weights' whole times `SLOTS`), so the programme
 * runs on whole numbers and divides once at the end. The choices are the float programme's, and wherever two came
 * within a hair of each other they are compared exactly here, so the best is the best to the last digit (`exhaustive`
 * compares every choice exactly everywhere, for a test that the float programme chose right). Then the chance of each
 * ending, played that way, forward from the shelf as it is set up.
 */
export function analyzePlayer(player: Player, { exhaustive = false }: { exhaustive?: boolean } = {}): PlayerOdds {
  return reckon(player, exhaustive).odds;
}

/**
 * A second road to a player's return: what the shelves the forward pass ends on pay, each by its chance, per medal
 * played. It must be the backward programme's return to the last digit (published.test.tsx).
 */
export const forwardReturn = (player: Player): Fraction => reckon(player, false).forward;

function reckon(player: Player, exhaustive: boolean): { odds: PlayerOdds; forward: Fraction } {
  const m = moves();
  const { weights, whole } = spreadsOf(player);
  const solved = solveFloat(player);
  const scale = BigInt(whole * SLOTS);
  const big = weights.map((row) => row.map((w) => BigInt(w)));
  const blindShare = (n: number): bigint => BigInt(PICKS / n);
  // `power[k]`: the scale to the power k, for the medals a fall pays with k corks still to come.
  const power: bigint[] = [ONE];
  for (let k = 1; k <= CORKS; k++) power.push(power[k - 1] * scale);
  let worth: bigint[] = new Array<bigint>(STATES).fill(ZERO);
  const choice = new Int16Array(STATES * (CORKS + 1)).fill(-1);
  const bandWorth: bigint[] = new Array<bigint>(BANDS);
  for (let left = 1; left <= CORKS; left++) {
    const now: bigint[] = new Array<bigint>(STATES);
    const paid = power[left - 1];
    for (let s = 0; s < STATES; s++) {
      const up = m.up[s];
      if (up.length === 0) {
        now[s] = worth[s] * scale;
        continue;
      }
      const exact = (t: number, b: number): bigint => {
        const at = s * TARGETS + t;
        const [fall, slide, rock, miss] = rowOf(t, m.at[at], b);
        let ev = BigInt(rock + miss) * worth[s];
        if (fall) ev += BigInt(fall) * (BigInt(kindOf(t).medals) * paid + worth[m.falls[at]]);
        if (slide) ev += BigInt(slide) * worth[m.slides[at]];
        return ev;
      };
      if (player === 'blind') {
        let sum = ZERO;
        const share = blindShare(up.length);
        for (const t of up) for (let b = 0; b < BANDS; b++) sum += share * exact(t, b);
        now[s] = sum;
        continue;
      }
      const at = left * STATES + s;
      const candidates = exhaustive || solved.near[at] > 1 ? up.flatMap((t) => Array.from({ length: BANDS }, (_, aim) => choiceOf(t, aim))) : [solved.choice[at]];
      let best: bigint | null = null;
      let bestAt = candidates[0];
      let lastTarget = -1;
      for (const c of candidates) {
        const t = Math.floor(c / BANDS);
        const aim = c % BANDS;
        if (t !== lastTarget) {
          for (let b = 0; b < BANDS; b++) bandWorth[b] = big.some((row) => row[b] !== ZERO) ? exact(t, b) : ZERO;
          lastTarget = t;
        }
        let ev = ZERO;
        for (let b = 0; b < BANDS; b++) if (big[aim][b] !== ZERO) ev += big[aim][b] * bandWorth[b];
        if (best === null || ev > best) {
          best = ev;
          bestAt = c;
        }
      }
      now[s] = best!;
      choice[at] = bestAt;
    }
    worth = now;
  }
  const den = power[CORKS];
  const start = stateOf(SET_UP);
  const back = fraction(worth[start], den * BigInt(STAKE));
  // Forward: the chance of every shelf after each cork, played by the choices taken, as whole numbers over the scale.
  let chance = new Map<number, bigint>([[start, ONE]]);
  for (let left = CORKS; left >= 1; left--) {
    const after = new Map<number, bigint>();
    const add = (s: number, n: bigint) => after.set(s, (after.get(s) ?? ZERO) + n);
    for (const [s, p] of chance) {
      const up = m.up[s];
      if (up.length === 0) {
        add(s, p * scale);
        continue;
      }
      const shots: { t: number; w: bigint[] }[] =
        player === 'blind'
          ? up.map((t) => ({ t, w: new Array<bigint>(BANDS).fill(blindShare(up.length)) }))
          : (() => {
              const c = choice[left * STATES + s];
              return [{ t: Math.floor(c / BANDS), w: big[c % BANDS] }];
            })();
      for (const { t, w } of shots) {
        const at = s * TARGETS + t;
        for (let b = 0; b < BANDS; b++) {
          if (w[b] === ZERO) continue;
          const [fall, slide, rock, miss] = rowOf(t, m.at[at], b);
          const each = p * w[b];
          if (fall) add(m.falls[at], each * BigInt(fall));
          if (slide) add(m.slides[at], each * BigInt(slide));
          if (rock + miss) add(s, each * BigInt(rock + miss));
        }
      }
    }
    chance = after;
  }
  const fell = Array.from({ length: CORKS + 1 }, () => ZERO);
  let grand = ZERO;
  let paid = ZERO;
  const cat = SHELF.indexOf(GRAND);
  for (const [s, p] of chance) {
    const positions = positionsOf(s);
    fell[positions.filter((x) => x === FALLEN).length] += p;
    if (positions[cat] === FALLEN) grand += p;
    paid += p * BigInt(payOf(positions));
  }
  return { odds: { back, fell: fell.map((n) => fraction(n, den)), grand: fraction(grand, den) }, forward: fraction(paid, den * BigInt(STAKE)) };
}

/** Every player's exact odds (a second or so): for the tests, and for writing out published.ts. The page reads published.ts. */
export const analyze = (): MachineOdds => ({ perfect: analyzePlayer('perfect'), typical: analyzePlayer('typical'), blind: analyzePlayer('blind') });

// ── A check by play ─────────────────────────────────────────────────────────

/** Random numbers in [0, 1) from a seed, the same every time: for the check, never for the machine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The shot `player` fires on a shelf standing as `positions` with `left` corks left, `random` for a hand that is not perfect. */
export function shotAs(player: Player, positions: readonly number[], left: number, random: () => number): Shot {
  if (player === 'blind') return [blindTarget(positions, pick(random(), PICKS)), pick(random(), BANDS)];
  const c = solve(player).choice[left * STATES + stateOf(positions)];
  const target = Math.floor(c / BANDS);
  const aim = c % BANDS;
  if (player === 'perfect') return [target, aim];
  const n = random() * 4;
  let sum = 0;
  for (const { band, quarters } of TYPICAL_QUARTERS(aim)) {
    sum += quarters;
    if (n < sum) return [target, band];
  }
  return [target, aim];
}

/** The shot perfect play fires next, on a shelf standing as `positions` with `left` corks left. */
export const bestShot = (positions: readonly number[], left: number): Shot => shotAs('perfect', positions, left, () => 0);

export interface CheckResult {
  plays: number;
  /** Medals back per medal played. */
  back: number;
  /** Plays that ended with each count of figures off the shelf. */
  fell: number[];
}

/** Plays `plays` plays as `player`, drawn from `random`: what came back, to set beside the exact figures. */
export function checkPlays(plays: number, player: Player, random: () => number): CheckResult {
  let back = 0;
  const fell = new Array<number>(CORKS + 1).fill(0);
  for (let p = 0; p < plays; p++) {
    const draw = drawPlay(random);
    const shots: Shot[] = [];
    let play = playOf(draw, shots);
    while (!play.complete) {
      shots.push(shotAs(player, play.positions, CORKS - shots.length, random));
      play = playOf(draw, shots);
    }
    back += play.won;
    fell[play.fallen.length] += 1;
  }
  return { plays, back: back / (plays * STAKE), fell };
}
