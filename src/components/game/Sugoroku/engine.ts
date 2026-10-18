/**
 * Whale Isle Sugoroku (くじら島すごろく): the rules, the board, and its exact
 * odds.
 *
 * A board-game medal machine of the kind a Japanese medal floor has in its
 * big-machine corner: medals buy a roll of the die in the dome, a little boat
 * hops that many squares round the island, and the square it stops on pays,
 * moves it on or back, or starts a chance. Passing START pays a lap bonus.
 *
 * ## The rules
 *
 * - **The bet** is 2, 4, 6 or 10 medals a roll, and everything pays in
 *   proportion: every figure on the board is per 2 medals bet (`UNIT`), so a
 *   bet of 10 is paid five times what a bet of 2 is.
 * - **The die**: one six-sided die, each face 1 chance in 6, every roll.
 * - **The board**: 30 squares in a loop round the island, START (the harbour)
 *   first. The boat hops the number rolled, square by square, and stays where
 *   it stops until the next roll: the board is kept as the player left it.
 * - **The lap bonus**: passing or landing on START pays 1 (per 2 medals bet).
 * - **The squares** (per 2 medals bet):
 *   - a shell pays 1, a pearl pays 2, a palm tree is a rest and pays nothing;
 *   - a tailwind carries the boat forward, a current or a storm takes it back,
 *     and the whirlpool sends it back to START (ふりだしに戻る: no lap bonus,
 *     the boat did not sail past it). The square it is carried to then counts:
 *     a shell, a pearl, a palm or START, never another arrow;
 *   - LAMP CHANCE (2 squares): the 12 lamps round the dome run and stop on
 *     one, which pays 1 to 20;
 *   - JP CHANCE: the same 12 lamps, with the JP star on one of them. The star
 *     starts the JP FINAL: the die is rolled again, and a 6 is the jackpot,
 *     200 (100 times the bet); any other face pays 8;
 *   - WHALE RIDE (the bonus gate): the boat rides up the whale's back, a lane
 *     of 10 squares, on three free rolls of the die, each square it stops on
 *     paying 1 or 2. Past the tenth is the blowhole, where the JP CHANCE is
 *     played. Then the boat comes back to the gate. The bonus is part of the
 *     roll that started it: it takes no medals of its own.
 *
 * ## Why the board is laid out as it is
 *
 * The player can see where the boat is before choosing the bet, so every
 * square the boat can stand on must be a square whose next roll brings back
 * less than it takes: otherwise betting big only from the good squares would
 * beat the machine. A roll from square `s` lands on one of the six squares
 * after it, each 1 in 6, so what it brings back is the average of those six.
 * So the board repeats every six squares: one special square (a chance, the
 * whale or START), then a shell, a pearl, a palm, a shell and a shell. Every
 * special square is worth the same on average (`SPECIAL`: 37/6 per 2 medals,
 * the lamps, the JP chance and the whale ride each made to come to exactly
 * that), and an arrow only ever carries the boat to a square worth the same
 * as the one it stands on. Then from any square the next six are worth the
 * same: a roll brings back 67/72 of its bet (93.06%) from every square but the
 * six before START, where START itself (worth nothing but its lap bonus) is
 * among the next six and brings it down.
 *
 * ## The maths
 *
 * Where the boat stands is all that carries from one roll to the next, so the
 * machine is a Markov chain over the 30 squares (`analyzeBoard`): every way a
 * roll from each square can go is enumerated, with its exact chance (the die,
 * the lamps, the JP final and the whale's three rolls: 6 × 216 × 12 × 6 =
 * 93,312 ways a roll can be drawn), giving what a roll from each square
 * brings back and where it leaves the boat. The chain's stationary
 * distribution (solved exactly, in fractions of BigInts) says how often the
 * boat stands on each square in the long run, and so what steady play brings
 * back: 89.74%.
 *
 * The draw is made the moment ROLL is pressed (`drawPlay`): always six numbers
 * in [0, 1), in this order, whether or not they are needed: the die, the
 * whale's three rolls, the lamp, and the JP final's die.
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── Bets ────────────────────────────────────────────────────────────────────

/** Every figure on the board is per this many medals bet. */
export const UNIT = 2;
/** The bets a roll can be played for. */
export const BETS = [2, 4, 6, 10] as const;
export type Bet = (typeof BETS)[number];
export const isBet = (value: unknown): value is Bet => (BETS as readonly unknown[]).includes(value);
/** The most a roll can take. */
export const BET_MOST = Math.max(...BETS);
/** The medals a figure on the board (per `UNIT` medals bet) is worth on a bet of `bet`. */
export const medalsFor = (bet: number, pays: number): number => (pays * bet) / UNIT;

