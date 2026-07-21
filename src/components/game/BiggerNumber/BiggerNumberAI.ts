/**
 * Bigger Number — AI strategies.
 *
 * The game is a repeated, simultaneous-move, zero-sum game of imperfect
 * information: each side secretly commits a tile, both reveal at once. Against
 * a naive "always maximise this round's EV against a uniform opponent" bot the
 * optimal counter-strategy is easy to find, so a genuinely strong AI must
 * randomise — it needs a mixed strategy that no opponent can exploit. That is
 * exactly a Nash equilibrium of the round's payoff matrix.
 *
 * Difficulty tiers:
 *   easy   — picks uniformly at random.
 *   medium — greedy one-round expected value assuming the opponent plays a
 *            uniformly-random remaining tile. Non-trivial and directional, but
 *            exploitable (deterministic).
 *   hard   — game-theoretically sound. Builds the payoff matrix for the current
 *            state, where each cell is the *value of the resulting sub-game*
 *            (looked ahead with memoised recursion when the remaining hands are
 *            small, or a strong heuristic leaf evaluation otherwise), solves the
 *            zero-sum matrix game for its Nash equilibrium mixed strategy, and
 *            samples from it. This is unexploitable in the limit and mixes its
 *            Dragon / high tiles unpredictably.
 *   master — hard's equilibrium play plus safe opponent exploitation. It keeps
 *            an empirical model of which slice of their remaining hand the
 *            opponent tends to play (low / middle / high tiles, conditioned on
 *            the score situation), best-responds to that estimated policy, and
 *            blends the best response with the equilibrium mix. Trust in the
 *            model grows with sample size and is capped, so its worst-case
 *            exploitability stays bounded while it punishes predictable humans.
 */

import type {
  AIDifficulty,
  BiggerNumberRules,
  CardValue,
  RoundOutcome,
} from './types';
import { isDragon, resolveRound } from './gameLogic';

export interface AIDecision {
  card: CardValue;
}

/** Match progress the hard AI needs to value future rounds correctly. */
export interface MatchContext {
  /** Rounds the AI (the deciding side) still needs to clinch the match. */
  myWinsNeeded: number;
  /** Rounds the opponent still needs to clinch the match. */
  oppWinsNeeded: number;
  /** Rounds remaining before the match ends on total-rounds exhaustion. */
  roundsLeft: number;
}

/**
 * Pick a card for the AI.
 *
 * `rng` is injectable for deterministic testing; defaults to Math.random.
 * `context` refines the hard AI's lookahead; when omitted it optimises purely
 * for round win-rate (a sensible, still-strong default).
 * `model` (master only) is the persistent opponent model — create it with
 * `createOpponentModel()` and feed it via `observeOpponentPlay()` after each
 * reveal. Without a model, master plays exactly like hard.
 */
export function pickAICard(
  difficulty: AIDifficulty,
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
  context?: MatchContext,
  rng: () => number = Math.random,
  model?: OpponentModelState,
): AIDecision {
  if (myHand.length === 0) {
    throw new Error('AI has no cards to play');
  }
  switch (difficulty) {
    case 'easy':
      return { card: pickRandom(myHand, rng) };
    case 'medium':
      return { card: pickByExpectedValue(rules, myHand, opponentHand) };
    case 'hard':
      return { card: pickNash(rules, myHand, opponentHand, context, rng) };
    case 'master':
      return { card: pickMaster(rules, myHand, opponentHand, context, rng, model) };
  }
}

function pickRandom<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rankForOrdering(card: CardValue): number {
  // Dragon sits mid-pack for pure ordering purposes.
  return isDragon(card) ? 5 : card;
}

function outcomeScore(outcome: RoundOutcome, meIsP1: boolean): number {
  if (outcome === 'tie') return 0;
  const iWon = meIsP1 ? outcome === 'p1' : outcome === 'p2';
  return iWon ? 1 : -1;
}

