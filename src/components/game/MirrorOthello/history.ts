/**
 * Mirror Othello — move history.
 *
 * Every committed ply is recorded together with the position it was played
 * from, which is what makes take-backs possible: the mirror flip and passes
 * mean a position cannot be reconstructed by simply un-flipping discs.
 * Pure (no React) so it can be unit tested.
 */

import {
  advance,
  Cell,
  cellLabel,
  createInitialBoard,
  EMPTY,
  getValidMoves,
  PLAYER,
  Point,
  resultFromBoard,
  SIZE,
  type GameResult,
} from './engine';

export interface GameState {
  board: Cell[][];
  currentColor: Cell;
  validMoves: Point[];
  turnCount: number;
  lastMove: Point | null;
  result: GameResult | null;
}

export interface MoveRecord {
  /** 1-based ply number. */
  ply: number;
  color: Cell;
  /** Where the disc was placed, in the coordinates of the board at that time. */
  point: Point;
  label: string;
  /** The board flipped left↔right right after this ply. */
  mirrored: boolean;
  /** The opponent had no reply, so the mover plays again. */
  passed: boolean;
}

export interface HistoryEntry {
  /** Position the move was played from. */
  before: GameState;
  record: MoveRecord;
}

export const freshGame = (): GameState => {
  const board = createInitialBoard();
  return {
    board,
    currentColor: PLAYER,
    validMoves: getValidMoves(board, PLAYER),
    turnCount: 0,
    lastMove: null,
    result: null,
  };
};

export interface PlayResult {
  state: GameState;
  entry: HistoryEntry;
}

/** Play one ply from `state`. Returns null if the move is illegal. */
export const playMove = (
  state: GameState,
  point: Point,
  color: Cell,
): PlayResult | null => {
  const step = advance(state.board, point, color, state.turnCount);
  if (!step) return null;

  // The last-move marker has to follow its disc through the flip.
  const lastMove = step.mirrored
    ? { x: SIZE - 1 - point.x, y: point.y }
    : point;

  return {
    state: {
      board: step.board,
      currentColor: step.gameOver ? EMPTY : step.nextColor,
      validMoves: step.nextMoves,
      turnCount: step.turnCount,
      lastMove,
      result: step.gameOver ? resultFromBoard(step.board) : null,
    },
    entry: {
      before: state,
      record: {
        ply: step.turnCount,
        color,
        point,
        label: cellLabel(point.x, point.y),
        mirrored: step.mirrored,
        passed: step.passed,
      },
    },
  };
};

export const canUndo = (history: ReadonlyArray<HistoryEntry>): boolean =>
  history.some((entry) => entry.record.color === PLAYER);

export interface UndoResult {
  state: GameState;
  history: HistoryEntry[];
  /** Number of plies taken back (the player's move plus any AI replies). */
  removed: number;
}

/**
 * Take back the human's most recent move, along with every AI reply made
 * after it, so the human is to move again. Returns null when the human has
 * not moved yet.
 */
export const undoLastPlayerMove = (
  history: ReadonlyArray<HistoryEntry>,
): UndoResult | null => {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].record.color === PLAYER) {
      return {
        state: history[i].before,
        history: history.slice(0, i),
        removed: history.length - i,
      };
    }
  }
  return null;
};