// ── The die ─────────────────────────────────────────────────────────────────

export const FACES = 6;
/** A face of the die from a random number in [0, 1): 1 to 6, each as likely. */
export const faceFrom = (r: number): number => Math.min(FACES, Math.max(1, Math.floor(r * FACES) + 1));
export const isFace = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= FACES;

// ── The board ───────────────────────────────────────────────────────────────

export type SquareKind = 'start' | 'shell' | 'pearl' | 'rest' | 'tailwind' | 'current' | 'storm' | 'whirlpool' | 'lamp' | 'jp' | 'whale';
/** The squares that move the boat when it stops on them. */
export type ArrowKind = 'tailwind' | 'current' | 'storm' | 'whirlpool';
export const ARROWS: readonly SquareKind[] = ['tailwind', 'current', 'storm', 'whirlpool'];
export const isArrow = (kind: SquareKind): kind is ArrowKind => ARROWS.includes(kind);

export interface Square {
  kind: SquareKind;
  /** What it pays when the boat stops on it, per `UNIT` medals bet: a shell's 1 or a pearl's 2. */
  pays: number;
  /** For an arrow, the square it carries the boat to. */
  to: number | null;
}

const square = (kind: SquareKind, pays = 0, to: number | null = null): Square => ({ kind, pays, to });
const SHELL = square('shell', 1);
const PEARL = square('pearl', 2);
const PALM = square('rest');

/**
 * The 30 squares round the island, START first, in the order the boat sails them. Every sixth square is special
 * (START, the two lamp chances, the whale and the JP chance); between them a shell, a pearl, a palm, a shell and a
 * shell, an arrow standing in for one of them only where it carries the boat to a square of the same kind.
 */
export const BOARD: readonly Square[] = [
  square('start'),
  SHELL,
  PEARL,
  PALM,
  SHELL,
  SHELL,
  square('lamp'),
  square('tailwind', 0, 10),
  PEARL,
  square('storm', 0, 3),
  SHELL,
  SHELL,
  square('whale'),
  SHELL,
  PEARL,
  square('whirlpool', 0, 0),
  SHELL,
  square('current', 0, 13),
  square('lamp'),
  SHELL,
  square('tailwind', 0, 26),
  PALM,
  SHELL,
  SHELL,
  square('jp'),
  SHELL,
  PEARL,
  PALM,
  SHELL,
  SHELL,
];
export const BOARD_SIZE = BOARD.length;
export const START = 0;
export const isSquare = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BOARD_SIZE;

/** What passing or landing on START pays, per `UNIT` medals bet. */
export const LAP_PAYS = 1;

// ── The chances ─────────────────────────────────────────────────────────────

/** What every special square is worth on average, per `UNIT` medals bet: each chance is made to come to exactly this. */
export const SPECIAL_NUM = 37;
export const SPECIAL_DEN = 6;

/** The 12 lamps round the dome for a LAMP CHANCE, clockwise from the top, per `UNIT` medals bet: 74 in all, 37/6 each. */
export const LAMPS: readonly number[] = [20, 2, 4, 10, 2, 6, 4, 10, 2, 6, 4, 4];
export const LAMP_COUNT = LAMPS.length;

/** The JP star among the JP CHANCE's lamps. */
export const STAR = 'star';
export type JpLamp = number | typeof STAR;
/** The 12 lamps for a JP CHANCE, clockwise from the top: the star (the JP FINAL), and 34 more per `UNIT` medals bet. */
export const JP_LAMPS: readonly JpLamp[] = [STAR, 1, 6, 0, 2, 10, 2, 0, 6, 2, 4, 1];
/** The JP FINAL: the die rolled again, this face the jackpot. */
export const JP_FACE = 6;
/** The jackpot, per `UNIT` medals bet: 100 times the bet. */
export const JP_PAYS = 200;
/** Any other face at the JP FINAL, per `UNIT` medals bet. */
export const JP_MISS_PAYS = 8;

