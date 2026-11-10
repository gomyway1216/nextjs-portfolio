/**
 * Post-game review for the interactive tab: replays the learning strategies on
 * the arms the player just faced, so the player's own pulls can be read against
 * what each strategy does on average over the same number of pulls.
 *
 * Regret here is the same quantity runStrategy() accumulates — the best arm's
 * true probability minus the chosen arm's, summed over the pulls — so it depends
 * only on which arms were pulled, never on how the payouts happened to fall.
 */

import { type StrategyName, type StrategySummary, runStrategyMonteCarloAsync } from './engine';

export const REVIEW_STRATEGIES: StrategyName[] = ['thompson', 'ucb1', 'eps-greedy', 'greedy', 'random'];
export const REVIEW_TRIALS = 300;
export const REVIEW_EPSILON = 0.1;

export interface Pull { arm: number; reward: number }

export interface ReviewRow {
  id: 'player' | StrategyName;
  /** Player: reward actually won. Strategy: mean final reward across trials. */
  reward: number;
  /** Player: regret of the arms chosen. Strategy: mean final regret across trials. */
  regret: number;
}

export interface GameReview {
  /** Number of pulls compared (the player's pull count). */
  horizon: number;
  trials: number;
  /** Player's cumulative regret after each pull (length = horizon). */
  playerRegret: number[];
  /** Mean cumulative regret per strategy, in REVIEW_STRATEGIES order. */
  strategies: StrategySummary[];
  /** Player and strategies, lowest regret first. */
  rows: ReviewRow[];
  /** Strategies whose mean regret is strictly higher than the player's. */
  beaten: number;
  /** Arms whose true probability equals the maximum. */
  bestArms: number[];
  /** How many of the player's pulls went to one of `bestArms`. */
  bestArmPulls: number;
}

/** Cumulative regret of a sequence of arm choices against the true probabilities. */
export function cumulativeChoiceRegret(choices: number[], trueProbs: number[]): number[] {
  const pStar = Math.max(...trueProbs);
  let total = 0;
  return choices.map((arm) => {
    total += pStar - trueProbs[arm];
    return total;
  });
}

export function findBestArms(trueProbs: number[]): number[] {
  const pStar = Math.max(...trueProbs);
  return trueProbs.flatMap((p, i) => (p === pStar ? [i] : []));
}

/** Combine the player's pulls with already-simulated strategy summaries. */
export function buildReview(pulls: Pull[], trueProbs: number[], strategies: StrategySummary[]): GameReview {
  const choices = pulls.map((p) => p.arm);
  const playerRegret = cumulativeChoiceRegret(choices, trueProbs);
  const bestArms = findBestArms(trueProbs);
  const player: ReviewRow = {
    id: 'player',
    reward: pulls.reduce((s, p) => s + p.reward, 0),
    regret: playerRegret.length === 0 ? 0 : playerRegret[playerRegret.length - 1],
  };
  const rows: ReviewRow[] = [
    player,
    ...strategies.map((s) => ({ id: s.strategy, reward: s.meanFinalReward, regret: s.meanFinalRegret })),
  ];
  // Stable sort with the player listed first, so a tie leaves the player above.
  rows.sort((a, b) => a.regret - b.regret);
  return {
    horizon: pulls.length,
    trials: strategies[0]?.trials ?? 0,
    playerRegret,
    strategies,
    rows,
    beaten: strategies.filter((s) => s.meanFinalRegret > player.regret).length,
    bestArms,
    bestArmPulls: choices.filter((arm) => bestArms.includes(arm)).length,
  };
}

export interface ReviewOptions {
  signal?: AbortSignal;
  trials?: number;
  rng?: () => number;
}

/**
 * Simulate every review strategy on `trueProbs` for as many pulls as the player
 * made and build the comparison. Yields to the event loop between chunks of
 * trials; resolves to null when aborted.
 */
export async function reviewGame(
  pulls: Pull[],
  trueProbs: number[],
  options: ReviewOptions = {},
): Promise<GameReview | null> {
  const trials = options.trials ?? REVIEW_TRIALS;
  const config = { trueProbs, epsilon: REVIEW_EPSILON };
  const strategies: StrategySummary[] = [];
  for (const strategy of REVIEW_STRATEGIES) {
    if (options.signal?.aborted) return null;
    const summary = await runStrategyMonteCarloAsync(
      strategy,
      config,
      pulls.length,
      trials,
      { signal: options.signal, chunkSize: 50 },
      options.rng,
    );
    if (!summary || options.signal?.aborted) return null;
    strategies.push(summary);
    // Let the page paint between strategies as well as between chunks.
    await new Promise<void>((res) => setTimeout(res, 0));
  }
  if (options.signal?.aborted) return null;
  return buildReview(pulls, trueProbs, strategies);
}

/** Two-decimal regret that never shows a non-zero value as 0.00. */
export function formatRegret(v: number): string {
  if (v > 0 && v < 0.005) return '<0.01';
  return v.toFixed(2);
}
