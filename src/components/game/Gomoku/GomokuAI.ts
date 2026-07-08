/**
 * Gomoku AI.
 *
 * The engine combines:
 *  - Correct win/threat detection (open-four, four, open-three, three, etc.)
 *  - Immediate win / must-block short-circuits
 *  - A pattern-based board evaluation
 *  - Alpha-beta search over a candidate set restricted to the neighborhood of
 *    existing stones, with threat-aware move ordering.
 *
 * Difficulty tiers map to search depth and candidate breadth; the easiest tiers
 * also occasionally play a slightly sub-optimal move so beginners can win.
 */

import {
  AI,
  BOARD_SIZE,
  DIRECTIONS,
  GomokuBoard,
  PLAYER,
  Player,
  Position,
  WIN_LENGTH,
} from './types';
import { Difficulty } from '../common/types';

const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

const opponentOf = (player: Player): Player => (player === AI ? PLAYER : AI);

/* --------------------------------------------------------------------------
 * Win detection
 * ------------------------------------------------------------------------ */

/**
 * Return the winning line (>= WIN_LENGTH consecutive stones) through (row, col)
 * for `player`, or null if placing there does not complete a line.
 */
export const checkWinFromPosition = (
  board: GomokuBoard,
  row: number,
  col: number,
  player: Player
): Position[] | null => {
  if (!player || !inBounds(row, col) || board[row][col] !== player) return null;

  for (const { dr, dc } of DIRECTIONS) {
    const line: Position[] = [{ row, col }];

    for (let i = 1; i < WIN_LENGTH; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (!inBounds(r, c) || board[r][c] !== player) break;
      line.push({ row: r, col: c });
    }
    for (let i = 1; i < WIN_LENGTH; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (!inBounds(r, c) || board[r][c] !== player) break;
      line.unshift({ row: r, col: c });
    }

    if (line.length >= WIN_LENGTH) {
      return line.slice(0, WIN_LENGTH);
    }
  }

  return null;
};

/** Scan the whole board for an existing winner. */
export const findWinner = (board: GomokuBoard): Player => {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell && checkWinFromPosition(board, r, c, cell)) return cell;
    }
  }
  return null;
};

export const isBoardFull = (board: GomokuBoard): boolean =>
  board.every((row) => row.every((cell) => cell !== null));

const isBoardEmpty = (board: GomokuBoard): boolean =>
  board.every((row) => row.every((cell) => cell === null));

/* --------------------------------------------------------------------------
 * Candidate move generation
 * ------------------------------------------------------------------------ */

/**
 * All empty intersections within `radius` of an existing stone. If the board is
 * empty, returns the single center point.
 */
export const getValidMoves = (
  board: GomokuBoard,
  radius = 2
): Position[] => {
  if (isBoardEmpty(board)) {
    const mid = Math.floor(BOARD_SIZE / 2);
    return [{ row: mid, col: mid }];
  }

  const seen = new Set<number>();
  const moves: Position[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) continue;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc) || board[nr][nc] !== null) continue;
          const key = nr * BOARD_SIZE + nc;
          if (seen.has(key)) continue;
          seen.add(key);
          moves.push({ row: nr, col: nc });
        }
      }
    }
  }

  return moves;
};

/* --------------------------------------------------------------------------
 * Pattern scoring
 * ------------------------------------------------------------------------ */

/** Score weights for recognised shapes (from the mover's perspective). */
const SCORE = {
  FIVE: 10_000_000,
  OPEN_FOUR: 500_000,
  FOUR: 20_000, // simple / closed four (one open end) — forces a block
  OPEN_THREE: 15_000,
  THREE: 1_500,
  OPEN_TWO: 400,
  TWO: 80,
  ONE: 10,
} as const;

/**
 * Evaluate the maximal run of `player` stones that contains (row, col), looking
 * along (dr, dc). Returns a shape score, or 0 if (row, col) is not the "anchor"
 * (lowest-index) stone of the run in this direction — this keeps each run from
 * being counted multiple times.
 */