/** The whale's back: what each of its 10 squares pays when the boat stops on it, per `UNIT` medals bet. */
export const LANE: readonly number[] = [1, 2, 1, 2, 1, 1, 1, 1, 1, 2];
export const LANE_SIZE = LANE.length;
/** The blowhole: past the last square of the whale's back. */
export const BLOWHOLE = LANE_SIZE + 1;
/** The free rolls a WHALE RIDE has. */
export const RIDE_ROLLS = 3;

// ── A roll, drawn ───────────────────────────────────────────────────────────

/** What a roll comes to, drawn the moment ROLL is pressed. */
export interface Draw {
  /** The die: 1 to 6. */
  roll: number;
  /** The whale's three free rolls, for a WHALE RIDE. */
  ride: readonly number[];
  /** The lamp a chance stops on: an index of `LAMPS` or `JP_LAMPS`. */
  lamp: number;
  /** The die at the JP FINAL. */
  final: number;
}

/** How many random numbers a roll is drawn from, always, in order: the die, the whale's three rolls, the lamp, the JP final. */
export const DRAW_NUMBERS = 2 + RIDE_ROLLS + 1;

const cell = (r: number, cells: number): number => Math.min(cells - 1, Math.max(0, Math.floor(r * cells)));

/** A roll from its six random numbers in [0, 1). */
export function drawFrom(numbers: readonly number[]): Draw {
  const [die, a, b, c, lamp, final] = numbers;
  return { roll: faceFrom(die), ride: [faceFrom(a), faceFrom(b), faceFrom(c)], lamp: cell(lamp, LAMP_COUNT), final: faceFrom(final) };
}

/** A roll, drawn: always six numbers, in order. Called in the ROLL button's press. */
export function drawPlay(random: () => number): Draw {
  const numbers: number[] = [];
  for (let i = 0; i < DRAW_NUMBERS; i++) numbers.push(random());
  return drawFrom(numbers);
}

/** The number in [0, 1) that `drawFrom` turns into a face: the middle of its cell. For the tests that rig a roll. */
export const numberForFace = (face: number): number => (face - 0.5) / FACES;
/** The number in [0, 1) that `drawFrom` turns into a lamp. */
export const numberForLamp = (lamp: number): number => (lamp + 0.5) / LAMP_COUNT;

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a roll is one the machine could have drawn. */
export function isDraw(value: unknown): value is Draw {
  if (!isRecordLike(value)) return false;
  const { roll, ride, lamp, final } = value;
  return isFace(roll) && Array.isArray(ride) && ride.length === RIDE_ROLLS && ride.every(isFace) && typeof lamp === 'number' && Number.isInteger(lamp) && lamp >= 0 && lamp < LAMP_COUNT && isFace(final);
}

export const copyDraw = (draw: Draw): Draw => ({ roll: draw.roll, ride: [...draw.ride], lamp: draw.lamp, final: draw.final });

// ── A roll, played ──────────────────────────────────────────────────────────

/** A chance played: the lamps, and for the JP star the final. */
export type Chance =
  | { kind: 'lamp'; lamp: number; pays: number }
  | { kind: 'jp'; lamp: number; star: boolean; final: number | null; jackpot: boolean; pays: number };

/** One of the whale's free rolls: the face, the squares of the whale's back it hops through, and what it pays. */
export interface RideStep {
  roll: number;
  /** The squares hopped through, 1 to 10, then `BLOWHOLE` for the hop that goes past the tenth. */
  hops: number[];
  /** Where it stops: a square of the whale's back, or the blowhole. */
  at: number;
  pays: number;
}

export interface Ride {
  steps: RideStep[];
  /** Whether the boat reached the blowhole, and played the JP CHANCE there. */
  blowhole: boolean;
}

/** An arrow the boat stopped on, and where it carried the boat. */
export interface Sent {
  kind: ArrowKind;
  to: number;
  /** The squares it is carried through, the last being `to`: forward or back one square at a time, or, for the whirlpool, START alone. */
  through: number[];
}

