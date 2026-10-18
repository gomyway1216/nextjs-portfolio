/**
 * The rules of Moonlit Sic Bo (月夜のシックボー), and their exact odds.
 *
 * Sic Bo (大小, "big and small") is played with three dice shaken under a
 * dome. On the electronic tables of a casino or a medal corner the dice are
 * shaken by the machine, and every area of the layout that the three faces
 * win lights up. Every bet is settled on every roll: there is nothing that
 * carries over, as a point does at craps.
 *
 * ## The layout: 50 areas
 *
 * - **Small** (4 to 10) and **Big** (11 to 17): even money, and both lose on any triple.
 * - **A triple** (all three dice one number, six areas) and **any triple**.
 * - **A double** (at least two dice of one number, six areas).
 * - **A total** of 4 to 17 (fourteen areas; 3 and 18 are triples, and have no area).
 * - **A combination** of two different numbers on two of the dice (fifteen areas).
 * - **A single number** (six areas): it pays once for every die that shows it.
 *
 * ## The paytable
 *
 * One real table, the one the Wizard of Odds gives for Atlantic City
 * (https://wizardofodds.com/games/sic-bo/), "x to 1" with the medal on the
 * area coming back too:
 *
 *     Small, Big 1 · totals 4 and 17: 60, 5 and 16: 30, 6 and 15: 17, 7 and 14: 12, 8 and 13: 8, 9 to 12: 6
 *     a triple 180 · any triple 30 · a double 10 · a combination 5 · a single number 1, 2 or 3 for one, two or three dice
 *
 * Every area brings back less than the medals on it, as at a real table: the
 * best are Small and Big, 35/36 of every medal (97.22%), and the least a
 * total of 9 or 12, 175/216 (81.02%). `analyze` works every figure out over the 216 ways
 * three dice can fall, and the tests add them up again.
 *
 * ## The draw
 *
 * A roll is drawn the moment SHAKE is pressed: three random numbers in
 * [0, 1), one for each die, in order (`drawDice`). The dome only shows it.
 *
 * Everything here is arithmetic: nothing is drawn unless a `random` is passed.
 */

// ── The dice ────────────────────────────────────────────────────────────────

export const FACES = [1, 2, 3, 4, 5, 6] as const;
export type Face = (typeof FACES)[number];
export type Dice = readonly [Face, Face, Face];

export const isFace = (value: unknown): value is Face => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
export const isDice = (value: unknown): value is Dice => Array.isArray(value) && value.length === 3 && value.every(isFace);

/** A die from a random number in [0, 1). */
const faceFrom = (r: number): Face => (Math.min(5, Math.max(0, Math.floor(r * 6))) + 1) as Face;

/** Three dice from three random numbers in [0, 1). */
export const diceFrom = (r1: number, r2: number, r3: number): Dice => [faceFrom(r1), faceFrom(r2), faceFrom(r3)];

/** A roll, drawn: always three numbers, in order. Called in the SHAKE button's press. */
export function drawDice(random: () => number): Dice {
  const r1 = random();
  const r2 = random();
  const r3 = random();
  return diceFrom(r1, r2, r3);
}

export const totalOf = (dice: Dice): number => dice[0] + dice[1] + dice[2];
export const isTriple = (dice: Dice): boolean => dice[0] === dice[1] && dice[1] === dice[2];
/** The dice smallest first, as the boards show them. */
export const sortedDice = (dice: Dice): Dice => [...dice].sort((a, b) => a - b) as unknown as Dice;
/** How many of the dice show `face`. */
export const countOf = (dice: Dice, face: Face): number => (dice[0] === face ? 1 : 0) + (dice[1] === face ? 1 : 0) + (dice[2] === face ? 1 : 0);

/** What a roll is on the board: small, big, or a triple (which is neither). */
export type RollKind = 'small' | 'big' | 'triple';
export const kindOf = (dice: Dice): RollKind => (isTriple(dice) ? 'triple' : totalOf(dice) <= 10 ? 'small' : 'big');

// ── The areas ───────────────────────────────────────────────────────────────

export const TOTALS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const;
export type Total = (typeof TOTALS)[number];

/** The fifteen combinations of two different numbers, in order. */
export const PAIRS: readonly (readonly [Face, Face])[] = FACES.flatMap((a) => FACES.filter((b) => b > a).map((b) => [a, b] as const));

export type BetId =
  | 'small'
  | 'big'
  | 'any-triple'
  | `triple-${Face}`
  | `double-${Face}`
  | `total-${Total}`
  | `pair-${Face}-${Face}`
  | `single-${Face}`;

export type BetKind = 'small' | 'big' | 'any-triple' | 'triple' | 'double' | 'total' | 'pair' | 'single';

/** Every area of the layout, in the order the layout is read: the top band, the totals, the combinations, the singles. */
export const BET_IDS: readonly BetId[] = [
  'small',
  'big',
  'any-triple',
  ...FACES.map((face): BetId => `triple-${face}`),
  ...FACES.map((face): BetId => `double-${face}`),
  ...TOTALS.map((total): BetId => `total-${total}`),
  ...PAIRS.map(([a, b]): BetId => `pair-${a}-${b}`),
  ...FACES.map((face): BetId => `single-${face}`),
];

