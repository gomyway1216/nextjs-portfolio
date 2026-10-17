/**
 * Craps rules engine: dice, bets, placement rules and roll resolution.
 *
 * Conventions (standard US casino, 3-4-5x odds):
 * - Pass / Don't Pass are contract bets, made only on the come-out roll.
 *   Don't Pass "bars" 12 on the come-out (push).
 * - Odds sit behind a line bet once a point is set: Pass odds up to 3-4-5×
 *   the flat bet (so a win is at most 6× flat), lay odds up to 6×.
 * - Place bets and hardways are OFF on the come-out roll and stay up after a
 *   place win; everything else resolves and comes down.
 * - One-roll bets (Field, Any 7, Any Craps, Yo, Aces, Twelve) resolve every roll.
 * - Come and Don't Come are the line bets made once a point is on: on the
 *   roll after one is made, Come wins on 7 or 11 and loses on 2, 3 or 12, and
 *   Don't Come the other way round (12 barred); any other number moves the
 *   bet to that number (a "come point", `come6`, `dontCome6`), where it is
 *   decided by that number against a 7, whatever the line's point is doing.
 *   A come point can be backed with odds, 3-4-5× the Come bet on it (lay 6×
 *   behind a Don't Come). As at most casinos, the odds behind a come point are
 *   off on the come-out roll (they come back if it decides the come bet); the
 *   lay odds behind a Don't Come are always working. A Come bet on its number
 *   cannot be taken down, as a Pass bet whose point is on cannot.
 * - Payouts are exact fractions of the stake (Place 6 for 5 pays 35/6): no
 *   rounding, so the edge on the table is exactly the edge the odds tab shows.
 *   Amounts are rounded only for display.
 */

export type Dice = readonly [number, number];
export const POINT_NUMBERS = [4, 5, 6, 8, 9, 10] as const;
export type PointNumber = (typeof POINT_NUMBERS)[number];

/** A Come or Don't Come bet that has moved to its number, and the odds behind it. */
export type ComePointBetId = `come${PointNumber}` | `comeOdds${PointNumber}` | `dontCome${PointNumber}` | `dontComeOdds${PointNumber}`;

export type BetId =
  | 'pass'
  | 'dontPass'
  | 'passOdds'
  | 'dontPassOdds'
  | 'come'
  | 'dontCome'
  | ComePointBetId
  | 'place4'
  | 'place5'
  | 'place6'
  | 'place8'
  | 'place9'
  | 'place10'
  | 'field'
  | 'any7'
  | 'anyCraps'
  | 'yo'
  | 'aces'
  | 'twelve'
  | 'hard4'
  | 'hard6'
  | 'hard8'
  | 'hard10';

/** The bets on a come point, number by number: the bet, its odds, the Don't Come bet and its lay. */
export const COME_POINT_BETS: readonly ComePointBetId[] = POINT_NUMBERS.flatMap(
  (n) => [`come${n}`, `comeOdds${n}`, `dontCome${n}`, `dontComeOdds${n}`] as const,
);

export const BET_IDS: readonly BetId[] = [
  'pass',
  'dontPass',
  'passOdds',
  'dontPassOdds',
  'come',
  'dontCome',
  ...COME_POINT_BETS,
  'place4',
  'place5',
  'place6',
  'place8',
  'place9',
  'place10',
  'field',
  'any7',
  'anyCraps',
  'yo',
  'aces',
  'twelve',
  'hard4',
  'hard6',
  'hard8',
  'hard10',
];

export const ONE_ROLL_BETS: readonly BetId[] = ['field', 'any7', 'anyCraps', 'yo', 'aces', 'twelve'];

/** Bets the player may not take down once a point is set. */
const CONTRACT_BETS: readonly BetId[] = ['pass'];

/** The bets that have a place of their own on the layout: every bet but the ones a Come or Don't Come bet moves to. */
export const LAYOUT_BET_IDS: readonly BetId[] = BET_IDS.filter((id) => !(COME_POINT_BETS as readonly BetId[]).includes(id));

export type Bets = Partial<Record<BetId, number>>;

/** Profit : stake as an exact ratio [numerator, denominator]. */
export type Ratio = readonly [number, number];

export const PLACE_PAYS: Record<PointNumber, Ratio> = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };
/** True odds behind Pass (and the inverse for laying against the point). */
export const TRUE_ODDS: Record<PointNumber, Ratio> = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
export const LAY_ODDS: Record<PointNumber, Ratio> = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] };
/** 3-4-5× odds: the most you may take behind a Pass bet, as a multiple of it. */
export const MAX_PASS_ODDS: Record<PointNumber, number> = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
export const MAX_LAY_ODDS = 6;