/** +1 / 0 / -1 from the deciding side's perspective for a single matchup. */
function cellValue(rules: BiggerNumberRules, myCard: CardValue, oppCard: CardValue): number {
  // We treat the deciding side as p1.
  const result = resolveRound(rules, myCard, oppCard);
  return outcomeScore(result.outcome, true);
}

// ---------------------------------------------------------------------------
// Medium: greedy expected value against a uniform opponent model.
// ---------------------------------------------------------------------------

function pickByExpectedValue(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
): CardValue {
  if (opponentHand.length === 0) return lowestByRank(myHand);

  let bestCard: CardValue = myHand[0];
  let bestScore = -Infinity;
  let bestRank = Infinity;

  for (const candidate of myHand) {
    let total = 0;
    for (const opp of opponentHand) total += cellValue(rules, candidate, opp);
    const ev = total / opponentHand.length;
    const rank = rankForOrdering(candidate);

    // Prefer higher EV; on ties conserve power (play the lower-ranked tile).
    if (ev > bestScore || (ev === bestScore && rank < bestRank)) {
      bestScore = ev;
      bestRank = rank;
      bestCard = candidate;
    }
  }
  return bestCard;
}

function lowestByRank(hand: CardValue[]): CardValue {
  return [...hand].sort((a, b) => rankForOrdering(a) - rankForOrdering(b))[0];
}

// ---------------------------------------------------------------------------
// Hard: Nash-equilibrium mixed strategy over a looked-ahead payoff matrix.
// ---------------------------------------------------------------------------

/**
 * Full recursion is only affordable when both hands are small (each ply removes
 * one tile from each side, but the reachable state set still branches as
 * C(n,k)^2). Below this many remaining tiles we recurse exactly; above it we
 * fall back to a strong one-ply Nash on heuristic leaf values. Kept at 5 so a
 * single decision stays well under ~50ms and never blocks the UI thread.
 */
const EXACT_LOOKAHEAD_MAX_CARDS = 5;

/** Solver precision: high for the strategy we actually sample, cheap for the
 *  many interior value-only nodes visited during recursion. */
const TOP_LEVEL_ITERATIONS = 10000;
const INTERIOR_ITERATIONS = 300;

/** Tuning knobs, exported so the offline A/B harness can compare variants.
 *  Production callers never pass this — the defaults ARE the shipped AI. */
export interface HardOptions {
  /** Recursion depth for hands too large for exact lookahead (0 = myopic). */
  heuristicDepth: number;
  /** Leaf eval: weight on the wins-needed differential. */
  leafScoreWeight: number;
  /** Leaf eval: weight on remaining-hand edge × remaining rounds. */
  leafEdgeWeight: number;
  topIterations: number;
  interiorIterations: number;
  exactMaxCards: number;
}

export const DEFAULT_HARD_OPTIONS: HardOptions = {
  // A/B-tuned via scripts/bigger-number-ai-match.ts (see PR experiment table):
  // depth-1 recursion with this leaf weighting crushes the old myopic matrix
  // head-to-head, restores the easy < medium < hard ladder, and no opponent
  // in the human-model panel exploits it beyond statistical noise (maximin
  // choice across the panel + medium).
  heuristicDepth: 1,
  leafScoreWeight: 0.6,
  leafEdgeWeight: 1.0,
  topIterations: TOP_LEVEL_ITERATIONS,
  interiorIterations: INTERIOR_ITERATIONS,
  exactMaxCards: EXACT_LOOKAHEAD_MAX_CARDS,
};

/**
 * Persistent memo for sub-game values, keyed by the full rule/solver variant.
 * Cached values depend on the rules and on every HardOptions field that can
 * shape a value: interior iterations always, and — for depth-limited entries
 * reachable when heuristicDepth ≥ 2 — the leaf weights, exactMaxCards and
 * heuristicDepth too. Keying on the complete variant keeps concurrent A/B
 * agents in one process from ever sharing a cache, while still making every
 * lookahead after the first nearly free for a given variant.
 */
