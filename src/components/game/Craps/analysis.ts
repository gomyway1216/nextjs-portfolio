/**
 * Exact craps math with rational numbers — every figure on the odds tab is an
 * exact fraction derived from the 36 equally likely dice combinations, not a
 * simulation.
 */

import {
  HARD_PAYS,
  LAY_ODDS,
  MAX_LAY_ODDS,
  MAX_PASS_ODDS,
  ONE_ROLL_PAYS,
  PLACE_PAYS,
  POINT_NUMBERS,
  TRUE_ODDS,
  WAYS,
  type BetId,
  type PointNumber,
  type Ratio,
} from './engine';

// ---------- Fractions ----------

export interface Fraction {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export function frac(n: number, d = 1): Fraction {
  if (d === 0) throw new RangeError('zero denominator');
  if (n === 0) return { n: 0, d: 1 }; // never -0
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}
export const add = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d);
export const div = (a: Fraction, b: Fraction) => frac(a.n * b.d, a.d * b.n);
export const toNumber = (f: Fraction) => f.n / f.d;
const ratio = ([n, d]: Ratio) => frac(n, d);
const sum = (fs: Fraction[]) => fs.reduce(add, frac(0));

/** P(total) for one roll. */
export const pRoll = (total: number) => frac(WAYS[total] ?? 0, 36);
/** P(`n` is rolled before a 7). */
export const pBeforeSeven = (n: number) => frac(WAYS[n], WAYS[n] + 6);

// ---------- Per-bet odds ----------

export interface BetOdds {
  id: BetId | 'come';
  win: Fraction;
  lose: Fraction;
  push: Fraction;
  /** Payout description, e.g. "7:6" or "true odds". */
  pays: string;
  /** Expected profit per unit bet, per decision (negative = house edge). */
  ev: Fraction;
  houseEdge: Fraction;
  /** Rolls until this bet is decided, on average. */
  rollsPerDecision: Fraction;
}

function betOdds(
  id: BetOdds['id'],
  win: Fraction,
  lose: Fraction,
  push: Fraction,
  expectedProfitOnWin: Fraction,
  pays: string,
  rollsPerDecision: Fraction,
): BetOdds {
  const ev = sub(expectedProfitOnWin, lose);
  return { id, win, lose, push, pays, ev, houseEdge: frac(-ev.n, ev.d), rollsPerDecision };
}

/** Breakdown of the Pass line: naturals, craps, and each point made. */
export function passLineBreakdown() {
  const natural = add(pRoll(7), pRoll(11));
  const craps = sum([pRoll(2), pRoll(3), pRoll(12)]);
  const points = POINT_NUMBERS.map((p) => {
    const established = pRoll(p);
    const made = pBeforeSeven(p);
    return { point: p, established, made, contribution: mul(established, made) };
  });
  const win = add(natural, sum(points.map((p) => p.contribution)));
  return { natural, craps, points, win, lose: sub(frac(1), win) };
}

/** Expected rolls per Pass/Don't Pass decision: 1 come-out + the point phase when a point is set. */
export function rollsPerLineDecision(): Fraction {
  return add(frac(1), sum(POINT_NUMBERS.map((p) => mul(pRoll(p), frac(36, WAYS[p] + 6)))));
}

export function allBetOdds(): BetOdds[] {
  const line = passLineBreakdown();
  const lineRolls = rollsPerLineDecision();
  const odds: BetOdds[] = [];

  odds.push(betOdds('pass', line.win, line.lose, frac(0), line.win, '1:1', lineRolls));

  // Don't Pass: wins on come-out 2/3 and on seven-out; 12 on the come-out is a push.
  const dpPush = pRoll(12);
  const sevenBefore = (p: PointNumber) => frac(6, WAYS[p] + 6);
  const dpWin = add(add(pRoll(2), pRoll(3)), sum(POINT_NUMBERS.map((p) => mul(pRoll(p), sevenBefore(p)))));
  const dpLose = sub(sub(frac(1), dpWin), dpPush);
  odds.push(betOdds('dontPass', dpWin, dpLose, dpPush, dpWin, '1:1', lineRolls));

  // Odds bets: priced at true odds, so zero edge. Averaged over which point is set.
  const pointProb = sum(POINT_NUMBERS.map(pRoll));
  const avg = (f: (p: PointNumber) => Fraction) => div(sum(POINT_NUMBERS.map((p) => mul(pRoll(p), f(p)))), pointProb);
  const oddsWin = avg(pBeforeSeven);
  const oddsLose = sub(frac(1), oddsWin);
  const oddsRolls = avg((p) => frac(36, WAYS[p] + 6));
  odds.push(betOdds('passOdds', oddsWin, oddsLose, frac(0), avg((p) => mul(pBeforeSeven(p), ratio(TRUE_ODDS[p]))), 'true', oddsRolls));
  odds.push(betOdds('dontPassOdds', oddsLose, oddsWin, frac(0), avg((p) => mul(sub(frac(1), pBeforeSeven(p)), ratio(LAY_ODDS[p]))), 'true', oddsRolls));

  for (const p of POINT_NUMBERS) {
    const win = pBeforeSeven(p);
    const [num, den] = PLACE_PAYS[p];
    odds.push(betOdds(`place${p}` as BetId, win, sub(frac(1), win), frac(0), mul(win, ratio(PLACE_PAYS[p])), `${num}:${den}`, frac(36, WAYS[p] + 6)));
  }

  const fieldWin = sum(Object.keys(ONE_ROLL_PAYS.field).map((t) => pRoll(Number(t))));
  const fieldProfit = sum(Object.entries(ONE_ROLL_PAYS.field).map(([t, r]) => mul(pRoll(Number(t)), ratio(r))));
  odds.push(betOdds('field', fieldWin, sub(frac(1), fieldWin), frac(0), fieldProfit, '1:1 (2 → 2:1, 12 → 3:1)', frac(1)));

  const oneRoll = (id: BetId, totals: number[], r: Ratio) => {
    const win = sum(totals.map(pRoll));
    odds.push(betOdds(id, win, sub(frac(1), win), frac(0), mul(win, ratio(r)), `${r[0]}:${r[1]}`, frac(1)));
  };
  oneRoll('any7', [7], ONE_ROLL_PAYS.any7);
  oneRoll('anyCraps', [2, 3, 12], ONE_ROLL_PAYS.anyCraps);
  oneRoll('yo', [11], ONE_ROLL_PAYS.yo);
  oneRoll('aces', [2], ONE_ROLL_PAYS.aces);
  oneRoll('twelve', [12], ONE_ROLL_PAYS.twelve);

  for (const h of [4, 6, 8, 10] as const) {
    // One hard way vs. the 6 sevens and the easy ways of the same total.
    const hardWays = 1;
    const easyWays = WAYS[h] - 1;
    const win = frac(hardWays, hardWays + easyWays + 6);
    const r = HARD_PAYS[h];
    odds.push(betOdds(`hard${h}` as BetId, win, sub(frac(1), win), frac(0), mul(win, ratio(r)), `${r[0]}:${r[1]}`, frac(36, hardWays + easyWays + 6)));
  }

  return odds;
}

