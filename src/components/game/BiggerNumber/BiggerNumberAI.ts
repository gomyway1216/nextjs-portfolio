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
 */
export function pickAICard(
  difficulty: AIDifficulty,
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
  context?: MatchContext,
  rng: () => number = Math.random,
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
const TOP_LEVEL_ITERATIONS = 2000;
const INTERIOR_ITERATIONS = 300;

function pickNash(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  opponentHand: CardValue[],
  context: MatchContext | undefined,
  rng: () => number,
): CardValue {
  if (opponentHand.length === 0) return lowestByRank(myHand);

  const useExact =
    context != null &&
    myHand.length <= EXACT_LOOKAHEAD_MAX_CARDS &&
    opponentHand.length <= EXACT_LOOKAHEAD_MAX_CARDS;

  const matrix = useExact
    ? buildLookaheadMatrix(rules, myHand, opponentHand, context!, new Map())
    : buildOneRoundMatrix(rules, myHand, opponentHand);

  const { strategy } = solveZeroSumGame(matrix, TOP_LEVEL_ITERATIONS);
  const idx = sampleFromDistribution(strategy, rng);
  return myHand[idx];
}

/** One-ply payoff matrix: cell = immediate round result (+1/0/-1). */
function buildOneRoundMatrix(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
): number[][] {
  return myHand.map((mine) => oppHand.map((opp) => cellValue(rules, mine, opp)));
}

/**
 * Look-ahead payoff matrix: cell = game-theoretic value of the sub-game that
 * follows both sides committing these tiles, in units of expected final match
 * result (+1 AI wins match / -1 AI loses / 0 draw), from the AI's perspective.
 */
function buildLookaheadMatrix(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
  ctx: MatchContext,
  memo: Map<string, number>,
): number[][] {
  return myHand.map((mine) =>
    oppHand.map((opp) => subgameValue(rules, myHand, oppHand, mine, opp, ctx, memo)),
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
  return solvedValue(rules, nextMyHand, nextOppHand, nextCtx, memo);
}

/** Nash value of a state, memoised. */
function solvedValue(
  rules: BiggerNumberRules,
  myHand: CardValue[],
  oppHand: CardValue[],
  ctx: MatchContext,
  memo: Map<string, number>,
): number {
  const key = stateKey(myHand, oppHand, ctx);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const matrix = myHand.map((mine) =>
    oppHand.map((opp) => subgameValue(rules, myHand, oppHand, mine, opp, ctx, memo)),
  );
  const { value } = solveZeroSumGame(matrix, INTERIOR_ITERATIONS);
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
