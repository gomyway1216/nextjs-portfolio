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
 * - Payouts are exact (e.g. Place 6 pays 7:6); results are rounded to cents.
 */

export type Dice = readonly [number, number];
export const POINT_NUMBERS = [4, 5, 6, 8, 9, 10] as const;
export type PointNumber = (typeof POINT_NUMBERS)[number];

export type BetId =
  | 'pass'
  | 'dontPass'
  | 'passOdds'
  | 'dontPassOdds'
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

export const BET_IDS: readonly BetId[] = [
  'pass',
  'dontPass',
  'passOdds',
  'dontPassOdds',
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

export const placeNumber = (id: BetId): PointNumber | null => {
  const m = /^place(\d+)$/.exec(id);
  return m ? (Number(m[1]) as PointNumber) : null;
};
export const hardNumber = (id: BetId): 4 | 6 | 8 | 10 | null => {
  const m = /^hard(\d+)$/.exec(id);
  return m ? (Number(m[1]) as 4 | 6 | 8 | 10) : null;
};

export function rollDice(rng: () => number = Math.random): Dice {
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

const cents = (x: number) => Math.round(x * 100) / 100;
const pay = (stake: number, [num, den]: Ratio) => cents((stake * num) / den);

/** Largest odds stake allowed behind the line bet right now (0 if none). */
export function maxOdds(id: 'passOdds' | 'dontPassOdds', point: PointNumber | null, bets: Bets): number {
  if (point === null) return 0;
  if (id === 'passOdds') return (bets.pass ?? 0) * MAX_PASS_ODDS[point];
  return (bets.dontPass ?? 0) * MAX_LAY_ODDS;
}

export type PlacementError = 'comeOutOnly' | 'needsPoint' | 'needsLineBet' | 'oddsLimit';

/** Why `amount` more cannot go on `id` now, or null if it can. */
export function placementError(id: BetId, amount: number, point: PointNumber | null, bets: Bets): PlacementError | null {
  if ((id === 'pass' || id === 'dontPass') && point !== null) return 'comeOutOnly';
  if (id === 'passOdds' || id === 'dontPassOdds') {
    if (point === null) return 'needsPoint';
    const line = id === 'passOdds' ? bets.pass : bets.dontPass;
    if (!line) return 'needsLineBet';
    if ((bets[id] ?? 0) + amount > maxOdds(id, point, bets)) return 'oddsLimit';
  }
  return null;
}

/** Whether a bet already on the table may be taken back down. */
export function canTakeDown(id: BetId, point: PointNumber | null): boolean {
  return !(point !== null && CONTRACT_BETS.includes(id));
}

export type Outcome = 'win' | 'lose' | 'push';

export interface BetResult {
  id: BetId;
  stake: number;
  outcome: Outcome;
  /** Profit on a win (the stake comes back too); 0 otherwise. */
  profit: number;
  /** Whether the bet stays on the table afterwards (a place bet that won). */
  staysUp: boolean;
}

export interface RollResolution {
  dice: Dice;
  total: number;
  pointBefore: PointNumber | null;
  pointAfter: PointNumber | null;
  /** 'natural' | 'craps' | 'pointSet' | 'pointMade' | 'sevenOut' | 'noDecision' */
  event: RollEvent;
  results: BetResult[];
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
  const remaining: Bets = {};

  const win = (id: BetId, stake: number, ratio: Ratio, staysUp = false) =>
    results.push({ id, stake, outcome: 'win', profit: pay(stake, ratio), staysUp });
  const lose = (id: BetId, stake: number) => results.push({ id, stake, outcome: 'lose', profit: 0, staysUp: false });
  const push = (id: BetId, stake: number) => results.push({ id, stake, outcome: 'push', profit: 0, staysUp: true });
  const keep = (id: BetId, stake: number) => {
    remaining[id] = stake;
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

    if (id === 'pass') {
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

  // Wins pay profit + stake back, except bets that stay up (only the profit comes back).
  const returned = cents(
    results.reduce((sum, r) => sum + (r.outcome === 'win' ? r.profit + (r.staysUp ? 0 : r.stake) : 0), 0),
  );

  return { dice, total, pointBefore: point, pointAfter, event, results, bets: remaining, returned };
}

export const totalOnTable = (bets: Bets) => cents(Object.values(bets).reduce((s, v) => s + (v ?? 0), 0));