/** A roll, worked out from where the boat stood and the draw: everything the machine shows, and what it pays. */
export interface Play {
  from: number;
  draw: Draw;
  /** The squares the die's roll hops through, in order, the last being the square it lands on. */
  hops: number[];
  /** Whether the boat sailed past (or onto) START: the lap bonus. */
  lap: boolean;
  /** The square the die's roll lands on. */
  landed: number;
  /** An arrow there, and where it carried the boat. */
  sent: Sent | null;
  /** The square that counts: the one landed on, or the one an arrow carried the boat to. */
  stop: number;
  /** What that square pays by itself: a shell's or a pearl's. */
  squarePays: number;
  /** The WHALE RIDE, when the boat stopped on the whale. */
  ride: Ride | null;
  /** A LAMP CHANCE or a JP CHANCE, on the board or at the blowhole. */
  chance: Chance | null;
  /** Where the boat stands after the roll: the square it stopped on (the whale's gate after a ride). */
  to: number;
  /** All the roll pays, per `UNIT` medals bet: the lap bonus, the square, the ride and the chance. */
  pays: number;
  /** Whether it hit the jackpot. */
  jackpot: boolean;
}

/** A JP CHANCE: the lamp, and for the star the final's die. */
function jpChance(lamp: number, final: number): Chance {
  const at = JP_LAMPS[lamp];
  if (at === STAR) {
    const jackpot = final === JP_FACE;
    return { kind: 'jp', lamp, star: true, final, jackpot, pays: jackpot ? JP_PAYS : JP_MISS_PAYS };
  }
  return { kind: 'jp', lamp, star: false, final: null, jackpot: false, pays: at };
}

/** The squares from `from` forward `steps` squares, round the loop: the first square after `from` first. */
const forward = (from: number, steps: number): number[] => Array.from({ length: steps }, (_, i) => (from + i + 1) % BOARD_SIZE);

/** A roll of `draw` from square `from`: where the boat goes, what happens there, and what it pays. */
export function playOf(from: number, draw: Draw): Play {
  const hops = forward(from, draw.roll);
  const landed = hops[hops.length - 1];
  const lap = hops.includes(START);
  const there = BOARD[landed];
  let sent: Sent | null = null;
  let stop = landed;
  if (isArrow(there.kind) && there.to !== null) {
    const to = there.to;
    let through: number[];
    if (there.kind === 'whirlpool') through = [to];
    else if (there.kind === 'tailwind') through = forward(landed, (to - landed + BOARD_SIZE) % BOARD_SIZE);
    else through = Array.from({ length: (landed - to + BOARD_SIZE) % BOARD_SIZE }, (_, i) => (landed - i - 1 + BOARD_SIZE) % BOARD_SIZE);
    sent = { kind: there.kind, to, through };
    stop = to;
  }
  const at = BOARD[stop];
  let squarePays = at.pays;
  let ride: Ride | null = null;
  let chance: Chance | null = null;
  if (at.kind === 'lamp') chance = { kind: 'lamp', lamp: draw.lamp, pays: LAMPS[draw.lamp] };
  else if (at.kind === 'jp') chance = jpChance(draw.lamp, draw.final);
  else if (at.kind === 'whale') {
    const steps: RideStep[] = [];
    let place = 0;
    let blowhole = false;
    for (const roll of draw.ride) {
      const hopsOnBack: number[] = [];
      for (let i = 1; i <= roll; i++) {
        const next = place + i;
        if (next > LANE_SIZE) {
          hopsOnBack.push(BLOWHOLE);
          break;
        }
        hopsOnBack.push(next);
      }
      place = hopsOnBack[hopsOnBack.length - 1];
      if (place === BLOWHOLE) {
        steps.push({ roll, hops: hopsOnBack, at: BLOWHOLE, pays: 0 });
        blowhole = true;
        break;
      }
      steps.push({ roll, hops: hopsOnBack, at: place, pays: LANE[place - 1] });
    }
    ride = { steps, blowhole };
    if (blowhole) chance = jpChance(draw.lamp, draw.final);
  }
  if (at.kind !== 'shell' && at.kind !== 'pearl') squarePays = 0;
  const pays = (lap ? LAP_PAYS : 0) + squarePays + (ride ? ride.steps.reduce((sum, step) => sum + step.pays, 0) : 0) + (chance ? chance.pays : 0);
  const jackpot = chance?.kind === 'jp' && chance.jackpot;
  return { from, draw, hops, lap, landed, sent, stop, squarePays, ride, chance, to: stop, pays, jackpot };
}

