/**
 * Candy Shop Medal Maze (駄菓子屋メダルめいろ): the rules, the maze, and its
 * exact odds.
 *
 * The flick-a-coin cabinets that stood outside Japanese candy shops: the coin
 * dropped in at the top is the ball, spring levers on both sides flick it
 * from rail to rail down a glass case, holes along the way swallow it, and a
 * coin that reaches the WIN slit at the bottom brings out a prize ticket. Here
 * the ball is one medal of the player's own, and the prize is medals.
 *
 * ## The rules
 *
 * - **A play takes one medal** (`STAKE`): the medal dropped in is the one that
 *   rolls.
 * - **Four levers** (`STAGES`), right, left, right, left. The medal rolls down
 *   a rail into the cup of the next lever and waits there. A moving gate
 *   stands across the cup's mouth, going round a cycle of eight timing windows
 *   (`WINDOWS`, `WINDOW_MS` each). Pulling the lever back and letting go
 *   flicks the medal at the gate:
 *   - **open:** it sails through, onto the next rail, and on to the next cup;
 *   - **half open:** it clacks against the gate's edge and wobbles: through
 *     one time in two (`wobble`), and otherwise it drops into the OUT hole;
 *   - **shut:** it bounces off the gate into the OUT hole.
 *   How the gate moves (`GATE_PATTERNS`: how many windows it stands open, half
 *   open and shut) is one of eight settings for that lever
 *   (`STAGE_SETTINGS`), drawn as the medal is dropped in; the gate shows it as
 *   it moves. Some settings never open the gate all the way (`flutter`): then
 *   the best flick is a graze, and luck decides.
 * - **A time limit** (`LIMIT_WINDOWS`: three turns of the gate). A medal left
 *   in a cup longer falls through the cup into the OUT hole (`TIMEOUT`), so
 *   that no play waits for ever.
 * - **The pins.** Through the fourth gate the medal drops into a field of four
 *   rows of pins, and goes left or right at each (one time in two), into one
 *   of five pockets (`POCKETS`): the middle one WIN (2 medals), the two at the
 *   very ends BIG WIN (5), the two between OUT.
 * - **Skip, or a page that goes away, finishes the play:** the levers already
 *   flicked keep their timing, and every lever still to come is flicked blind,
 *   at a window drawn with the rest of the play (`blinds`).
 *
 * ## Skill, and why it never beats the machine
 *
 * The timing is the player's, and it matters: a flick in an open window always
 * gets through. But even perfect timing meets a gate that only flutters now
 * and then, and the pins are luck. So the return is worked out for three
 * players (`analyze`), exactly, as fractions of BigInts:
 *
 * - **perfect timing**: the best window at every gate, whatever the setting;
 *   no way of playing brings back more, and this is the machine's best return;
 * - **an everyday player** (`TYPICAL_HIT`): aims at the middle of the opening
 *   (or at the better edge of a gate that only flutters) and lands in that
 *   window half the time, one window early or one late a quarter of the time
 *   each;
 * - **blind presses**: any window, each as likely.
 *
 * Every gate is a stage of a dynamic programme: what a medal sitting in its
 * cup is worth is the chance of each setting, times the chance the player's
 * flick gets through, times what the next cup is worth; the last cup leads to
 * the pins.
 *
 * ## The draw
 *
 * Everything random about a play is drawn the moment the medal is dropped in
 * (`drawPlay`), always twenty numbers in [0, 1), in this order: for each gate
 * its setting, the window it is in as the medal settles in the cup (`phases`),
 * whether a graze gets through, and the window a blind flick lands in; then a
 * number for each row of pins. The flicks themselves draw nothing: the player
 * chooses among windows already drawn.
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── The maze ────────────────────────────────────────────────────────────────

/** Medals a play takes: the one dropped in, which rolls. */
export const STAKE = 1;
/** The levers, each with its gate. */
export const STAGES = 4;
/** The timing windows of one turn of a gate. */
export const WINDOWS = 8;
/** How long one window lasts, in ms. */
export const WINDOW_MS = 300;
/** How long a medal may wait in a cup, in windows: three turns of its gate. */
export const LIMIT_WINDOWS = 3 * WINDOWS;
/** The "window" of a flick that never came: the time ran out. */
export const TIMEOUT = WINDOWS;

/** Where a gate stands in a window: open, half open (a graze), or shut. */
export type Slot = 'open' | 'half' | 'shut';
/** How a gate moves: how long it stands open in a turn. */
export type GateKind = 'wide' | 'mid' | 'narrow' | 'slit' | 'flutter';
export const GATE_KINDS: readonly GateKind[] = ['wide', 'mid', 'narrow', 'slit', 'flutter'];

