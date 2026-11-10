/**
 * Read-outs for the Play tab that follow the bankroll as it moves. All of the
 * probabilities come from the closed forms in engine.ts, evaluated with the
 * current bankroll as the starting point (the walk is memoryless, so the odds
 * from $b are the same whether you started there or wandered there).
 */
import {
  expectedDuration,
  runRuin,
  theoreticalRuinProb,
  type Outcome,
  type RuinConfig,
  type RunResult,
} from './engine';

export interface LiveOdds {
  ruinProb: number;
  reachProb: number;
  expectedSteps: number;
  /** True once the bankroll sits on $0 or the target, where the odds are exact. */
  settled: boolean;
}

export function oddsFrom(config: RuinConfig, bankroll: number): LiveOdds {
  const here: RuinConfig = { ...config, start: bankroll };
  const ruinProb = theoreticalRuinProb(here);
  return {
    ruinProb,
    reachProb: 1 - ruinProb,
    expectedSteps: expectedDuration(here),
    settled: bankroll <= 0 || bankroll >= config.target,
  };
}

/**
 * Percentage with two decimals. While the run is still open neither outcome is
 * impossible, so a chance that would round to 0.00% or 100.00% is shown as
 * "<0.01%" / ">99.99%" instead.
 */
export function formatChance(prob: number, settled = false): string {
  if (!Number.isFinite(prob)) return '—';
  const p = Math.min(1, Math.max(0, prob));
  if (!settled) {
    if (p < 0.00005) return '<0.01%';
    if (p >= 0.99995) return '>99.99%';
  }
  return `${(p * 100).toFixed(2)}%`;
}

/**
 * Continue a run from wherever the bankroll currently is, spending only what is
 * left of the step cap. The returned trajectory starts at `bankroll`; with no
 * steps left it comes back `capped` without moving.
 */
export function continueRun(
  config: RuinConfig,
  bankroll: number,
  stepsSoFar: number,
  stepCap: number,
  rng: () => number = Math.random,
): RunResult {
  const budget = Math.max(0, stepCap - stepsSoFar);
  return runRuin({ ...config, start: bankroll }, budget, rng);
}

export interface RunReview {
  outcome: Outcome;
  steps: number;
  wins: number;
  losses: number;
  /** Wins a run of this length averages at the configured p (steps × p). */
  expectedWins: number;
  peak: number;
  /** Step at which the peak was first touched (0 = the start). */
  peakStep: number;
  /** Chance of reaching the target as it stood at the peak. */
  reachProbAtPeak: number;
  low: number;
  lowStep: number;
  /** Chance of ruin as it stood at the low. */
  ruinProbAtLow: number;
}

/** Summarise a finished (or capped) run from its full bankroll trajectory. */
export function reviewRun(config: RuinConfig, trajectory: number[], outcome: Outcome): RunReview {
  if (trajectory.length === 0) {
    throw new Error('reviewRun: trajectory must contain the starting bankroll');
  }
  let wins = 0;
  let peak = trajectory[0];
  let peakStep = 0;
  let low = trajectory[0];
  let lowStep = 0;
  for (let i = 1; i < trajectory.length; i++) {
    const v = trajectory[i];
    if (v > trajectory[i - 1]) wins++;
    if (v > peak) { peak = v; peakStep = i; }
    if (v < low) { low = v; lowStep = i; }
  }
  const steps = trajectory.length - 1;
  return {
    outcome,
    steps,
    wins,
    losses: steps - wins,
    expectedWins: steps * config.winProb,
    peak,
    peakStep,
    reachProbAtPeak: oddsFrom(config, peak).reachProb,
    low,
    lowStep,
    ruinProbAtLow: oddsFrom(config, low).ruinProb,
  };
}

export interface RunLogEntry {
  id: number;
  config: RuinConfig;
  review: RunReview;
}

export const RUN_LOG_LIMIT = 10;

/** What the Play tab remembers across runs until the record is cleared. */
export interface PlaySession {
  ruined: number;
  reached: number;
  /** Newest first, at most RUN_LOG_LIMIT entries. */
  log: RunLogEntry[];
  /** Runs recorded so far; the next entry gets this + 1 as its id. */
  runCount: number;
}

export const EMPTY_SESSION: PlaySession = { ruined: 0, reached: 0, log: [], runCount: 0 };

/** Add a finished run to the session: bump its counter and prepend it to the log. */
export function recordRun(session: PlaySession, config: RuinConfig, review: RunReview): PlaySession {
  const id = session.runCount + 1;
  return {
    ruined: session.ruined + (review.outcome === 'ruined' ? 1 : 0),
    reached: session.reached + (review.outcome === 'reached' ? 1 : 0),
    log: [{ id, config, review }, ...session.log].slice(0, RUN_LOG_LIMIT),
    runCount: id,
  };
}