/** The medals a roll pays on a bet of `bet`. */
export const wonFor = (bet: number, play: Play): number => medalsFor(bet, play.pays);

/** The named win a roll is to the medal floor: the jackpot, or anything the whale ride brought. */
export type PlayLabel = 'sugoroku-jp' | 'whale-ride';

export function labelOf(play: Play): PlayLabel | null {
  if (play.pays <= 0) return null;
  if (play.jackpot) return 'sugoroku-jp';
  if (play.ride) return 'whale-ride';
  return null;
}

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
  let n = BigInt(num);
  let d = BigInt(den);
  if (d < ZERO) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || ONE;
  return { num: n / g, den: d / g };
};
export const add = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.den + b.num * a.den, a.den * b.den);
export const sub = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.den - b.num * a.den, a.den * b.den);
export const mul = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.num, a.den * b.den);
export const div = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.den, a.den * b.num);
export const compare = (a: Fraction, b: Fraction): number => {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
};
export const isZero = (a: Fraction): boolean => a.num === ZERO;
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};

// ── Every way a roll can go ─────────────────────────────────────────────────

/** The weight of all the ways one roll can be drawn: the die, the whale's three rolls, the lamp and the final's die. */
export const ROLL_WAYS = FACES * FACES ** RIDE_ROLLS * LAMP_COUNT * FACES;

/** One way a roll can go from a square, with its weight out of `ROLL_WAYS`. */
export interface Outcome {
  weight: number;
  play: Play;
}

/**
 * Every way a roll from `from` can go, each with its exact weight out of `ROLL_WAYS`. Only what a roll uses is
 * branched on: the lamp and the final only where a chance is played, the whale's rolls only on a ride, and the final
 * only on the JP star. Every play is worked out by `playOf`, the machine's own rules.
 */
export function outcomesFrom(from: number): Outcome[] {
  const out: Outcome[] = [];
  const perRoll = ROLL_WAYS / FACES;
  const lampWays = (weight: number, make: (lamp: number, final: number) => Draw, jp: boolean) => {
    const perLamp = weight / LAMP_COUNT;
    for (let lamp = 0; lamp < LAMP_COUNT; lamp++) {
      if (jp && JP_LAMPS[lamp] === STAR) {
        for (let final = 1; final <= FACES; final++) out.push({ weight: perLamp / FACES, play: playOf(from, make(lamp, final)) });
      } else out.push({ weight: perLamp, play: playOf(from, make(lamp, 1)) });
    }
  };
  for (let roll = 1; roll <= FACES; roll++) {
    const plain: Draw = { roll, ride: [1, 1, 1], lamp: 0, final: 1 };
    const first = playOf(from, plain);
    const kind = BOARD[first.stop].kind;
    if (kind === 'lamp') lampWays(perRoll, (lamp) => ({ ...plain, lamp }), false);
    else if (kind === 'jp') lampWays(perRoll, (lamp, final) => ({ ...plain, lamp, final }), true);
    else if (kind === 'whale') {
      const perRide = perRoll / FACES ** RIDE_ROLLS;
      for (let a = 1; a <= FACES; a++)
        for (let b = 1; b <= FACES; b++)
          for (let c = 1; c <= FACES; c++) {
            const ride = [a, b, c];
            const rode = playOf(from, { ...plain, ride });
            if (rode.ride?.blowhole) lampWays(perRide, (lamp, final) => ({ roll, ride, lamp, final }), true);
            else out.push({ weight: perRide, play: rode });
          }
    } else out.push({ weight: perRoll, play: first });
  }
  return out;
}

// ── The chain ───────────────────────────────────────────────────────────────