const scoreRunAt = (
  board: GomokuBoard,
  row: number,
  col: number,
  dr: number,
  dc: number,
  player: Player
): number => {
  // Only score from the anchor stone (no `player` stone immediately behind).
  const br = row - dr;
  const bc = col - dc;
  if (inBounds(br, bc) && board[br][bc] === player) return 0;

  // Length of the consecutive run.
  let count = 0;
  let r = row;
  let c = col;
  while (inBounds(r, c) && board[r][c] === player) {
    count++;
    r += dr;
    c += dc;
  }

  // Openness: is the cell just past each end empty?
  const beforeOpen = inBounds(br, bc) && board[br][bc] === null;
  const afterOpen = inBounds(r, c) && board[r][c] === null;
  const openEnds = (beforeOpen ? 1 : 0) + (afterOpen ? 1 : 0);

  if (count >= WIN_LENGTH) return SCORE.FIVE;
  if (openEnds === 0 && count < WIN_LENGTH) return 0; // blocked both ends, dead

  switch (count) {
    case 4:
      return openEnds === 2 ? SCORE.OPEN_FOUR : SCORE.FOUR;
    case 3:
      return openEnds === 2 ? SCORE.OPEN_THREE : SCORE.THREE;
    case 2:
      return openEnds === 2 ? SCORE.OPEN_TWO : SCORE.TWO;
    case 1:
      return openEnds === 2 ? SCORE.ONE : 0;
    default:
      return 0;
  }
};

/**
 * Total pattern score for `player` across the whole board (positive = good for
 * `player`).
 */
const scoreFor = (board: GomokuBoard, player: Player): number => {
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== player) continue;
      for (const { dr, dc } of DIRECTIONS) {
        total += scoreRunAt(board, r, c, dr, dc, player);
      }
    }
  }
  return total;
};

/**
 * Static evaluation from AI's perspective. Opponent threats are weighted
 * slightly higher so the AI prefers to defend a threat over building its own of
 * equal magnitude (defence-first is safer in gomoku).
 */
const evaluateBoard = (board: GomokuBoard): number => {
  const aiScore = scoreFor(board, AI);
  const oppScore = scoreFor(board, PLAYER);
  return aiScore - Math.round(oppScore * 1.1);
};

/* --------------------------------------------------------------------------
 * Threat helpers (used for move ordering and forced-move detection)
 * ------------------------------------------------------------------------ */

/** Does placing `player` at (row, col) immediately win? */
const isWinningMove = (
  board: GomokuBoard,
  row: number,
  col: number,
  player: Player
): boolean => {
  board[row][col] = player;
  const win = checkWinFromPosition(board, row, col, player) !== null;
  board[row][col] = null;
  return win;
};

/**
 * Sum of the shape scores of every run of `player` stones that touches
 * (row, col), across all four directions. For each direction we walk back to
 * the run's true anchor (the lowest-index `player` stone) and score it exactly
 * once, so runs longer than the queried cell are not undercounted.
 * Assumes (row, col) currently holds a `player` stone.
 */
const shapeScoreThrough = (
  board: GomokuBoard,
  row: number,
  col: number,
  player: Player
): number => {
  let total = 0;
  for (const { dr, dc } of DIRECTIONS) {
    let ar = row;
    let ac = col;
    while (inBounds(ar - dr, ac - dc) && board[ar - dr][ac - dc] === player) {
      ar -= dr;
      ac -= dc;
    }
    total += scoreRunAt(board, ar, ac, dr, dc, player);
  }
  return total;
};

/**
 * Heuristic value of a single move for ordering purposes — the immediate shape
 * score gained for the mover plus the opponent shape it disrupts.
 */
const moveHeuristic = (
  board: GomokuBoard,
  row: number,
  col: number,
  player: Player
): number => {
  const opp = opponentOf(player);

  board[row][col] = player;
  const offence = shapeScoreThrough(board, row, col, player);
  board[row][col] = null;

  board[row][col] = opp;
  const defence = shapeScoreThrough(board, row, col, opp);
  board[row][col] = null;

  return offence + defence * 0.9;
};

/** Candidate moves sorted best-first by the ordering heuristic, capped at `limit`. */
const orderedMoves = (
  board: GomokuBoard,
  player: Player,
  limit: number
): Position[] => {
  const moves = getValidMoves(board);
  const scored = moves.map((m) => ({
    m,
    h: moveHeuristic(board, m.row, m.col, player),
  }));
  scored.sort((a, b) => b.h - a.h);
  return scored.slice(0, limit).map((s) => s.m);
};

/* --------------------------------------------------------------------------
 * Alpha-beta search
 * ------------------------------------------------------------------------ */

interface SearchConfig {
  depth: number;
  breadth: number; // max candidate moves considered per node
}

const DIFFICULTY_CONFIG: Record<Difficulty, SearchConfig> = {
  easy: { depth: 2, breadth: 8 },
  medium: { depth: 4, breadth: 10 },
  hard: { depth: 6, breadth: 12 },
  expert: { depth: 8, breadth: 12 },
  master: { depth: 10, breadth: 14 },
};

const WIN_SCORE = SCORE.FIVE;