const slotsOf = (text: string): readonly Slot[] => [...text].map((c) => (c === 'O' ? 'open' : c === 'H' ? 'half' : 'shut'));

/**
 * Each kind of gate's turn, window by window: it opens through a half-open window, stands open, closes through another,
 * and stays shut. A fluttering gate only ever half opens.
 */
export const GATE_PATTERNS: Readonly<Record<GateKind, readonly Slot[]>> = {
  wide: slotsOf('HOOOOHSS'),
  mid: slotsOf('HOOOHSSS'),
  narrow: slotsOf('HOOHSSSS'),
  slit: slotsOf('HOHSSSSS'),
  flutter: slotsOf('HHSSSSSS'),
};

/** The eight settings of each lever's gate, one drawn for every play: later gates open less, as later holes are harder on a real cabinet. */
export const STAGE_SETTINGS: readonly (readonly GateKind[])[] = [
  ['wide', 'wide', 'wide', 'wide', 'wide', 'mid', 'mid', 'flutter'],
  ['wide', 'wide', 'wide', 'mid', 'mid', 'mid', 'narrow', 'flutter'],
  ['mid', 'mid', 'mid', 'mid', 'mid', 'narrow', 'flutter', 'flutter'],
  ['mid', 'mid', 'mid', 'mid', 'narrow', 'slit', 'flutter', 'flutter'],
];

/** Which side of the case each lever stands on: right, left, right, left. */
export const SIDES: readonly ('right' | 'left')[] = ['right', 'left', 'right', 'left'];

/** Rows of pins under the fourth gate. */
export const PIN_ROWS = 4;
export type Pocket = 'big' | 'win' | 'out';
/** The pockets under the pins, left to right: a medal that goes right at `k` rows of pins lands in pocket `k`. */
export const POCKETS: readonly Pocket[] = ['big', 'out', 'win', 'out', 'big'];
/** What each pocket pays, in medals, for the one medal a play takes. */
export const PAYS: Readonly<Record<Pocket, number>> = { big: 5, win: 2, out: 0 };
/** The most a play can pay. */
export const MOST_WIN = Math.max(...Object.values(PAYS));

/** The gate kind a lever has on a play: its setting drawn. */
export const gateOf = (stage: number, setting: number): GateKind => STAGE_SETTINGS[stage][setting];
/** Where a gate stands in window `window` (0 to 7). */
export const slotOf = (kind: GateKind, window: number): Slot => GATE_PATTERNS[kind][((window % WINDOWS) + WINDOWS) % WINDOWS];
/** How open a gate looks in each kind of window, from 0 (shut) to 1 (open). */
export const OPENING: Readonly<Record<Slot, number>> = { shut: 0, half: 0.45, open: 1 };

// ── The draw ────────────────────────────────────────────────────────────────

/** Everything random about a play, drawn as the medal is dropped in. */
export interface Draw {
  /** Each gate's setting: its place in `STAGE_SETTINGS[stage]`, 0 to 7. */
  gates: number[];
  /** The window each gate is in at the moment the medal settles in its cup, 0 to 7. */
  phases: number[];
  /** Whether a graze at each gate gets through. */
  wobbles: boolean[];
  /** The window a blind flick at each gate lands in, 0 to 7: used for a skip, or a page that goes away. */
  blinds: number[];
  /** At each row of pins, whether the medal goes right. */
  pins: boolean[];
}

/** How many numbers in [0, 1) a draw takes. */
export const DRAW_NUMBERS = STAGES * 4 + PIN_ROWS;

const eighth = (n: number): number => Math.min(WINDOWS - 1, Math.max(0, Math.floor(n * WINDOWS)));

/** A play's draw, from `DRAW_NUMBERS` random numbers in [0, 1): each gate's setting, phase, wobble and blind window, then the pins. */
export function drawPlay(random: () => number): Draw {
  const draw: Draw = { gates: [], phases: [], wobbles: [], blinds: [], pins: [] };
  for (let s = 0; s < STAGES; s++) {
    draw.gates.push(eighth(random()));
    draw.phases.push(eighth(random()));
    draw.wobbles.push(random() < 0.5);
    draw.blinds.push(eighth(random()));
  }
  for (let r = 0; r < PIN_ROWS; r++) draw.pins.push(random() < 0.5);
  return draw;
}