const memoCache = new Map<string, Map<string, number>>();
const MEMO_CACHE_MAX_STATES = 300000;

function memoFor(rules: BiggerNumberRules, opts: HardOptions): Map<string, number> {
  const key =
    `${rules.dragonRule}|${rules.tieRule}|${rules.winsToWin}|${rules.totalRounds}|` +
    `${opts.interiorIterations}|${opts.exactMaxCards}|${opts.heuristicDepth}|` +
    `${opts.leafScoreWeight}|${opts.leafEdgeWeight}`;
  let memo = memoCache.get(key);
  if (!memo) {
    memo = new Map();
    memoCache.set(key, memo);
  } else if (memo.size > MEMO_CACHE_MAX_STATES) {
    memo.clear();
  }
  return memo;
}

/**
 * The hard/master core: build the payoff matrix for the current state (exact
 * lookahead when the hands are small enough, heuristic otherwise) and solve it
 * for the equilibrium mixed strategy over `myHand`.
 */
export function computeHardStrategy(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
  context: MatchContext | undefined,
  opts: HardOptions = DEFAULT_HARD_OPTIONS,
): { matrix: number[][]; strategy: number[] } {
  const depth = context != null ? depthFor(myHand, opponentHand, opts) : 0;

  const matrix =
    depth > 0
      ? buildLookaheadMatrix(
          rules, myHand, opponentHand, context!, memoFor(rules, opts), opts, depth,
        )
      : buildOneRoundMatrix(rules, myHand, opponentHand);

  const { strategy } = solveZeroSumGame(matrix, opts.topIterations);
  return { matrix, strategy };
}

/** Exact (unbounded) recursion inside the small-hand region, else the
 *  configured depth-limited recursion with heuristic leaves. */
function depthFor(myHand: CardValue[], oppHand: CardValue[], opts: HardOptions): number {
  return myHand.length <= opts.exactMaxCards && oppHand.length <= opts.exactMaxCards
    ? Number.POSITIVE_INFINITY
    : opts.heuristicDepth;
}

/** One-ply payoff matrix: cell = immediate round result (+1/0/-1). Fallback
 *  when no match context is available (or heuristicDepth is 0). */
function buildOneRoundMatrix(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
): number[][] {
  return myHand.map((mine) => oppHand.map((opp) => cellValue(rules, mine, opp)));
}

/**
 * Heuristic value of a leaf state, in the same units as exact sub-game values
 * (expected final match result in [-1, 1] from the AI's perspective):
 *
 *   tanh( leafScoreWeight · (wins-needed differential)
 *       + leafEdgeWeight  · (avg pairwise edge of the remaining hands) · rounds left )
 *
 * The first term captures the scoreboard; the second captures material — how
 * the remaining tiles match up over the rounds still to be played.
 */
function leafValue(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
  ctx: MatchContext,
  opts: HardOptions,
): number {
  let sum = 0;
  for (const a of myHand) for (const b of oppHand) sum += cellValue(rules, a, b);
  const edge = sum / (myHand.length * oppHand.length);
  const rounds = Math.min(ctx.roundsLeft, myHand.length, oppHand.length);
  const needDiff = ctx.oppWinsNeeded - ctx.myWinsNeeded;
  return Math.tanh(
    opts.leafScoreWeight * needDiff + opts.leafEdgeWeight * edge * rounds,
  );
}

function pickNash(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
  context: MatchContext | undefined,
  rng: () => number,
): CardValue {
  if (opponentHand.length === 0) return lowestByRank(myHand);
  const { strategy } = computeHardStrategy(rules, myHand, opponentHand, context);
  const idx = sampleFromDistribution(strategy, rng);
  return myHand[idx];
}

