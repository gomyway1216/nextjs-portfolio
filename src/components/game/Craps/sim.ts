/**
 * Monte Carlo simulations for the craps Simulation tab. Every roll goes through
 * the real rules engine (`resolveRoll`), so the simulations can't drift from the
 * table; the exact numbers they converge to come from `analysis.ts`.
 */

import { ODDS_OPTIONS, allBetOdds, combinedPassEdge, toNumber } from './analysis';
import {
  MAX_PASS_ODDS,
  resolveRoll,
  rollDice,
  totalOnTable,
  type BetId,
  type Bets,
  type PointNumber,
  type RollResolution,
} from './engine';

export type StrategyId = 'pass' | 'passMaxOdds' | 'dontPass' | 'place68' | 'field' | 'any7';
export const STRATEGY_IDS: readonly StrategyId[] = ['passMaxOdds', 'dontPass', 'pass', 'place68', 'field', 'any7'];
export const STRATEGY_COLORS: Record<StrategyId, string> = {
  passMaxOdds: '#22c55e',
  dontPass: '#a78bfa',
  pass: '#38bdf8',
  place68: '#f59e0b',
  field: '#f472b6',
  any7: '#ef4444',
};

/** The base unit each strategy bets (place 6/8 use 6 so 7:6 pays whole units). */
export const UNIT = 5;

/**
 * What each strategy wants on the table before the next roll (amounts it
 * should add). Odds are only added once a point is on, as at a real table.
 */
export function strategyTopUp(id: StrategyId, point: PointNumber | null, bets: Bets): Bets {
  const need = (bet: BetId, amount: number): Bets => {
    const missing = amount - (bets[bet] ?? 0);
    return missing > 0 ? { [bet]: missing } : {};
  };
  switch (id) {
    case 'pass':
      return point === null ? need('pass', UNIT) : {};
    case 'passMaxOdds':
      if (point === null) return need('pass', UNIT);
      return bets.pass ? need('passOdds', bets.pass * MAX_PASS_ODDS[point]) : {};
    case 'dontPass':
      return point === null ? need('dontPass', UNIT) : {};
    case 'place68':
      return { ...need('place6', 6), ...need('place8', 6) };
    case 'field':
      return need('field', UNIT);
    case 'any7':
      return need('any7', UNIT);
  }
}

/** Exact house edge on total action the strategy converges to. */
export function theoreticalEdge(id: StrategyId): number {
  const edges = new Map(allBetOdds().map((o) => [o.id, toNumber(o.houseEdge)]));
  switch (id) {
    case 'pass':
      return edges.get('pass')!;
    case 'passMaxOdds':
      return toNumber(combinedPassEdge(ODDS_OPTIONS.find((o) => o.id === '3-4-5x')!.multiple));
    case 'dontPass':
      return edges.get('dontPass')!;
    case 'place68':
      return edges.get('place6')!;
    case 'field':
      return edges.get('field')!;
    case 'any7':
      return edges.get('any7')!;
  }
}