const BET_SET: ReadonlySet<string> = new Set(BET_IDS);
export const isBetId = (value: unknown): value is BetId => typeof value === 'string' && BET_SET.has(value);

/** What an area is: its kind, and the number, the total or the two numbers it names. */
export interface BetInfo {
  id: BetId;
  kind: BetKind;
  /** The number of a triple, a double or a single. */
  face?: Face;
  total?: Total;
  pair?: readonly [Face, Face];
}

export function betInfo(id: BetId): BetInfo {
  if (id === 'small' || id === 'big' || id === 'any-triple') return { id, kind: id };
  const parts = id.split('-');
  const kind = parts[0] as BetKind;
  if (kind === 'total') return { id, kind, total: Number(parts[1]) as Total };
  if (kind === 'pair') return { id, kind, pair: [Number(parts[1]) as Face, Number(parts[2]) as Face] };
  return { id, kind, face: Number(parts[1]) as Face };
}

// ── The paytable ────────────────────────────────────────────────────────────

/**
 * The Atlantic City paytable (Wizard of Odds, "Sic Bo"), each "x to 1": what a winning medal wins on top of itself.
 * A single number wins once for each die that shows it.
 */
export const PAYTABLE = {
  name: 'Atlantic City',
  source: 'https://wizardofodds.com/games/sic-bo/',
  smallBig: 1,
  total: { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 } as Readonly<Record<Total, number>>,
  triple: 180,
  anyTriple: 30,
  double: 10,
  pair: 5,
  /** For one, two and three dice showing the number. */
  single: [1, 2, 3] as const,
} as const;

/** What an area pays, "x to 1", for the dice: 0 when it does not win. */
export function paysOf(id: BetId, dice: Dice): number {
  const info = betInfo(id);
  const total = totalOf(dice);
  const triple = isTriple(dice);
  switch (info.kind) {
    case 'small':
      return !triple && total >= 4 && total <= 10 ? PAYTABLE.smallBig : 0;
    case 'big':
      return !triple && total >= 11 && total <= 17 ? PAYTABLE.smallBig : 0;
    case 'any-triple':
      return triple ? PAYTABLE.anyTriple : 0;
    case 'triple':
      return triple && dice[0] === info.face ? PAYTABLE.triple : 0;
    case 'double':
      return countOf(dice, info.face!) >= 2 ? PAYTABLE.double : 0;
    case 'total':
      return total === info.total ? PAYTABLE.total[info.total] : 0;
    case 'pair':
      return countOf(dice, info.pair![0]) >= 1 && countOf(dice, info.pair![1]) >= 1 ? PAYTABLE.pair : 0;
    case 'single': {
      const n = countOf(dice, info.face!);
      return n === 0 ? 0 : PAYTABLE.single[n - 1];
    }
  }
}

/** What one medal on `id` brings back when the dice are `dice`: itself and what it wins, or nothing. */
export const backOf = (id: BetId, dice: Dice): number => {
  const pays = paysOf(id, dice);
  return pays > 0 ? pays + 1 : 0;
};

/** Every area the dice win: the ones the layout lights. */
export const winningAreas = (dice: Dice): BetId[] => BET_IDS.filter((id) => paysOf(id, dice) > 0);

// ── A roll ──────────────────────────────────────────────────────────────────

/** Medals on the areas of the layout. */
export type Bets = Partial<Record<BetId, number>>;

export const totalOnLayout = (bets: Bets): number => BET_IDS.reduce((sum, id) => sum + (bets[id] ?? 0), 0);

export interface BetResult {
  id: BetId;
  stake: number;
  /** What comes back off the area: its medals and what they won, or nothing. */
  back: number;
}

export interface RollResolution {
  dice: Dice;
  /** Every bet on the layout, decided: each won or lost. */
  results: BetResult[];
  /** The medals that come back: every winning bet with what it won. */
  returned: number;
  /** The medals the roll decided: every medal on the layout. */
  decided: number;
}

/** Settles every bet on the layout for a roll. */
export function resolveRoll(bets: Bets, dice: Dice): RollResolution {
  const results: BetResult[] = [];
  let returned = 0;
  let decided = 0;
  for (const id of BET_IDS) {
    const stake = bets[id] ?? 0;
    if (stake <= 0) continue;
    const back = stake * backOf(id, dice);
    results.push({ id, stake, back });
    returned += back;
    decided += stake;
  }
  return { dice, results, returned, decided };
}

/** The named win a roll is to the medal floor: a triple bet that won, or else any triple that won. */
export type RollLabel = 'sicbo-triple' | 'sicbo-any-triple';

export function labelOf(resolution: Pick<RollResolution, 'results'>): RollLabel | null {
  const won = resolution.results.filter((result) => result.back > 0);
  if (won.some((result) => betInfo(result.id).kind === 'triple')) return 'sicbo-triple';
  if (won.some((result) => result.id === 'any-triple')) return 'sicbo-any-triple';
  return null;
}