/**
 * Look-ahead payoff matrix: cell = game-theoretic value of the sub-game that
 * follows both sides committing these tiles, in units of expected final match
 * result (+1 AI wins match / -1 AI loses / 0 draw), from the AI's perspective.
 * `depth` is the remaining recursion budget; inside the exact region it is
 * infinite, otherwise sub-games are cut off at heuristic leaf evaluations.
 */
function buildLookaheadMatrix(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
  ctx: MatchContext,
  memo: Map<string, number>,
  opts: HardOptions,
  depth: number,
): number[][] {
  return myHand.map((mine) =>
    oppHand.map((opp) =>
      subgameValue(rules, myHand, oppHand, mine, opp, ctx, memo, opts, depth),
    ),
  );
}

/** Value of the sub-game AFTER both sides reveal `mine` and `opp`. */
function subgameValue(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
  mine: CardValue,
  opp: CardValue,
  ctx: MatchContext,
  memo: Map<string, number>,
  opts: HardOptions,
  depth: number,
): number {
  const result = resolveRound(rules, mine, opp);
  const returned = result.cardsReturnedToHand;

  let myWinsNeeded = ctx.myWinsNeeded;
  let oppWinsNeeded = ctx.oppWinsNeeded;
  if (result.outcome === 'p1') myWinsNeeded -= 1;
  else if (result.outcome === 'p2') oppWinsNeeded -= 1;

  // Match-ending checks first.
  if (myWinsNeeded <= 0 && oppWinsNeeded <= 0) return 0; // simultaneous impossible, guard anyway
  if (myWinsNeeded <= 0) return 1;
  if (oppWinsNeeded <= 0) return -1;

  // A replayed tie keeps both cards; otherwise remove the played tiles.
  const nextMyHand = returned ? myHand : removeOne(myHand, mine);
  const nextOppHand = returned ? oppHand : removeOne(oppHand, opp);

  // A non-replay round consumes one of the remaining rounds.
  const roundsLeft = returned ? ctx.roundsLeft : ctx.roundsLeft - 1;

  if (roundsLeft <= 0 || nextMyHand.length === 0 || nextOppHand.length === 0) {
    // Match ends on exhaustion: whoever is closer to their target leads.
    // Fewer wins-needed = ahead. Map the margin to {-1,0,1}.
    if (myWinsNeeded < oppWinsNeeded) return 1;
    if (myWinsNeeded > oppWinsNeeded) return -1;
    return 0;
  }

  const nextCtx: MatchContext = { myWinsNeeded, oppWinsNeeded, roundsLeft };

  // Entering the exact region makes the budget unbounded; otherwise one ply
  // of budget is spent (replayed ties keep the same state and budget).
  const inExactRegion =
    nextMyHand.length <= opts.exactMaxCards && nextOppHand.length <= opts.exactMaxCards;
  const nextDepth = inExactRegion ? Number.POSITIVE_INFINITY : returned ? depth : depth - 1;
  if (nextDepth <= 0) return leafValue(rules, nextMyHand, nextOppHand, nextCtx, opts);
  return solvedValue(rules, nextMyHand, nextOppHand, nextCtx, memo, opts, nextDepth);
}

/** Nash value of a state, memoised. */
function solvedValue(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
  ctx: MatchContext,
  memo: Map<string, number>,
  opts: HardOptions,
  depth: number,
): number {
  const key =
    stateKey(myHand, oppHand, ctx) + (Number.isFinite(depth) ? `#d${depth}` : '');
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  // Break tie-replay cycles: under the `replay` tie rule, both sides revealing
  // the same card returns the cards and consumes no round, so subgameValue can
  // recurse back into this exact state. Seed the memo with a heuristic (score
  // margin toward the target) so that self-reference resolves to a finite value
  // instead of overflowing the stack; it is overwritten with the true value
  // once the matrix is solved.
  const heuristic = (ctx.oppWinsNeeded - ctx.myWinsNeeded) / rules.winsToWin;
  memo.set(key, heuristic);

  const matrix = myHand.map((mine) =>
    oppHand.map((opp) => subgameValue(rules, myHand, oppHand, mine, opp, ctx, memo, opts, depth)),
  );
  const { value } = solveZeroSumGame(matrix, opts.interiorIterations);
  memo.set(key, value);
  return value;
}