/** Action (stakes decided) and profit from one roll's results. */
function tally(res: RollResolution): { action: number; profit: number } {
  let action = 0;
  let profit = 0;
  for (const r of res.results) {
    action += r.stake;
    if (r.outcome === 'win') profit += r.profit;
    else if (r.outcome === 'lose') profit -= r.stake;
  }
  return { action, profit };
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface AsyncOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** ~12 checkpoints per decade from 100 rolls up to `rolls`, always ending at `rolls`. */
export function logCheckpoints(rolls: number): number[] {
  const out = new Set<number>();
  for (let e = 2; e <= Math.log10(rolls) + 1e-9; e += 1 / 12) out.add(Math.round(10 ** e));
  out.add(rolls);
  return [...out].filter((n) => n <= rolls).sort((a, b) => a - b);
}

export interface EdgePoint {
  rolls: number;
  /** Observed house edge on action so far (NaN before any bet is decided). */
  edge: number;
}

export type ConvergenceResult = Record<StrategyId, EdgePoint[]>;

/**
 * Plays every strategy on the same sequence of dice for `rolls` rolls and
 * records each one's observed house edge at log-spaced checkpoints.
 */
export async function simulateStrategies(
  rolls: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<ConvergenceResult | null> {
  if (!Number.isInteger(rolls) || rolls <= 0) throw new Error('simulateStrategies: rolls must be a positive integer');
  const checkpoints = logCheckpoints(rolls);
  const state = STRATEGY_IDS.map((id) => ({ id, point: null as PointNumber | null, bets: {} as Bets, action: 0, profit: 0 }));
  const result = Object.fromEntries(STRATEGY_IDS.map((id) => [id, [] as EdgePoint[]])) as ConvergenceResult;
  let next = 0;
  // All strategies share one table (one dice sequence), so point cycles agree.
  for (let i = 1; i <= rolls; i++) {
    const dice = rollDice(rng);
    for (const s of state) {
      const bets = { ...s.bets };
      for (const [bet, add] of Object.entries(strategyTopUp(s.id, s.point, s.bets)) as [BetId, number][]) {
        bets[bet] = (bets[bet] ?? 0) + add;
      }
      const res = resolveRoll(s.point, bets, dice);
      const { action, profit } = tally(res);
      s.action += action;
      s.profit += profit;
      s.point = res.pointAfter;
      s.bets = res.bets;
    }
    if (i === checkpoints[next]) {
      for (const s of state) result[s.id].push({ rolls: i, edge: s.action > 0 ? -s.profit / s.action : NaN });
      next++;
    }
    if (i % 20_000 === 0 && i < rolls) {
      options.onProgress?.(i, rolls);
      if (options.signal?.aborted) return null;
      await yieldToBrowser();
    }
  }
  options.onProgress?.(rolls, rolls);
  return result;
}

export interface SessionConfig {
  strategy: StrategyId;
  bankroll: number;
  /**
   * Betting rolls per session. Afterwards no new bets are made: open line bets
   * are played out to a decision and everything else is taken down.
   */
  maxRolls: number;
}

export interface SessionSummary {
  trials: number;
  finals: number[];
  /** Share of sessions that ended unable to afford the strategy's next bet. */
  bustRate: number;
  aheadRate: number;
  meanFinal: number;
  medianFinal: number;
  /** Average total action per session (every stake that reached a decision). */
  meanAction: number;
  /**
   * Average exact expected loss per session: Σ stake × that bet's own house
   * edge over every decided bet, so it fits any wager mix (e.g. odds skipped
   * when they were unaffordable). By Wald's identity E[final] = bankroll − this.
   */
  meanExpectedLoss: number;
  sampleTrajectory: number[];
}

/** The smallest bankroll that can still follow the strategy from a fresh come-out. */
export const minimumStake = (strategy: StrategyId) => totalOnTable(strategyTopUp(strategy, null, {}));

const BET_EDGE: Partial<Record<BetId, number>> = Object.fromEntries(
  allBetOdds().map((o) => [o.id, toNumber(o.houseEdge)]),
);

/** Resolved-roll budget between yields, so long runs never freeze the page. */
const ROLLS_PER_YIELD = 20_000;

/**
 * A night at the table: each session starts with `bankroll` and follows the
 * strategy for `maxRolls` rolls, adding only bets it can afford. Then it
 * stops betting, plays any open line bet to its decision (so no bet is cut
 * off mid-point, which would bias the result) and takes the rest down.
 */
export async function simulateSessions(
  config: SessionConfig,
  trials: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<SessionSummary | null> {
  const { strategy, bankroll, maxRolls } = config;
  if (!(bankroll > 0) || !Number.isInteger(maxRolls) || maxRolls <= 0) {
    throw new Error('simulateSessions: need a positive bankroll and a positive integer maxRolls');
  }
  if (!Number.isInteger(trials) || trials <= 0) throw new Error('simulateSessions: trials must be a positive integer');

  const minStake = minimumStake(strategy);
  const finals = new Array<number>(trials);
  const sampleTrajectory: number[] = [bankroll];
  let busted = 0;
  let ahead = 0;
  let totalFinal = 0;
  let totalAction = 0;
  let totalExpectedLoss = 0;
  let rollsSinceYield = 0;

  for (let t = 0; t < trials; t++) {
    let credits = bankroll;
    let point: PointNumber | null = null;
    let bets: Bets = {};
    const settle = (res: RollResolution) => {
      credits += res.returned; // exact, like the table (no per-roll rounding bias)
      for (const r of res.results) {
        totalAction += r.stake;
        totalExpectedLoss += r.stake * (BET_EDGE[r.id] ?? 0);
      }
      point = res.pointAfter;
      bets = res.bets;
      rollsSinceYield++;
      if (t === 0) sampleTrajectory.push(credits + totalOnTable(bets));
    };

    for (let roll = 0; roll < maxRolls; roll++) {
      const topUp = strategyTopUp(strategy, point, bets);
      const cost = totalOnTable(topUp);
      if (cost > 0 && cost <= credits) {
        credits -= cost;
        bets = { ...bets };
        for (const [bet, add] of Object.entries(topUp) as [BetId, number][]) bets[bet] = (bets[bet] ?? 0) + add;
      } else if (cost > credits && totalOnTable(bets) === 0) {
        break; // can't afford to play and nothing is working
      }
      settle(resolveRoll(point, bets, rollDice(rng)));
    }

    // Stop betting: play open line bets out, take everything else down.
    const lineOnly = (b: Bets): Bets =>
      Object.fromEntries(Object.entries(b).filter(([id]) => id === 'pass' || id === 'dontPass')) as Bets;
    credits += totalOnTable(bets) - totalOnTable(lineOnly(bets));
    bets = lineOnly(bets);
    while (totalOnTable(bets) > 0) settle(resolveRoll(point, bets, rollDice(rng)));

    finals[t] = credits;
    totalFinal += credits;
    if (credits < minStake) busted++;
    if (credits > bankroll) ahead++;
    if (rollsSinceYield >= ROLLS_PER_YIELD && t + 1 < trials) {
      rollsSinceYield = 0;
      options.onProgress?.(t + 1, trials);
      if (options.signal?.aborted) return null;
      await yieldToBrowser();
    }
  }
  options.onProgress?.(trials, trials);

  const sorted = [...finals].sort((a, b) => a - b);
  const mid = Math.floor(trials / 2);
  return {
    trials,
    finals,
    bustRate: busted / trials,
    aheadRate: ahead / trials,
    meanFinal: totalFinal / trials,
    medianFinal: trials % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    meanAction: totalAction / trials,
    meanExpectedLoss: totalExpectedLoss / trials,
    sampleTrajectory,
  };
}

export interface HandSummary {
  hands: number;
  /** counts[n] = hands that lasted exactly n rolls (n ≥ 1). */
  counts: number[];
  meanRolls: number;
  longest: number;
}

/**
 * Rolls until `hands` shooters have sevened out, recording each hand's length.
 * The hand state (come-out / point / seven-out) comes from the rules engine
 * itself, so it can never diverge from the table.
 */
export async function simulateHands(hands: number, options: AsyncOptions = {}, rng: () => number = Math.random): Promise<HandSummary | null> {
  if (!Number.isInteger(hands) || hands <= 0) throw new Error('simulateHands: hands must be a positive integer');
  const counts: number[] = [];
  let totalRolls = 0;
  let longest = 0;
  let rollsSinceYield = 0;
  for (let h = 0; h < hands; h++) {
    let point: PointNumber | null = null;
    let length = 0;
    for (;;) {
      const res = resolveRoll(point, {}, rollDice(rng));
      length++;
      point = res.pointAfter;
      if (res.event === 'sevenOut') break;
    }
    counts[length] = (counts[length] ?? 0) + 1;
    totalRolls += length;
    rollsSinceYield += length;
    if (length > longest) longest = length;
    if (rollsSinceYield >= ROLLS_PER_YIELD * 5 && h + 1 < hands) {
      rollsSinceYield = 0;
      options.onProgress?.(h + 1, hands);
      if (options.signal?.aborted) return null;
      await yieldToBrowser();
    }
  }
  options.onProgress?.(hands, hands);
  for (let n = 0; n <= longest; n++) counts[n] ??= 0;
  return { hands, counts, meanRolls: totalRolls / hands, longest };
}
