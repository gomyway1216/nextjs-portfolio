/**
 * Territory Number — AI strategies.
 *
 *  easy   — uniform-random card and uniform-random empty cell.
 *  medium — heuristic: for each (card, cell) pair, score it as the change
 *           it would cause in (myCaptures - oppCaptures) on the immediate
 *           board. Pick the max; ties broken by preferring high-value cards
 *           on high-leverage cells (centre > corner > edge).
 *  hard   — short-horizon minimax: simulate up to `MAX_DEPTH` plies of
 *           perfect play (us vs opponent) and pick the move that maximizes
 *           the worst-case capture margin at the leaf, falling back to the
 *           medium heuristic for evaluation when the depth limit kicks in.
 *           Searches with alpha-beta pruning.
 */

import {
  emptyCellIndices,
  evaluateBoard,
  placeCard,
  remainingCards,
  isBoardFull,
} from './gameLogic';
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
      return easyMove(cells, cards);
    case 'medium':
      return mediumMove(board, slot, cells, cards);
    case 'hard':
      return hardMove(board, slot);
  }
}

// ---- EASY ------------------------------------------------------------------

function easyMove(cells: number[], cards: number[]): AIDecision {
  return {
    card: cards[Math.floor(Math.random() * cards.length)],
    cellIndex: cells[Math.floor(Math.random() * cells.length)],
  };
}

// ---- MEDIUM ----------------------------------------------------------------

/**
 * Cell leverage: how many of the 8 lines pass through each cell index.
 *   centre (4)     = 4 lines (row + col + 2 diagonals)
 *   corners (0,2,6,8) = 3 lines each
 *   edges (1,3,5,7)   = 2 lines each
 */
const CELL_LEVERAGE: readonly number[] = [3, 2, 3, 2, 4, 2, 3, 2, 3];

function mediumMove(
  board: Board,
  slot: PlayerSlot,
  cells: number[],
  cards: number[]
): AIDecision {
  const opp: PlayerSlot = slot === 'p1' ? 'p2' : 'p1';
  const baseEval = evaluateBoard(board);
  const baseDelta = capturesFor(baseEval, slot) - capturesFor(baseEval, opp);

  let bestScore = -Infinity;
  let bestTie = -Infinity;
  let best: AIDecision = { card: cards[0], cellIndex: cells[0] };

  for (const card of cards) {
    for (const cellIndex of cells) {
      const next = placeCard(board, cellIndex, card, slot);
      const ev = evaluateBoard(next);
      const score = (capturesFor(ev, slot) - capturesFor(ev, opp)) - baseDelta;
      const tieBreak = card * CELL_LEVERAGE[cellIndex];
      if (score > bestScore || (score === bestScore && tieBreak > bestTie)) {
        bestScore = score;
        bestTie = tieBreak;
        best = { card, cellIndex };
      }
    }
  }
  return best;
}

function capturesFor(
  ev: ReturnType<typeof evaluateBoard>,
  slot: PlayerSlot
): number {
  return slot === 'p1' ? ev.p1Captures : ev.p2Captures;
}

// ---- HARD ------------------------------------------------------------------

/**
 * Hard AI explores all future plies up to `MAX_DEPTH`, alternating us and
 * opponent. With alpha-beta pruning the worst-case branching is manageable
 * once the board is half-full; for early moves we cap depth and use the
 * medium heuristic as a leaf evaluator.
 */
const MAX_DEPTH = 5;

function hardMove(board: Board, mySlot: PlayerSlot): AIDecision {
  const cells = emptyCellIndices(board);
  const cards = remainingCards(board);
  const opp: PlayerSlot = mySlot === 'p1' ? 'p2' : 'p1';

  let bestScore = -Infinity;
  let best: AIDecision = { card: cards[0], cellIndex: cells[0] };

  // Order moves by medium heuristic first to make alpha-beta cuts deeper.
  const ordered = orderedMoves(board, mySlot);
  for (const move of ordered) {
    const next = placeCard(board, move.cellIndex, move.card, mySlot);
    const score = minimax(next, opp, mySlot, MAX_DEPTH - 1, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function orderedMoves(board: Board, slot: PlayerSlot): AIDecision[] {
  const cells = emptyCellIndices(board);
  const cards = remainingCards(board);
  const moves: Array<AIDecision & { score: number }> = [];
  const opp: PlayerSlot = slot === 'p1' ? 'p2' : 'p1';
  const baseEval = evaluateBoard(board);
  const baseDelta = capturesFor(baseEval, slot) - capturesFor(baseEval, opp);

  for (const card of cards) {
    for (const cellIndex of cells) {
      const next = placeCard(board, cellIndex, card, slot);
      const ev = evaluateBoard(next);
      const delta = (capturesFor(ev, slot) - capturesFor(ev, opp)) - baseDelta;
      moves.push({ card, cellIndex, score: delta * 100 + card * CELL_LEVERAGE[cellIndex] });
    }
  }
  moves.sort((a, b) => b.score - a.score);
  return moves.map(({ card, cellIndex }) => ({ card, cellIndex }));
}

/**
 * Negamax-style search. `toMove` is the slot whose move it currently is;
 * `mySlot` is the side we are scoring for (constant across recursion).
 * Returns the score from `mySlot`'s perspective: (mySlot captures - opp captures).
 */
function minimax(
  board: Board,
  toMove: PlayerSlot,
  mySlot: PlayerSlot,
  depth: number,
  alpha: number,
  beta: number
): number {
  if (isBoardFull(board) || depth === 0) {
    const ev = evaluateBoard(board);
    const opp: PlayerSlot = mySlot === 'p1' ? 'p2' : 'p1';
    return capturesFor(ev, mySlot) - capturesFor(ev, opp);
  }

  const cells = emptyCellIndices(board);
  const cards = remainingCards(board);
  const isMaximising = toMove === mySlot;
  const nextToMove: PlayerSlot = toMove === 'p1' ? 'p2' : 'p1';

  let best = isMaximising ? -Infinity : Infinity;
  for (const cellIndex of cells) {
    for (const card of cards) {
      const next = placeCard(board, cellIndex, card, toMove);
      const score = minimax(next, nextToMove, mySlot, depth - 1, alpha, beta);
      if (isMaximising) {
        if (score > best) best = score;
        if (best > alpha) alpha = best;
      } else {
        if (score < best) best = score;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) return best;
    }
  }
  return best;
}