function removeOne(hand: CardValue[], card: CardValue): CardValue[] {
  const idx = hand.indexOf(card);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function stateKey(myHand: CardValue[], oppHand: CardValue[], ctx: MatchContext): string {
  const enc = (h: CardValue[]) =>
    [...h].map((c) => (isDragon(c) ? 'D' : c)).sort().join(',');
  return `${enc(myHand)}|${enc(oppHand)}|${ctx.myWinsNeeded},${ctx.oppWinsNeeded},${ctx.roundsLeft}`;
}

// ---------------------------------------------------------------------------
// Zero-sum matrix game solver (row player = AI, maximiser).
//
// Uses fictitious play: both players best-respond to the empirical average of
// the other's past plays. For zero-sum games this is guaranteed to converge to
// the game value, and the row player's empirical frequencies converge to an
// optimal (unexploitable) mixed strategy. Fast, dependency-free, and exact
// enough for the small (≤10×10) matrices here.
// ---------------------------------------------------------------------------

interface GameSolution {
  value: number;
  strategy: number[]; // row player's mixed strategy (probabilities, sums to 1)
}

export function solveZeroSumGame(matrix: number[][], iterations = 2000): GameSolution {
  // Defensive: iterations is the divisor for the strategy/value averages, so a
  // non-positive or non-finite value would produce NaN probabilities. Clamp it.
  iterations = Number.isFinite(iterations) ? Math.max(1, Math.floor(iterations)) : 2000;

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  if (rows === 0 || cols === 0) return { value: 0, strategy: [] };
  if (rows === 1) return { value: Math.min(...matrix[0]), strategy: [1] };

  // Running totals of chosen actions (empirical play counts).
  const rowCounts = new Array(rows).fill(0);
  const colCounts = new Array(cols).fill(0);
  // Cumulative payoff each row action would have earned vs opponent's history,
  // and each column action's cumulative payoff (opponent minimises).
  const rowPayoff = new Array(rows).fill(0);
  const colPayoff = new Array(cols).fill(0);

  // Seed with one arbitrary opponent action so best-responses are defined.
  let lastCol = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Row player best-responds to opponent's empirical distribution.
    for (let r = 0; r < rows; r++) rowPayoff[r] += matrix[r][lastCol];
    let bestRow = 0;
    for (let r = 1; r < rows; r++) if (rowPayoff[r] > rowPayoff[bestRow]) bestRow = r;
    rowCounts[bestRow]++;

    // Column player (minimiser) best-responds to row's empirical distribution.
    for (let c = 0; c < cols; c++) colPayoff[c] += matrix[bestRow][c];
    let bestCol = 0;
    for (let c = 1; c < cols; c++) if (colPayoff[c] < colPayoff[bestCol]) bestCol = c;
    colCounts[bestCol]++;
    lastCol = bestCol;
  }

  const strategy = rowCounts.map((c) => c / iterations);

  // Game value = payoff of row's average strategy against column's average
  // strategy (the equilibrium value both bounds converge to).
  const colStrategy = colCounts.map((c) => c / iterations);
  let value = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      value += strategy[r] * colStrategy[c] * matrix[r][c];
    }
  }

  return { value, strategy };
}