/** Solves π P = π, Σπ = 1 exactly, for a chain given by `moves[s][t]`, the chance of going from s to t. */
function stationary(moves: Fraction[][]): Fraction[] {
  const n = moves.length;
  // The equations Σ_s π_s (P[s][t] − [s = t]) = 0 for every t but the last, which is replaced by Σ π = 1.
  const rows: Fraction[][] = [];
  for (let t = 0; t < n; t++) {
    const row: Fraction[] = [];
    for (let s = 0; s < n; s++) row.push(t === n - 1 ? fraction(1) : sub(moves[s][t], fraction(s === t ? 1 : 0)));
    row.push(fraction(t === n - 1 ? 1 : 0));
    rows.push(row);
  }
  for (let c = 0; c < n; c++) {
    let pivot = c;
    while (pivot < n && isZero(rows[pivot][c])) pivot++;
    if (pivot === n) throw new Error('the chain has no single stationary distribution');
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    const lead = rows[c][c];
    rows[c] = rows[c].map((v) => div(v, lead));
    for (let r = 0; r < n; r++) {
      if (r === c || isZero(rows[r][c])) continue;
      const factor = rows[r][c];
      rows[r] = rows[r].map((v, i) => sub(v, mul(factor, rows[c][i])));
    }
  }
  return rows.map((row) => row[n]);
}

/** How often, in the long run, each kind of thing happens on a roll. */
export interface RollChances {
  /** The lap bonus. */
  lap: Fraction;
  /** Anything paid at all. */
  paid: Fraction;
  /** Moved by an arrow (or the whirlpool). */
  moved: Fraction;
  lamp: Fraction;
  /** A JP CHANCE, on the board or at the blowhole. */
  jpChance: Fraction;
  ride: Fraction;
  blowhole: Fraction;
  jackpot: Fraction;
}

export interface BoardOdds {
  /** For every square: what a roll from it brings back per medal bet. (Squares the boat never stands on have one too.) */
  returns: Fraction[];
  /** For every square: how often the boat stands on it before a roll, in the long run (0 for an arrow). */
  rests: Fraction[];
  /** The squares the boat can stand on before a roll: every square but the arrows. */
  standing: number[];
  /** What steady play brings back per medal bet, in the long run: the rests' average of the returns. */
  longRun: Fraction;
  /** The best and the worst any square the boat can stand on brings back on the next roll. */
  best: Fraction;
  worst: Fraction;
  /** The squares that give `best` and `worst`. */
  bestSquares: number[];
  worstSquares: number[];
  /** What each special square is worth, per medal bet: the lamps, the JP chance, the whale ride. */
  lampChance: Fraction;
  jpChance: Fraction;
  whaleRide: Fraction;
  /** The lap bonus a roll brings in the long run, per medal bet. */
  lapShare: Fraction;
  /** The best any way of choosing the bet by the square can bring back: the biggest bet where a roll is worth more than `threshold`, the smallest elsewhere. */
  betting: { value: Fraction; threshold: Fraction; bigOn: number[] };
  chances: RollChances;
  /** The most one roll can pay, per `UNIT` medals bet. */
  mostPays: number;
}

let odds: BoardOdds | null = null;

