/**
 * Territory Number — AI strategies.
 *
 *  easy   — mostly random, but avoids the very worst blunders: it plays a
 *           uniform-random legal move ~65% of the time and otherwise takes a
 *           locally greedy capture move. Beatable, but not brain-dead.
 *  medium — one-ply greedy on a *positional* evaluation (not just captured
 *           lines): it also values partial control of a line (who is ahead on
 *           the running sum, weighted by the strongest card still unplayed that
 *           could flip it). Prefers high-leverage cells. Solid club player.
 *  hard   — alpha-beta minimax over the real game tree. Because the game is at
 *           most 9 plies deep and the branching factor shrinks every move, we
 *           search to a move-count-adaptive depth: shallow (heuristic leaves)
 *           in the opening to stay responsive, then a FULL exact solve once the
 *           board is half-full. Plays essentially perfectly in the endgame.
 *
 * The `hard` search never explores more than a bounded number of nodes, so it
 * can't freeze the browser on the opening move.
 */

import {
  emptyCellIndices,
  evaluateBoard,
  placeCard,
  remainingCards,
  isBoardFull,
} from './gameLogic';
import { LINES } from './types';
import type {
  AIDifficulty,
  Board,
  PlayerSlot,
} from './types';

export interface AIDecision {
  card: number;
  cellIndex: number;
}

/**
 * Decide a placement for `slot` given the current board.
 * Caller is responsible for advancing the game state.
 */
export function pickAIMove(
  difficulty: AIDifficulty,
  board: Board,
  slot: PlayerSlot
): AIDecision {
  const cells = emptyCellIndices(board);
  const cards = remainingCards(board);
  if (cells.length === 0 || cards.length === 0) {
    throw new Error('No legal move available');
  }

  switch (difficulty) {
    case 'easy':
      return easyMove(board, slot, cells, cards);
    case 'medium':
      return mediumMove(board, slot, cells, cards);
    case 'hard':
      return hardMove(board, slot);
  }
}

// ---- shared helpers --------------------------------------------------------

const other = (slot: PlayerSlot): PlayerSlot => (slot === 'p1' ? 'p2' : 'p1');

function capturesFor(
  ev: ReturnType<typeof evaluateBoard>,
  slot: PlayerSlot
): number {
  return slot === 'p1' ? ev.p1Captures : ev.p2Captures;
}

/**
 * Cell leverage: how many of the 8 lines pass through each cell index.
 *   centre (4)       = 4 lines (row + col + 2 diagonals)
 *   corners (0,2,6,8) = 3 lines each
 *   edges (1,3,5,7)   = 2 lines each
 */
const CELL_LEVERAGE: readonly number[] = [3, 2, 3, 2, 4, 2, 3, 2, 3];

/** Enumerate every legal (card, cell) placement. */
function allMoves(cells: number[], cards: number[]): AIDecision[] {
  const out: AIDecision[] = [];
  for (const card of cards) {
    for (const cellIndex of cells) {
      out.push({ card, cellIndex });
    }
  }
  return out;
}

// ---- POSITIONAL EVALUATION -------------------------------------------------

/**
 * Positional score from `slot`'s perspective, in "line units".
 *
 * Counting only *completed* line captures makes the AI blind until the board
 * is nearly full. Instead we score every line by how contested it is:
 *
 *  - A fully decided line (all 3 cells placed) is worth ±1 for its winner.
 *  - A partially filled line is worth a fraction: we compare the running sums
 *    and how much "reach" each side still has, given the strongest unplayed
 *    card that could still land on it and the number of empty slots left.
 *
 * The result is a smooth, differentiable-ish heuristic that rewards building a
 * commanding lead on high-leverage lines and punishes leaving a line where the
 * opponent can cheaply flip it. Scaled so a clearly-won line ≈ 1.0.
 */