// ---------- Pass line with odds ----------

/**
 * House edge over everything wagered when a Pass bet always takes
 * `multiple(point)` × flat in odds: the odds add action but no edge.
 */
export function combinedPassEdge(multiple: (p: PointNumber) => number): Fraction {
  const line = passLineBreakdown();
  const edge = sub(line.lose, line.win); // −EV per unit of flat bet
  const expectedOdds = sum(POINT_NUMBERS.map((p) => mul(pRoll(p), frac(multiple(p)))));
  return div(edge, add(frac(1), expectedOdds));
}

export const ODDS_OPTIONS: { id: string; multiple: (p: PointNumber) => number }[] = [
  { id: '0x', multiple: () => 0 },
  { id: '1x', multiple: () => 1 },
  { id: '2x', multiple: () => 2 },
  { id: '3-4-5x', multiple: (p) => MAX_PASS_ODDS[p] },
  { id: '10x', multiple: () => 10 },
  { id: '100x', multiple: () => 100 },
];

/** Don't Pass laying the maximum 6× odds, per unit of total action. */
export const combinedDontPassEdge = () => {
  const dp = allBetOdds().find((o) => o.id === 'dontPass')!;
  const pointProb = sum(POINT_NUMBERS.map(pRoll));
  return div(dp.houseEdge, add(frac(1), mul(pointProb, frac(MAX_LAY_ODDS))));
};

// ---------- The shooter ----------

/**
 * Expected rolls in one shooter's turn (until a seven-out). Markov chain over
 * {come-out, point 4…10}: a come-out 7 is a winner, only a 7 during a point
 * ends the turn.
 */
export function expectedShooterRolls(): Fraction {
  // E_p = (1 + P(p)·E_c) · 36 / (ways(p) + 6)
  // E_c = 1 + P(stay on come-out)·E_c + Σ P(p)·E_p
  const stay = sum([7, 11, 2, 3, 12].map(pRoll));
  let constant = frac(1);
  let coeff = sub(frac(1), stay);
  for (const p of POINT_NUMBERS) {
    const k = frac(36, WAYS[p] + 6); // E_p = k + k·P(p)·E_c
    constant = add(constant, mul(pRoll(p), k));
    coeff = sub(coeff, mul(mul(pRoll(p), k), pRoll(p)));
  }
  return div(constant, coeff);
}

/**
 * P(the shooter is still rolling after each roll) for rolls 0…maxRolls,
 * i.e. survival[n] = P(no seven-out in the first n rolls).
 */
export function shooterSurvival(maxRolls: number): number[] {
  const p = (t: number) => WAYS[t] / 36;
  // state[0] = on the come-out, state[i+1] = point POINT_NUMBERS[i]
  let state = [1, 0, 0, 0, 0, 0, 0];
  const survival = [1];
  for (let roll = 1; roll <= maxRolls; roll++) {
    const next = [0, 0, 0, 0, 0, 0, 0];
    // Come-out: 2,3,7,11,12 stay on the come-out; a point number sets the point.
    next[0] += state[0] * (p(2) + p(3) + p(7) + p(11) + p(12));
    POINT_NUMBERS.forEach((pt, i) => {
      next[i + 1] += state[0] * p(pt);
      // On a point: making it returns to the come-out, a 7 ends the turn, anything else waits.
      next[0] += state[i + 1] * p(pt);
      next[i + 1] += state[i + 1] * (1 - p(pt) - p(7));
    });
    state = next;
    survival.push(state.reduce((a, b) => a + b, 0));
  }
  return survival;
}