/** The number that draws `k` of eight (a setting, a phase or a window): for a test that rigs the draw. */
export const numberForEighth = (k: number): number => (k + 0.5) / WINDOWS;
/** The number that draws a yes (a graze that gets through, a pin that sends the medal right). */
export const numberForYes = (yes: boolean): number => (yes ? 0.25 : 0.75);
/** The numbers that draw `draw`, in the order `drawPlay` takes them. */
export function numbersFor(draw: Draw): number[] {
  const numbers: number[] = [];
  for (let s = 0; s < STAGES; s++) numbers.push(numberForEighth(draw.gates[s]), numberForEighth(draw.phases[s]), numberForYes(draw.wobbles[s]), numberForEighth(draw.blinds[s]));
  for (const right of draw.pins) numbers.push(numberForYes(right));
  return numbers;
}

const isEighth = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < WINDOWS;
const listOf = <T>(value: unknown, length: number, each: (item: unknown) => item is T): value is T[] => Array.isArray(value) && value.length === length && value.every(each);
const isBool = (value: unknown): value is boolean => typeof value === 'boolean';

/** Whether a value is a draw the machine could have made. */
export function isDraw(value: unknown): value is Draw {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return listOf(d.gates, STAGES, isEighth) && listOf(d.phases, STAGES, isEighth) && listOf(d.wobbles, STAGES, isBool) && listOf(d.blinds, STAGES, isEighth) && listOf(d.pins, PIN_ROWS, isBool);
}
export const copyDraw = (draw: Draw): Draw => ({ gates: [...draw.gates], phases: [...draw.phases], wobbles: [...draw.wobbles], blinds: [...draw.blinds], pins: [...draw.pins] });
/** Whether a value is a flick: a window, or the time running out. */
export const isFlick = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= TIMEOUT;

// ── A play ──────────────────────────────────────────────────────────────────

/** How a flick at a gate ended. */
export type StageEnd = 'through' | 'graze-through' | 'graze-out' | 'shut' | 'timeout';
export const passed = (end: StageEnd): boolean => end === 'through' || end === 'graze-through';

export interface StagePlay {
  stage: number;
  gate: GateKind;
  /** The window flicked in, or `TIMEOUT`. */
  window: number;
  /** Where the gate stood then (null for a flick that never came). */
  slot: Slot | null;
  end: StageEnd;
  /** Whether it was flicked blind (a skip, or a page that went away), not by the player. */
  blind: boolean;
}

export interface Play {
  /** The gates flicked so far, in order. */
  stages: StagePlay[];
  /** The gate whose OUT hole the medal fell into, or null. */
  outAt: number | null;
  /** The pocket under the pins (0 to 4), once it is there. */
  bin: number | null;
  pocket: Pocket | null;
  /** Medals the play pays: nothing until it has ended. */
  won: number;
  /** Whether the play has ended: OUT at a gate, or in a pocket. */
  complete: boolean;
}

/** How a flick in `window` at gate `stage` ends, on a play drawn as `draw`. */
export function endOf(draw: Draw, stage: number, window: number): { gate: GateKind; slot: Slot | null; end: StageEnd } {
  const gate = gateOf(stage, draw.gates[stage]);
  if (window === TIMEOUT) return { gate, slot: null, end: 'timeout' };
  const slot = slotOf(gate, window);
  const end: StageEnd = slot === 'open' ? 'through' : slot === 'half' ? (draw.wobbles[stage] ? 'graze-through' : 'graze-out') : 'shut';
  return { gate, slot, end };
}

/** The pocket the pins send the medal to: how many times it went right. */
export const binOf = (pins: readonly boolean[]): number => pins.filter(Boolean).length;

/**
 * A play as far as it has gone: the flicks made (`flicks`, a window or `TIMEOUT` for each gate reached), and, with
 * `finish`, every gate still to come flicked blind, at the window drawn for it.
 */
export function playOf(draw: Draw, flicks: readonly number[], finish = false): Play {
  const stages: StagePlay[] = [];
  for (let stage = 0; stage < STAGES; stage++) {
    const own = stage < flicks.length;
    if (!own && !finish) return { stages, outAt: null, bin: null, pocket: null, won: 0, complete: false };
    const window = own ? flicks[stage] : draw.blinds[stage];
    const { gate, slot, end } = endOf(draw, stage, window);
    stages.push({ stage, gate, window, slot, end, blind: !own });
    if (!passed(end)) return { stages, outAt: stage, bin: null, pocket: null, won: 0, complete: true };
  }
  const bin = binOf(draw.pins);
  const pocket = POCKETS[bin];
  return { stages, outAt: null, bin, pocket, won: PAYS[pocket], complete: true };
}