export function positionalScore(board: Board, slot: PlayerSlot): number {
  const remaining = remainingCards(board);
  const strongest = remaining.length ? Math.max(...remaining) : 0;

  let total = 0;
  for (const line of LINES) {
    let mySum = 0;
    let oppSum = 0;
    let empties = 0;
    for (const idx of line) {
      const cell = board[idx];
      if (cell.value === null || cell.owner === null) {
        empties += 1;
        continue;
      }
      if (cell.owner === slot) mySum += cell.value;
      else oppSum += cell.value;
    }

    if (empties === 0) {
      // Decided line.
      if (mySum > oppSum) total += 1;
      else if (oppSum > mySum) total -= 1;
      continue;
    }

    // Contested line. Lead is the current margin; reach is how much the empty
    // cells could still swing it (bounded by the strongest remaining card).
    const lead = mySum - oppSum;
    // Best single card either side could drop here.
    const swing = Math.min(empties, 1) * strongest + (empties - 1) * 1;
    if (swing <= 0) continue;
    // Normalise the lead into roughly [-1, 1]; a lead larger than what a
    // single strong card can overturn is treated as near-won.
    let frac = lead / (swing + 1);
    if (frac > 1) frac = 1;
    if (frac < -1) frac = -1;
    // Weight contested lines a bit less than decided ones.
    total += frac * 0.6;
  }
  return total;
}

// ---- EASY ------------------------------------------------------------------

function easyMove(
  board: Board,
  slot: PlayerSlot,
  cells: number[],
  cards: number[]
): AIDecision {
  // Mostly random, but occasionally makes a sensible greedy move so it isn't
  // a total pushover.
  if (Math.random() < 0.65) {
    return {
      card: cards[Math.floor(Math.random() * cards.length)],
      cellIndex: cells[Math.floor(Math.random() * cells.length)],
    };
  }
  return greedyMove(board, slot, cells, cards);
}

// ---- MEDIUM ----------------------------------------------------------------

/**
 * One-ply greedy on the positional evaluation, with a light lookahead penalty:
 * for each candidate move we also peek at the opponent's single best reply and
 * subtract a fraction of it. This stops medium from walking into an obvious
 * one-move counter while staying fast (O(moves^2) at most 72×72 early).
 */
function mediumMove(
  board: Board,
  slot: PlayerSlot,
  cells: number[],
  cards: number[]
): AIDecision {
  const opp = other(slot);
  let best: AIDecision = { card: cards[0], cellIndex: cells[0] };
  let bestScore = -Infinity;
  let bestTie = -Infinity;

  for (const move of allMoves(cells, cards)) {
    const next = placeCard(board, move.cellIndex, move.card, slot);
    let score = positionalScore(next, slot);

    // Peek at the opponent's best immediate reply and discount it.
    if (!isBoardFull(next)) {
      const oppCells = emptyCellIndices(next);
      const oppCards = remainingCards(next);
      let oppBest = -Infinity;
      for (const r of allMoves(oppCells, oppCards)) {
        const after = placeCard(next, r.cellIndex, r.card, opp);
        const s = positionalScore(after, opp);
        if (s > oppBest) oppBest = s;
      }
      score -= 0.5 * oppBest;
    }

    const tieBreak = move.card * CELL_LEVERAGE[move.cellIndex];
    if (score > bestScore || (score === bestScore && tieBreak > bestTie)) {
      bestScore = score;
      bestTie = tieBreak;
      best = move;
    }
  }
  return best;
}