// ── Every roll ──────────────────────────────────────────────────────────────

/** The number of equally likely ways three dice fall. */
export const ROLLS = 216;

/** Every one of the 216 equally likely rolls, by the same function the machine draws with: each die's sixth at its middle. */
export function* everyRoll(): Generator<Dice> {
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) yield diceFrom((a + 0.5) / 6, (b + 0.5) / 6, (c + 0.5) / 6);
}

const ALL_ROLLS: readonly Dice[] = [...everyRoll()];

/** The most one medal on every area at once can bring back on one roll (a triple 2 or 5): what the floor believes a roll can pay, per medal an area. */
export const MOST_BACK_PER_MEDAL = Math.max(...ALL_ROLLS.map((dice) => BET_IDS.reduce((sum, id) => sum + backOf(id, dice), 0)));

// ── Exact odds ──────────────────────────────────────────────────────────────

/** A fraction in lowest terms. */
export interface Fraction {
  num: number;
  den: number;
}

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
};
export const fraction = (num: number, den: number): Fraction => {
  const g = gcd(num, den) || 1;
  const sign = den < 0 ? -1 : 1;
  return { num: (sign * num) / g, den: (sign * den) / g };
};
export const valueOf = (f: Fraction): number => f.num / f.den;

export interface AreaOdds {
  id: BetId;
  info: BetInfo;
  /** What it pays, "x to 1" (for a single number: one die). */
  pays: number;
  /** How many of the 216 rolls win it. */
  wins: number;
  /** Its chance to win a roll. */
  hit: Fraction;
  /** What one medal on it brings back, on average: over the 216 rolls, its medal included. */
  back: Fraction;
  /** What it keeps: 1 − back. */
  edge: Fraction;
  /** For a single number: how many rolls show it on one, two and three dice. */
  matches?: readonly [number, number, number];
  /** How far what one medal on it brings back spreads round its mean. */
  sd: number;
}

/** The exact odds of one area, added up over every roll. */
export function areaOdds(id: BetId): AreaOdds {
  let wins = 0;
  let back = 0;
  let square = 0;
  const matches: [number, number, number] = [0, 0, 0];
  const info = betInfo(id);
  for (const dice of ALL_ROLLS) {
    const b = backOf(id, dice);
    if (b > 0) wins += 1;
    back += b;
    square += b * b;
    if (info.kind === 'single') {
      const n = countOf(dice, info.face!);
      if (n > 0) matches[n - 1] += 1;
    }
  }
  const mean = back / ROLLS;
  const odds: AreaOdds = {
    id,
    info,
    pays: paysWhenWon(id),
    wins,
    hit: fraction(wins, ROLLS),
    back: fraction(back, ROLLS),
    edge: fraction(ROLLS - back, ROLLS),
    sd: Math.sqrt(square / ROLLS - mean * mean),
  };
  if (info.kind === 'single') odds.matches = matches;
  return odds;
}

/** What an area pays, "x to 1", read from the first roll that wins it (a single number: on one die). */
function paysWhenWon(id: BetId): number {
  if (betInfo(id).kind === 'single') return PAYTABLE.single[0];
  const dice = ALL_ROLLS.find((roll) => paysOf(id, roll) > 0)!;
  return paysOf(id, dice);
}

export interface SicBoOdds {
  areas: AreaOdds[];
  /** The best return of any area (Small and Big). */
  best: Fraction;
  /** The least. */
  least: Fraction;
}

/** The exact odds of every area of the layout. Nothing is simulated. */
export function analyze(): SicBoOdds {
  const areas = BET_IDS.map(areaOdds);
  const byValue = [...areas].sort((a, b) => valueOf(a.back) - valueOf(b.back));
  return { areas, best: byValue[byValue.length - 1].back, least: byValue[0].back };
}

// ── A check, for the Odds tab ───────────────────────────────────────────────

/** A random number generator with a seed, so that a check can be run again and come out the same (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The areas the check plays a medal on every roll, one of each kind. */
export const CHECK_AREAS: readonly BetId[] = ['small', 'total-10', 'total-4', 'triple-6', 'any-triple', 'double-3', 'pair-2-5', 'single-4'];

export interface CheckResult {
  rolls: number;
  /** For each area checked, the medals one medal on it every roll brought back, per medal. */
  back: Partial<Record<BetId, number>>;
  triples: number;
}

/** Rolls the dice `rolls` times, each roll as the machine draws it, with one medal on each of `CHECK_AREAS`. */
export function checkRolls(rolls: number, random: () => number): CheckResult {
  const won: Partial<Record<BetId, number>> = {};
  let triples = 0;
  for (let i = 0; i < rolls; i++) {
    const dice = drawDice(random);
    if (isTriple(dice)) triples += 1;
    for (const id of CHECK_AREAS) won[id] = (won[id] ?? 0) + backOf(id, dice);
  }
  const back: Partial<Record<BetId, number>> = {};
  for (const id of CHECK_AREAS) back[id] = (won[id] ?? 0) / Math.max(1, rolls);
  return { rolls, back, triples };
}