/**
 * Negamax-style alpha-beta but expressed as explicit max/min for clarity.
 * `maximizing` is true when it's AI's turn to move.
 *
 * A win can only be completed by the stone just placed, so instead of scanning
 * the whole board with findWinner() at every node we check only the last move
 * (passed in via last*). This keeps deep searches (expert/master) responsive.
 */
const alphabeta = (
  board: GomokuBoard,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  breadth: number,
  lastRow?: number,
  lastCol?: number,
  lastPlayer?: Player
): number => {
  if (
    lastPlayer &&
    lastRow !== undefined &&
    lastCol !== undefined &&
    checkWinFromPosition(board, lastRow, lastCol, lastPlayer)
  ) {
    // The player who just moved has won; a sooner win scores higher.
    return lastPlayer === AI ? WIN_SCORE + depth : -WIN_SCORE - depth;
  }
  if (depth === 0) return evaluateBoard(board);

  const player = maximizing ? AI : PLAYER;
  const moves = orderedMoves(board, player, breadth);
  if (moves.length === 0) return evaluateBoard(board);

  if (maximizing) {
    let best = -Infinity;
    for (const { row, col } of moves) {
      board[row][col] = AI;
      const val = alphabeta(board, depth - 1, alpha, beta, false, breadth, row, col, AI);
      board[row][col] = null;
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { row, col } of moves) {
      board[row][col] = PLAYER;
      const val = alphabeta(board, depth - 1, alpha, beta, true, breadth, row, col, PLAYER);
      board[row][col] = null;
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
};

/* --------------------------------------------------------------------------
 * Top-level move selection
 * ------------------------------------------------------------------------ */

/**
 * Find every move that would give `player` an immediate win (for detecting
 * fours the opponent has created that we must block).
 */
const findImmediateWins = (board: GomokuBoard, player: Player): Position[] => {
  const wins: Position[] = [];
  for (const { row, col } of getValidMoves(board)) {
    if (isWinningMove(board, row, col, player)) wins.push({ row, col });
  }
  return wins;
};

/**
 * Choose the AI's move.
 *
 * Order of reasoning:
 *  1. Empty board → center.
 *  2. If AI can win now, do it.
 *  3. If the human can win next, block it.
 *  4. Otherwise run alpha-beta and pick the best-scoring move.
 *  5. On the easiest tier, occasionally choose the 2nd-best move so the AI is
 *     beatable by beginners.
 */
export const getBestMove = (
  board: GomokuBoard,
  difficulty: Difficulty
): Position | null => {
  if (isBoardEmpty(board)) {
    const mid = Math.floor(BOARD_SIZE / 2);
    return { row: mid, col: mid };
  }

  const moves = getValidMoves(board);
  if (moves.length === 0) return null;

  // 2. Immediate AI win.
  const aiWins = findImmediateWins(board, AI);
  if (aiWins.length > 0) return aiWins[0];

  // 3. Block an immediate human win. If the human has two winning replies we
  //    can only block one, but blocking the first is still correct behaviour.
  const humanWins = findImmediateWins(board, PLAYER);
  if (humanWins.length > 0) {
    // Prefer the block that is also most useful offensively.
    humanWins.sort(
      (a, b) =>
        moveHeuristic(board, b.row, b.col, AI) -
        moveHeuristic(board, a.row, a.col, AI)
    );
    return humanWins[0];
  }

  const { depth, breadth } = DIFFICULTY_CONFIG[difficulty];
  const candidates = orderedMoves(board, AI, breadth);

  const scored: Array<{ move: Position; value: number }> = [];
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of candidates) {
    board[move.row][move.col] = AI;
    const value = alphabeta(
      board,
      depth - 1,
      alpha,
      beta,
      false,
      breadth,
      move.row,
      move.col,
      AI
    );
    board[move.row][move.col] = null;
    scored.push({ move, value });
    if (value > alpha) alpha = value;
  }

  scored.sort((a, b) => b.value - a.value);

  // Easy tier: 35% of the time, take the second-best move so a beginner has a
  // fighting chance — but only when it's not much worse than the best (within
  // EASY_SLACK), and never when the best move is a win/block.
  const EASY_SLACK = SCORE.OPEN_THREE;
  if (
    difficulty === 'easy' &&
    scored.length > 1 &&
    scored[0].value < WIN_SCORE &&
    scored[0].value - scored[1].value <= EASY_SLACK &&
    Math.random() < 0.35
  ) {
    return scored[1].move;
  }

  return scored[0]?.move ?? candidates[0] ?? moves[0];
};