// ---------------------------------------------------------------------------
// Master: equilibrium play + safe exploitation of a modelled opponent.
//
// Every tile is played at most once per match, so the predictive signal is not
// "which tile will they play" but "which SLICE of their remaining hand do they
// reach for" — lowest, middle, or highest tiles. We track a small histogram of
// that choice (bucketed relative rank, conditioned on whether the opponent is
// behind / tied / ahead), project it onto their current hand to get a predicted
// play distribution, and best-respond to it. The best response is blended with
// the equilibrium mix with a weight that grows with sample size and is capped,
// which bounds worst-case exploitability: a blend (1-w)·nash + w·br can lose at
// most w · (payoff range) to a perfect counter-strategy, and w ≤ MASTER_MAX_TRUST.
// ---------------------------------------------------------------------------

/** Relative-rank buckets: 0 = lowest slice of hand … 4 = highest slice. */
export const OPPONENT_MODEL_BUCKETS = 5;

/** Score situations from the opponent's perspective: behind / tied / ahead. */
const SITUATIONS = 3;

/** Cap on how much probability mass the best response may take. */
const MASTER_MAX_TRUST = 0.7;
/** Observations at which trust reaches half its cap. */
const MASTER_TRUST_HALF = 4;
/** Weight given to observations from other score situations. */
const CROSS_SITUATION_WEIGHT = 0.5;
/** Laplace smoothing per bucket. */
const MODEL_SMOOTHING = 0.5;

export interface OpponentModelState {
  /** counts[situation][bucket] — how often the opponent played that slice. */
  counts: number[][];
  /** Total observations across all situations. */
  total: number;
}

export function createOpponentModel(): OpponentModelState {
  return {
    counts: Array.from({ length: SITUATIONS }, () =>
      new Array<number>(OPPONENT_MODEL_BUCKETS).fill(0),
    ),
    total: 0,
  };
}

/** Strength ordering used to rank tiles inside a hand for the model. */
function modelStrength(card: CardValue, rules: BiggerNumberRules): number {
  if (isDragon(card)) return rules.dragonRule === 'beats-all' ? 10 : 9.5;
  return card;
}

/** Which relative-rank bucket does `card` occupy within `hand`? */
export function bucketOfCard(
  rules: BiggerNumberRules,
  hand: CardValue[],
  card: CardValue,
): number {
  if (hand.length <= 1) return Math.floor(OPPONENT_MODEL_BUCKETS / 2);
  const sorted = [...hand].sort(
    (a, b) => modelStrength(a, rules) - modelStrength(b, rules),
  );
  const idx = sorted.findIndex((c) => c === card);
  const pos = (idx < 0 ? 0 : idx) / (hand.length - 1);
  return Math.min(OPPONENT_MODEL_BUCKETS - 1, Math.floor(pos * OPPONENT_MODEL_BUCKETS));
}

function situationIndex(oppWins: number, myWins: number): number {
  if (oppWins < myWins) return 0; // opponent behind
  if (oppWins === myWins) return 1; // tied
  return 2; // opponent ahead
}

/**
 * Record one opponent reveal. `handBeforePlay` is the opponent's hand at the
 * moment they chose (i.e. including the played card); `score` is the score at
 * decision time, from the observer's ("my") perspective.
 */
export function observeOpponentPlay(
  model: OpponentModelState,
  rules: BiggerNumberRules,
  handBeforePlay: CardValue[],
  played: CardValue,
  score: { oppWins: number; myWins: number },
): void {
  const sit = situationIndex(score.oppWins, score.myWins);
  const bucket = bucketOfCard(rules, handBeforePlay, played);
  model.counts[sit][bucket] += 1;
  model.total += 1;
}

/**
 * Project the learned slice-histogram onto the opponent's current hand.
 * Returns the predicted play distribution over `oppHand` (index-aligned) and
 * the trust weight in [0, MASTER_MAX_TRUST] earned by the sample size.
 */