/** The board's exact odds: every square's next roll, the long run of steady play, and the best any choice of bet can do. Worked out once, when first asked for. */
export function analyzeBoard(): BoardOdds {
  if (odds) return odds;
  const total = fraction(ROLL_WAYS);
  const returns: Fraction[] = [];
  const moves: Fraction[][] = [];
  const perSquare: RollChances[] = [];
  let mostPays = 0;
  for (let from = 0; from < BOARD_SIZE; from++) {
    let pays = ZERO;
    const to = new Array<number>(BOARD_SIZE).fill(0);
    const counts = { lap: 0, paid: 0, moved: 0, lamp: 0, jpChance: 0, ride: 0, blowhole: 0, jackpot: 0 };
    for (const { weight, play } of outcomesFrom(from)) {
      pays += BigInt(weight) * BigInt(play.pays);
      to[play.to] += weight;
      mostPays = Math.max(mostPays, play.pays);
      if (play.lap) counts.lap += weight;
      if (play.pays > 0) counts.paid += weight;
      if (play.sent) counts.moved += weight;
      if (play.chance?.kind === 'lamp') counts.lamp += weight;
      if (play.chance?.kind === 'jp') counts.jpChance += weight;
      if (play.ride) counts.ride += weight;
      if (play.ride?.blowhole) counts.blowhole += weight;
      if (play.jackpot) counts.jackpot += weight;
    }
    returns.push(fraction(pays, BigInt(ROLL_WAYS * UNIT)));
    moves.push(to.map((weight) => div(fraction(weight), total)));
    perSquare.push(Object.fromEntries(Object.entries(counts).map(([key, weight]) => [key, div(fraction(weight), total)])) as unknown as RollChances);
  }
  const rests = stationary(moves);
  const standing = rests.flatMap((rest, s) => (isZero(rest) ? [] : [s]));
  const sum = (values: Fraction[]): Fraction => values.reduce(add, fraction(0));
  const longRun = sum(standing.map((s) => mul(rests[s], returns[s])));
  const sorted = [...standing].sort((a, b) => compare(returns[a], returns[b]));
  const worst = returns[sorted[0]];
  const best = returns[sorted[sorted.length - 1]];
  const chances = Object.fromEntries(
    (['lap', 'paid', 'moved', 'lamp', 'jpChance', 'ride', 'blowhole', 'jackpot'] as const).map((key) => [key, sum(standing.map((s) => mul(rests[s], perSquare[s][key])))]),
  ) as unknown as RollChances;
  // The best choice of bet by the square: the biggest where a roll is worth at least some threshold, the smallest
  // elsewhere. The chain does not depend on the bet, so this is the best of all the thresholds there are.
  const small = fraction(Math.min(...BETS));
  const big = fraction(BET_MOST);
  let betting: BoardOdds['betting'] | null = null;
  for (const threshold of standing.map((s) => returns[s])) {
    const stake = (s: number) => (compare(returns[s], threshold) >= 0 ? big : small);
    const value = div(sum(standing.map((s) => mul(mul(rests[s], stake(s)), returns[s]))), sum(standing.map((s) => mul(rests[s], stake(s)))));
    if (!betting || compare(value, betting.value) > 0) betting = { value, threshold, bigOn: standing.filter((s) => compare(returns[s], threshold) >= 0) };
  }
  const special = (kind: SquareKind) => {
    // From the square six before one of that kind, only a roll of 6 reaches it: what it brings back there, less the rest.
    const at = BOARD.findIndex((sq) => sq.kind === kind);
    let ways = ZERO;
    let weightAll = ZERO;
    for (const { weight, play } of outcomesFrom((at - 6 + BOARD_SIZE) % BOARD_SIZE)) {
      if (play.landed !== at) continue;
      ways += BigInt(weight) * BigInt(play.pays);
      weightAll += BigInt(weight);
    }
    return fraction(ways, weightAll * BigInt(UNIT));
  };
  odds = {
    returns,
    rests,
    standing,
    longRun,
    best,
    worst,
    bestSquares: standing.filter((s) => compare(returns[s], best) === 0),
    worstSquares: standing.filter((s) => compare(returns[s], worst) === 0),
    lampChance: special('lamp'),
    jpChance: special('jp'),
    whaleRide: special('whale'),
    lapShare: mul(chances.lap, fraction(LAP_PAYS, UNIT)),
    betting: betting!,
    chances,
    mostPays,
  };
  return odds;
}

// ── A check by play ─────────────────────────────────────────────────────────

/** Random numbers in [0, 1) from a seed, the same every time: for the check, never for the machine (mulberry32). */
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

export interface CheckResult {
  rolls: number;
  /** Medals back per medal bet, rolling at the same bet every time. */
  back: number;
  laps: number;
  rides: number;
  jackpots: number;
}

/** Plays `rolls` rolls from START at one bet, each drawn as the machine draws it: what came back, to set beside the exact figures. */
export function checkRolls(rolls: number, random: () => number): CheckResult {
  let at = START;
  let pays = 0;
  let laps = 0;
  let rides = 0;
  let jackpots = 0;
  for (let i = 0; i < rolls; i++) {
    const play = playOf(at, drawPlay(random));
    pays += play.pays;
    if (play.lap) laps += 1;
    if (play.ride) rides += 1;
    if (play.jackpot) jackpots += 1;
    at = play.to;
  }
  return { rolls, back: pays / (Math.max(1, rolls) * UNIT), laps, rides, jackpots };
}