/** The flicks of a play played to its end: those made, then blind ones until it has ended. */
export const finishedFlicks = (draw: Draw, flicks: readonly number[]): number[] => playOf(draw, flicks, true).stages.map((stage) => stage.window);

/** Whether `flicks` could be the flicks of a play drawn as `draw`: none after the medal fell OUT. */
export function flicksFit(draw: Draw, flicks: readonly number[]): boolean {
  if (flicks.length > STAGES || !flicks.every(isFlick)) return false;
  for (let stage = 0; stage < flicks.length - 1; stage++) if (!passed(endOf(draw, stage, flicks[stage]).end)) return false;
  return true;
}

/** What the medal floor calls a play's prize: the BIG WIN and the WIN by name. */
export const labelOf = (play: Play): string | null => (play.pocket === 'big' ? 'maze-big' : play.pocket === 'win' ? 'maze-win' : null);

/** The window a gate is in, `elapsed` ms after the medal settled in its cup, with the gate's phase `phase`. */
export const windowAt = (phase: number, elapsed: number): number => (((phase + Math.floor(elapsed / WINDOW_MS)) % WINDOWS) + WINDOWS) % WINDOWS;

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
export const add = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.den + b.num * a.den, a.den * b.den);
export const mul = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.num, a.den * b.den);
export const less = (a: Fraction, b: Fraction): boolean => a.num * b.den < b.num * a.den;
const FZERO = fraction(0);
const sum = (parts: readonly Fraction[]): Fraction => parts.reduce(add, FZERO);
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};

// ── The odds ────────────────────────────────────────────────────────────────

/** The chance a flick in a window gets through, before the wobble is known: 1 open, 1/2 half open, 0 shut. */
const THROUGH: Readonly<Record<Slot, Fraction>> = { open: fraction(1), half: fraction(1, 2), shut: FZERO };
const throughIn = (kind: GateKind, window: number): Fraction => (window === TIMEOUT ? FZERO : THROUGH[slotOf(kind, window)]);

/** A way of flicking a gate of a kind: the chance of each window (and of the time running out). */
export type Policy = (kind: GateKind) => readonly { window: number; chance: Fraction }[];

/** The everyday player's aim and its spread: in the window aimed at half the time, a window early or late a quarter each. */
export const TYPICAL_HIT = { on: fraction(1, 2), early: fraction(1, 4), late: fraction(1, 4) } as const;

const spread = (aim: number) => [
  { window: aim, chance: TYPICAL_HIT.on },
  { window: (aim + WINDOWS - 1) % WINDOWS, chance: TYPICAL_HIT.early },
  { window: (aim + 1) % WINDOWS, chance: TYPICAL_HIT.late },
];
const throughUnder = (kind: GateKind, flicks: readonly { window: number; chance: Fraction }[]): Fraction => sum(flicks.map(({ window, chance }) => mul(chance, throughIn(kind, window))));

/** The window perfect timing picks at a gate: the first of the best, open where it ever opens. */
export function bestWindow(kind: GateKind): number {
  let best = 0;
  for (let w = 1; w < WINDOWS; w++) if (less(throughIn(kind, best), throughIn(kind, w))) best = w;
  return best;
}
/** The window the everyday player aims at: the one whose spread gets through most (the middle of the opening). */
export function typicalAim(kind: GateKind): number {
  let best = 0;
  for (let w = 1; w < WINDOWS; w++) if (less(throughUnder(kind, spread(best)), throughUnder(kind, spread(w)))) best = w;
  return best;
}

export const PERFECT: Policy = (kind) => [{ window: bestWindow(kind), chance: fraction(1) }];
export const TYPICAL: Policy = (kind) => spread(typicalAim(kind));
export const BLIND: Policy = () => Array.from({ length: WINDOWS }, (_, window) => ({ window, chance: fraction(1, WINDOWS) }));

/** The chance a medal sitting in gate `stage`'s cup gets through it, flicked by `policy`: every setting, each 1 in 8. */
export const stagePass = (stage: number, policy: Policy): Fraction => sum(STAGE_SETTINGS[stage].map((kind) => mul(fraction(1, WINDOWS), throughUnder(kind, policy(kind)))));
/** The chance a gate of a kind is got through, flicked by `policy`. */
export const gatePass = (kind: GateKind, policy: Policy): Fraction => throughUnder(kind, policy(kind));