export function predictOpponentDistribution(
  model: OpponentModelState,
  rules: BiggerNumberRules,
  oppHand: CardValue[],
  score: { oppWins: number; myWins: number },
): { dist: number[]; trust: number } {
  const sit = situationIndex(score.oppWins, score.myWins);

  // Blend in-situation counts with down-weighted cross-situation counts.
  const eff = new Array<number>(OPPONENT_MODEL_BUCKETS).fill(MODEL_SMOOTHING);
  let nSit = 0;
  for (let s = 0; s < SITUATIONS; s++) {
    const w = s === sit ? 1 : CROSS_SITUATION_WEIGHT;
    for (let b = 0; b < OPPONENT_MODEL_BUCKETS; b++) eff[b] += w * model.counts[s][b];
    if (s === sit) nSit = model.counts[s].reduce((a, b) => a + b, 0);
  }
  const nEff = nSit + CROSS_SITUATION_WEIGHT * (model.total - nSit);

  // Trust needs BOTH sample size and predictive sharpness. Against a
  // well-mixing (near-equilibrium) opponent the histogram stays flat; best-
  // responding to a flat-but-noisy estimate lands on strictly-losing rows, so
  // entropy gating collapses trust to ~0 there while a deterministic human's
  // spiked histogram keeps it high.
  const effSum = eff.reduce((a, b) => a + b, 0);
  let entropy = 0;
  for (const e of eff) {
    const p = e / effSum;
    if (p > 0) entropy -= p * Math.log(p);
  }
  const sharpness = Math.max(0, 1 - entropy / Math.log(OPPONENT_MODEL_BUCKETS));
  const trust =
    MASTER_MAX_TRUST * (nEff / (nEff + MASTER_TRUST_HALF)) * sharpness;

  // Cards sharing a bucket split that bucket's mass.
  const buckets = oppHand.map((c) => bucketOfCard(rules, oppHand, c));
  const multiplicity = new Array<number>(OPPONENT_MODEL_BUCKETS).fill(0);
  for (const b of buckets) multiplicity[b] += 1;

  const raw = buckets.map((b) => eff[b] / multiplicity[b]);
  const sum = raw.reduce((a, b) => a + b, 0);
  const dist = sum > 0 ? raw.map((x) => x / sum) : oppHand.map(() => 1 / oppHand.length);
  return { dist, trust };
}

function pickMaster(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
  context: MatchContext | undefined,
  rng: () => number,
  model: OpponentModelState | undefined,
): CardValue {
  if (opponentHand.length === 0) return lowestByRank(myHand);

  const { matrix, strategy } = computeHardStrategy(rules, myHand, opponentHand, context);
  if (!model || model.total === 0) {
    return myHand[sampleFromDistribution(strategy, rng)];
  }

  // Situation is derived from wins-needed: the side needing FEWER wins is
  // ahead, so wins-needed values swap roles as win proxies. Only the sign of
  // (oppWins - myWins) matters to situationIndex.
  const score = context
    ? { oppWins: context.myWinsNeeded, myWins: context.oppWinsNeeded }
    : { oppWins: 0, myWins: 0 };
  const { dist, trust } = predictOpponentDistribution(model, rules, opponentHand, score);

  // Best response to the predicted policy; conserve power on exact ties.
  let br = 0;
  let brEv = -Infinity;
  for (let r = 0; r < myHand.length; r++) {
    let ev = 0;
    for (let c = 0; c < opponentHand.length; c++) ev += dist[c] * matrix[r][c];
    if (
      ev > brEv + 1e-12 ||
      (Math.abs(ev - brEv) <= 1e-12 &&
        rankForOrdering(myHand[r]) < rankForOrdering(myHand[br]))
    ) {
      brEv = ev;
      br = r;
    }
  }

  const blended = strategy.map((p, r) => (1 - trust) * p + (r === br ? trust : 0));
  return myHand[sampleFromDistribution(blended, rng)];
}

function sampleFromDistribution(dist: number[], rng: () => number): number {
  const total = dist.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(rng() * dist.length);
  let r = rng() * total;
  for (let i = 0; i < dist.length; i++) {
    r -= dist[i];
    if (r <= 0) return i;
  }
  return dist.length - 1;
}