export const ONE_ROLL_PAYS = {
  field: { 2: [2, 1], 3: [1, 1], 4: [1, 1], 9: [1, 1], 10: [1, 1], 11: [1, 1], 12: [3, 1] } as Record<number, Ratio>,
  any7: [4, 1] as Ratio,
  anyCraps: [7, 1] as Ratio,
  yo: [15, 1] as Ratio,
  aces: [30, 1] as Ratio,
  twelve: [30, 1] as Ratio,
};
export const HARD_PAYS: Record<4 | 6 | 8 | 10, Ratio> = { 4: [7, 1], 6: [9, 1], 8: [9, 1], 10: [7, 1] };

/** Ways each total can be rolled with two dice (out of 36). */
export const WAYS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const isPointNumber = (n: number): n is PointNumber => (POINT_NUMBERS as readonly number[]).includes(n);

// Lookup tables (resolveRoll runs millions of times in the simulations).
const PLACE_NUMBER: Partial<Record<BetId, PointNumber>> = { place4: 4, place5: 5, place6: 6, place8: 8, place9: 9, place10: 10 };
const HARD_NUMBER: Partial<Record<BetId, 4 | 6 | 8 | 10>> = { hard4: 4, hard6: 6, hard8: 8, hard10: 10 };
export const placeNumber = (id: BetId): PointNumber | null => PLACE_NUMBER[id] ?? null;
export const hardNumber = (id: BetId): 4 | 6 | 8 | 10 | null => HARD_NUMBER[id] ?? null;

/** What a come-point bet is: a Come bet on its number, the odds behind it, a Don't Come bet on its number, or its lay. */
export type ComePointKind = 'come' | 'comeOdds' | 'dontCome' | 'dontComeOdds';
const COME_POINT: Partial<Record<BetId, { kind: ComePointKind; n: PointNumber }>> = Object.fromEntries(
  POINT_NUMBERS.flatMap((n) =>
    (['come', 'comeOdds', 'dontCome', 'dontComeOdds'] as const).map((kind) => [`${kind}${n}`, { kind, n }] as const),
  ),
);
/** The kind and number of a come-point bet, or null for any other bet. */
export const comePoint = (id: BetId): { kind: ComePointKind; n: PointNumber } | null => COME_POINT[id] ?? null;
/** The id of a come-point bet. */
export const comePointBet = (kind: ComePointKind, n: PointNumber): ComePointBetId => `${kind}${n}`;

/** The odds bets: behind the line, and behind a come point. */
export type OddsBetId = 'passOdds' | 'dontPassOdds' | `comeOdds${PointNumber}` | `dontComeOdds${PointNumber}`;
export const isOddsBet = (id: BetId): id is OddsBetId => {
  const kind = comePoint(id)?.kind;
  return id === 'passOdds' || id === 'dontPassOdds' || kind === 'comeOdds' || kind === 'dontComeOdds';
};