/** The chance of each pocket under the pins: C(4, k) / 16. */
export const POCKET_CHANCES: readonly Fraction[] = (() => {
  let row = [1];
  for (let r = 0; r < PIN_ROWS; r++) row = [...row, 0].map((ways, k) => ways + (k > 0 ? row[k - 1] : 0));
  return row.map((ways) => fraction(ways, 2 ** PIN_ROWS));
})();

/** What a medal dropping into the pins is worth, in medals: each pocket's chance times its pay. */
export const PINS_WORTH: Fraction = sum(POCKETS.map((pocket, k) => mul(POCKET_CHANCES[k], fraction(PAYS[pocket]))));

/**
 * What a medal sitting in gate `from`'s cup is worth, in medals, flicked by `policies[s]` at each gate `s` from there:
 * the dynamic programme, worked from the pins back up to the cup.
 */
export function worthFrom(from: number, policies: readonly Policy[]): Fraction {
  let worth = PINS_WORTH;
  for (let stage = STAGES - 1; stage >= from; stage--) worth = mul(stagePass(stage, policies[stage]), worth);
  return worth;
}

const all = (policy: Policy): Policy[] => Array.from({ length: STAGES }, () => policy);

export interface ModelOdds {
  /** Medals back per medal played. */
  back: Fraction;
  /** The chance of getting through each gate, reached. */
  stages: Fraction[];
  /** The chance of reaching the pins. */
  reach: Fraction;
  win: Fraction;
  big: Fraction;
}

const modelOf = (policy: Policy): ModelOdds => {
  const stages = Array.from({ length: STAGES }, (_, stage) => stagePass(stage, policy));
  const reach = stages.reduce(mul, fraction(1));
  return {
    back: mul(worthFrom(0, all(policy)), fraction(1, STAKE)),
    stages,
    reach,
    win: mul(reach, sum(POCKETS.map((pocket, k) => (pocket === 'win' ? POCKET_CHANCES[k] : FZERO)))),
    big: mul(reach, sum(POCKETS.map((pocket, k) => (pocket === 'big' ? POCKET_CHANCES[k] : FZERO)))),
  };
};

export interface MazeOdds {
  perfect: ModelOdds;
  typical: ModelOdds;
  blind: ModelOdds;
  /** What a play brings back with perfect timing at the gates before `s` and blind flicks from gate `s` on (a skip there): `skipAt[STAGES]` is perfect play. */
  skipAt: Fraction[];
}

let odds: MazeOdds | null = null;

/** The maze's exact odds, worked out once, when first asked for. */
export function analyze(): MazeOdds {
  if (odds) return odds;
  const skipAt = Array.from({ length: STAGES + 1 }, (_, s) => worthFrom(0, Array.from({ length: STAGES }, (_, stage) => (stage < s ? PERFECT : BLIND))));
  odds = { perfect: modelOf(PERFECT), typical: modelOf(TYPICAL), blind: modelOf(BLIND), skipAt };
  return odds;
}

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

export type Player = 'perfect' | 'typical' | 'blind';

/** A flick at a gate of a kind, as `player` makes it, with `random` for a hand that is not perfect. */
export function flickAs(player: Player, kind: GateKind, random: () => number): number {
  if (player === 'perfect') return bestWindow(kind);
  if (player === 'blind') return eighth(random());
  const n = random();
  const aim = typicalAim(kind);
  return n < 0.5 ? aim : n < 0.75 ? (aim + WINDOWS - 1) % WINDOWS : (aim + 1) % WINDOWS;
}

export interface CheckResult {
  plays: number;
  /** Medals back per medal played. */
  back: number;
  /** Plays that reached the pins, a WIN and a BIG WIN. */
  reached: number;
  wins: number;
  bigs: number;
}

/** Plays `plays` plays as `player`, drawn from `random`: what came back, to set beside the exact figures. */
export function checkPlays(plays: number, player: Player, random: () => number): CheckResult {
  let back = 0;
  let reached = 0;
  let wins = 0;
  let bigs = 0;
  for (let p = 0; p < plays; p++) {
    const draw = drawPlay(random);
    const flicks: number[] = [];
    let play = playOf(draw, flicks);
    while (!play.complete) {
      flicks.push(flickAs(player, gateOf(flicks.length, draw.gates[flicks.length]), random));
      play = playOf(draw, flicks);
    }
    back += play.won;
    if (play.bin !== null) reached += 1;
    if (play.pocket === 'win') wins += 1;
    if (play.pocket === 'big') bigs += 1;
  }
  return { plays, back: back / (plays * STAKE), reached, wins, bigs };
}