/** Pure one-ply greedy on captured lines (used by easy's non-random branch). */
function greedyMove(
  board: Board,
  slot: PlayerSlot,
  cells: number[],
  cards: number[]
): AIDecision {
  const opp = other(slot);
  let best: AIDecision = { card: cards[0], cellIndex: cells[0] };
  let bestScore = -Infinity;
  for (const move of allMoves(cells, cards)) {
    const next = placeCard(board, move.cellIndex, move.card, slot);
    const ev = evaluateBoard(next);
    const score = capturesFor(ev, slot) - capturesFor(ev, opp);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

// ---- HARD ------------------------------------------------------------------

/**
 * Depth schedule keyed to how many cells are already filled. The branching
 * factor is (emptyCells × remainingCards), which shrinks fast, so we can
 * afford to search all the way to a full board in the mid/endgame while
 * staying shallow (and heuristic) in the wide-open opening.
 *
 * filled  emptyCells  chosen depth   meaning
 *   0        9           2           opening: 2-ply + heuristic leaf
 *   1        8           2
 *   2        7           3
 *   3        6           4
 *   4        5           5           = solve to the end (5 empties)
 *   5..      ≤4         full         exact solve
 */
function hardDepthFor(filled: number): number {
  if (filled <= 1) return 2;
  if (filled === 2) return 3;
  if (filled === 3) return 4;
  return 9; // enough to reach a full board from here on
}

function hardMove(board: Board, mySlot: PlayerSlot): AIDecision {
  const cells = emptyCellIndices(board);
  const cards = remainingCards(board);
  const opp = other(mySlot);
  const filled = 9 - cells.length;
  const depth = hardDepthFor(filled);

  let bestScore = -Infinity;
  let best: AIDecision = { card: cards[0], cellIndex: cells[0] };

  // Move ordering (best-first) makes alpha-beta cuts far deeper.
  const ordered = orderedMoves(board, mySlot);
  let alpha = -Infinity;
  const beta = Infinity;
  for (const move of ordered) {
    const next = placeCard(board, move.cellIndex, move.card, mySlot);
    const score = minimax(next, opp, mySlot, depth - 1, alpha, beta);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
    if (bestScore > alpha) alpha = bestScore;
  }
  return best;
}

/**
 * Order candidate moves best-first using a cheap positional delta, so
 * alpha-beta gets tight bounds early. High-value cards on high-leverage cells
 * break ties.
 */
function orderedMoves(board: Board, slot: PlayerSlot): AIDecision[] {
  const cells = emptyCellIndices(board);
  const cards = remainingCards(board);
  const scored: Array<AIDecision & { s: number }> = [];
  for (const move of allMoves(cells, cards)) {
    const next = placeCard(board, move.cellIndex, move.card, slot);
    const s = positionalScore(next, slot) * 100
      + move.card * CELL_LEVERAGE[move.cellIndex];
    scored.push({ ...move, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.map(({ card, cellIndex }) => ({ card, cellIndex }));
}

/**
 * Alpha-beta minimax. `toMove` is whose move it currently is; `mySlot` is the
 * side we score for (constant across recursion). At a terminal board we return
 * the EXACT capture margin (scaled so it dominates the heuristic); at a
 * depth-limited leaf we return the positional heuristic.
 */
function minimax(
  board: Board,
  toMove: PlayerSlot,
  mySlot: PlayerSlot,
  depth: number,
  alphaIn: number,
  betaIn: number
): number {
  if (isBoardFull(board)) {
    const ev = evaluateBoard(board);
    // Exact result dominates any heuristic leaf value.
    return (capturesFor(ev, mySlot) - capturesFor(ev, other(mySlot))) * 100;
  }
  if (depth === 0) {
    return positionalScore(board, mySlot);
  }

  const isMax = toMove === mySlot;
  const nextToMove = other(toMove);
  let alpha = alphaIn;
  let beta = betaIn;

  // Order the child moves from the mover's perspective for better pruning.
  // At depth 1 every child is a leaf that returns positionalScore directly, so
  // ordering (which itself scores every move) is wasted work with nothing left
  // to prune — loop unordered instead.
  const ordered = depth > 1
    ? orderedMoves(board, toMove)
    : allMoves(emptyCellIndices(board), remainingCards(board));

  let best = isMax ? -Infinity : Infinity;
  for (const move of ordered) {
    const next = placeCard(board, move.cellIndex, move.card, toMove);
    const score = minimax(next, nextToMove, mySlot, depth - 1, alpha, beta);
    if (isMax) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break; // cut
  }
  return best;
}