export function rollDice(rng: () => number = Math.random): Dice {
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

const pay = (stake: number, [num, den]: Ratio) => (stake * num) / den;

/**
 * Largest odds stake allowed behind a line bet or a come point right now (0 if none): 3-4-5× the Pass or Come bet,
 * 6× the Don't Pass or Don't Come bet. The line's odds need its point to be on; a come point's are its own.
 */
export function maxOdds(id: OddsBetId, point: PointNumber | null, bets: Bets): number {
  const come = comePoint(id);
  if (come?.kind === 'comeOdds') return (bets[comePointBet('come', come.n)] ?? 0) * MAX_PASS_ODDS[come.n];
  if (come?.kind === 'dontComeOdds') return (bets[comePointBet('dontCome', come.n)] ?? 0) * MAX_LAY_ODDS;
  if (point === null) return 0;
  if (id === 'passOdds') return (bets.pass ?? 0) * MAX_PASS_ODDS[point];
  return (bets.dontPass ?? 0) * MAX_LAY_ODDS;
}

export type PlacementError =
  | 'comeOutOnly'
  | 'needsPoint'
  | 'needsLineBet'
  | 'oddsLimit'
  /** Come and Don't Come are made only once a point is on (on the come-out they would be Pass and Don't Pass). */
  | 'comeNeedsPoint'
  /** Odds on a come point need a Come (or Don't Come) bet on that number. */
  | 'needsComeBet'
  /** A come point is where a Come bet moves to: nothing is put there straight. */
  | 'comeTravels';

/** Why `amount` more cannot go on `id` now, or null if it can. */
export function placementError(id: BetId, amount: number, point: PointNumber | null, bets: Bets): PlacementError | null {
  if ((id === 'pass' || id === 'dontPass') && point !== null) return 'comeOutOnly';
  if ((id === 'come' || id === 'dontCome') && point === null) return 'comeNeedsPoint';
  if (id === 'passOdds' || id === 'dontPassOdds') {
    if (point === null) return 'needsPoint';
    const line = id === 'passOdds' ? bets.pass : bets.dontPass;
    if (!line) return 'needsLineBet';
    if ((bets[id] ?? 0) + amount > maxOdds(id, point, bets)) return 'oddsLimit';
  }
  const come = comePoint(id);
  if (come?.kind === 'come' || come?.kind === 'dontCome') return 'comeTravels';
  if (come && isOddsBet(id)) {
    if (!bets[comePointBet(come.kind === 'comeOdds' ? 'come' : 'dontCome', come.n)]) return 'needsComeBet';
    if ((bets[id] ?? 0) + amount > maxOdds(id, point, bets)) return 'oddsLimit';
  }
  return null;
}

/** Whether a bet already on the table may be taken back down. A Come bet on its number never may. */
export function canTakeDown(id: BetId, point: PointNumber | null): boolean {
  if (comePoint(id)?.kind === 'come') return false;
  return !(point !== null && CONTRACT_BETS.includes(id));
}

export type Outcome = 'win' | 'lose' | 'push';

export interface BetResult {
  id: BetId;
  stake: number;
  outcome: Outcome;
  /** Profit on a win (the stake comes back too); 0 otherwise. */
  profit: number;
  /**
   * Whether the bet stays on the table afterwards: a place bet that won, a Don't Pass or Don't Come bet barred on a
   * 12. A push that does not stay up (the odds behind a come point, off on the come-out) gives its stake back.
   */
  staysUp: boolean;
}

/** A Come or Don't Come bet that moved to its number on a roll: decided later, by that number against a 7. */
export interface ComeMove {
  id: 'come' | 'dontCome';
  stake: number;
  to: PointNumber;
}

export interface RollResolution {
  dice: Dice;
  total: number;
  pointBefore: PointNumber | null;
  pointAfter: PointNumber | null;
  /** 'natural' | 'craps' | 'pointSet' | 'pointMade' | 'sevenOut' | 'noDecision' */
  event: RollEvent;
  results: BetResult[];
  /** Come and Don't Come bets that moved to their number on this roll. */
  moves: ComeMove[];
  /** Bets left on the table after the roll. */
  bets: Bets;
  /** Credits returned to the player's rack (stakes back + profits). */
  returned: number;
}

export type RollEvent = 'natural' | 'craps' | 'pointSet' | 'pointMade' | 'sevenOut' | 'noDecision';

export function resolveRoll(point: PointNumber | null, bets: Bets, dice: Dice): RollResolution {
  const [a, b] = dice;
  const total = a + b;
  const hard = a === b;
  const results: BetResult[] = [];
  const moves: ComeMove[] = [];
  const remaining: Bets = {};

  const win = (id: BetId, stake: number, ratio: Ratio, staysUp = false) =>
    results.push({ id, stake, outcome: 'win', profit: pay(stake, ratio), staysUp });
  const lose = (id: BetId, stake: number) => results.push({ id, stake, outcome: 'lose', profit: 0, staysUp: false });
  const push = (id: BetId, stake: number) => results.push({ id, stake, outcome: 'push', profit: 0, staysUp: true });
  /** A push that comes down: its stake goes back to the player. */
  const pushDown = (id: BetId, stake: number) => results.push({ id, stake, outcome: 'push', profit: 0, staysUp: false });
  const keep = (id: BetId, stake: number) => {
    remaining[id] = stake;
  };
  /** A Come or Don't Come bet goes to the number rolled, joining any bet of the player's already there. */
  const move = (id: 'come' | 'dontCome', stake: number, to: PointNumber) => {
    const at = comePointBet(id, to);
    remaining[at] = (remaining[at] ?? 0) + stake;
    moves.push({ id, stake, to });
  };

  let event: RollEvent;
  let pointAfter: PointNumber | null = point;
  if (point === null) {
    if (total === 7 || total === 11) event = 'natural';
    else if (total === 2 || total === 3 || total === 12) event = 'craps';
    else {
      event = 'pointSet';
      pointAfter = total as PointNumber;
    }
  } else if (total === point) {
    event = 'pointMade';
    pointAfter = null;
  } else if (total === 7) {
    event = 'sevenOut';
    pointAfter = null;
  } else {
    event = 'noDecision';
  }

  for (const id of BET_IDS) {
    const stake = bets[id];
    if (!stake) continue;
    const place = placeNumber(id);
    const hardN = hardNumber(id);
    const come = comePoint(id);

    if (come) {
      const { kind, n } = come;
      if (kind === 'come') {
        if (total === n) win(id, stake, [1, 1]);
        else if (total === 7) lose(id, stake);
        else keep(id, stake);
      } else if (kind === 'comeOdds') {
        // Off on the come-out: a roll that decides the Come bet there gives its odds back.
        if (point === null && (total === n || total === 7)) pushDown(id, stake);
        else if (total === n) win(id, stake, TRUE_ODDS[n]);
        else if (total === 7) lose(id, stake);
        else keep(id, stake);
      } else if (kind === 'dontCome') {
        if (total === 7) win(id, stake, [1, 1]);
        else if (total === n) lose(id, stake);
        else keep(id, stake);
      } else {
        if (total === 7) win(id, stake, LAY_ODDS[n]);
        else if (total === n) lose(id, stake);
        else keep(id, stake);
      }
    } else if (id === 'come') {
      if (total === 7 || total === 11) win(id, stake, [1, 1]);
      else if (total === 2 || total === 3 || total === 12) lose(id, stake);
      else move(id, stake, total as PointNumber);
    } else if (id === 'dontCome') {
      if (total === 2 || total === 3) win(id, stake, [1, 1]);
      else if (total === 12) {
        push(id, stake);
        keep(id, stake);
      } else if (total === 7 || total === 11) lose(id, stake);
      else move(id, stake, total as PointNumber);
    } else if (id === 'pass') {
      if (event === 'natural' || event === 'pointMade') win(id, stake, [1, 1]);
      else if (event === 'craps' || event === 'sevenOut') lose(id, stake);
      else keep(id, stake);
    } else if (id === 'dontPass') {
      if (point === null && (total === 2 || total === 3)) win(id, stake, [1, 1]);
      else if (point === null && total === 12) {
        push(id, stake);
        keep(id, stake);
      } else if (event === 'natural' || event === 'pointMade') lose(id, stake);
      else if (event === 'sevenOut') win(id, stake, [1, 1]);
      else keep(id, stake);
    } else if (id === 'passOdds') {
      if (point === null) keep(id, stake); // not working without a point (the UI never allows this)
      else if (event === 'pointMade') win(id, stake, TRUE_ODDS[point]);
      else if (event === 'sevenOut') lose(id, stake);
      else keep(id, stake);
    } else if (id === 'dontPassOdds') {
      if (point === null) keep(id, stake);
      else if (event === 'sevenOut') win(id, stake, LAY_ODDS[point]);
      else if (event === 'pointMade') lose(id, stake);
      else keep(id, stake);
    } else if (place !== null) {
      if (point === null) keep(id, stake); // off on the come-out
      else if (total === place) {
        win(id, stake, PLACE_PAYS[place], true);
        keep(id, stake);
      } else if (total === 7) lose(id, stake);
      else keep(id, stake);
    } else if (hardN !== null) {
      if (point === null) keep(id, stake); // off on the come-out
      else if (total === hardN && hard) win(id, stake, HARD_PAYS[hardN]);
      else if (total === hardN || total === 7) lose(id, stake);
      else keep(id, stake);
    } else if (id === 'field') {
      const ratio = ONE_ROLL_PAYS.field[total];
      if (ratio) win(id, stake, ratio);
      else lose(id, stake);
    } else if (id === 'any7') {
      if (total === 7) win(id, stake, ONE_ROLL_PAYS.any7);
      else lose(id, stake);
    } else if (id === 'anyCraps') {
      if (total === 2 || total === 3 || total === 12) win(id, stake, ONE_ROLL_PAYS.anyCraps);
      else lose(id, stake);
    } else if (id === 'yo') {
      if (total === 11) win(id, stake, ONE_ROLL_PAYS.yo);
      else lose(id, stake);
    } else if (id === 'aces') {
      if (total === 2) win(id, stake, ONE_ROLL_PAYS.aces);
      else lose(id, stake);
    } else if (id === 'twelve') {
      if (total === 12) win(id, stake, ONE_ROLL_PAYS.twelve);
      else lose(id, stake);
    }
  }

  // Wins pay profit + stake back, except bets that stay up (only the profit comes back); a push that comes down gives
  // its stake back.
  const returned = results.reduce(
    (sum, r) => sum + (r.outcome === 'win' ? r.profit + (r.staysUp ? 0 : r.stake) : r.outcome === 'push' && !r.staysUp ? r.stake : 0),
    0,
  );

  return { dice, total, pointBefore: point, pointAfter, event, results, moves, bets: remaining, returned };
}

export const totalOnTable = (bets: Bets) => Object.values(bets).reduce((s, v) => s + (v ?? 0), 0);
