import { describe, expect, it } from 'vitest';
import {
  AI,
  Cell,
  EMPTY,
  getValidMoves,
  MIRROR_INTERVAL,
  mirrorHorizontally,
  PLAYER,
  resultFromBoard,
  SIZE,
} from '@/components/game/MirrorOthello/engine';
import {
  canUndo,
  freshGame,
  playMove,
  undoLastPlayerMove,
  type GameState,
  type HistoryEntry,
} from '@/components/game/MirrorOthello/history';

const empty = (): Cell[][] =>
  Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY) as Cell[]);

const stateFor = (board: Cell[][], color: Cell, turnCount = 0): GameState => ({
  board,
  currentColor: color,
  validMoves: getValidMoves(board, color),
  turnCount,
  lastMove: null,
  result: null,
});

/** Plays the first legal move for whoever is to move, `plies` times. */
const playOut = (plies: number) => {
  let state = freshGame();
  const history: HistoryEntry[] = [];
  const states: GameState[] = [state];
  for (let i = 0; i < plies && state.currentColor !== EMPTY; i += 1) {
    const played = playMove(state, state.validMoves[0], state.currentColor);
    if (!played) throw new Error('expected a legal move');
    state = played.state;
    history.push(played.entry);
    states.push(state);
  }
  return { state, history, states };
};

describe('MirrorOthello history — playMove', () => {
  it('rejects an illegal move', () => {
    expect(playMove(freshGame(), { x: 0, y: 0 }, PLAYER)).toBeNull();
  });

  it('records the ply and hands the turn to the opponent', () => {
    const start = freshGame();
    const played = playMove(start, { x: 3, y: 2 }, PLAYER)!;
    expect(played.entry.before).toBe(start);
    expect(played.entry.record).toEqual({
      ply: 1,
      color: PLAYER,
      point: { x: 3, y: 2 },
      label: 'd3',
      mirrored: false,
      passed: false,
    });
    expect(played.state.currentColor).toBe(AI);
    expect(played.state.turnCount).toBe(1);
    expect(played.state.lastMove).toEqual({ x: 3, y: 2 });
    expect(played.state.validMoves).toEqual(
      getValidMoves(played.state.board, AI),
    );
  });

  it('does not mutate the position it was played from', () => {
    const start = freshGame();
    const snapshot = JSON.stringify(start);
    playMove(start, { x: 3, y: 2 }, PLAYER);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('moves the last-move marker with its disc when the board flips', () => {
    const { history, states } = playOut(MIRROR_INTERVAL);
    const { record } = history[MIRROR_INTERVAL - 1];
    const after = states[MIRROR_INTERVAL];
    expect(record.mirrored).toBe(true);
    expect(after.lastMove).toEqual({
      x: SIZE - 1 - record.point.x,
      y: record.point.y,
    });
    expect(after.board[after.lastMove!.y][after.lastMove!.x]).toBe(record.color);
    // The three earlier plies did not flip and keep the marker in place.
    for (let i = 0; i < MIRROR_INTERVAL - 1; i += 1) {
      expect(history[i].record.mirrored).toBe(false);
      expect(states[i + 1].lastMove).toEqual(history[i].record.point);
    }
  });

  it('records a pass and keeps the mover on turn', () => {
    const b = empty();
    b[0][0] = PLAYER;
    b[0][1] = AI;
    b[7][7] = PLAYER;
    b[7][6] = AI;
    b[7][5] = AI;
    const played = playMove(stateFor(b, PLAYER), { x: 2, y: 0 }, PLAYER)!;
    expect(played.entry.record.passed).toBe(true);
    expect(played.state.currentColor).toBe(PLAYER);
    expect(played.state.result).toBeNull();
  });

  it('ends the game with a result when neither side can move', () => {
    const b = empty();
    b[0][0] = PLAYER;
    b[0][1] = AI;
    const played = playMove(stateFor(b, PLAYER), { x: 2, y: 0 }, PLAYER)!;
    expect(played.state.currentColor).toBe(EMPTY);
    expect(played.state.validMoves).toEqual([]);
    expect(played.state.result).toBe('player');
    expect(played.state.result).toBe(resultFromBoard(played.state.board));
  });
});

describe('MirrorOthello history — undo', () => {
  it('has nothing to undo before the player has moved', () => {
    expect(canUndo([])).toBe(false);
    expect(undoLastPlayerMove([])).toBeNull();
  });

  it('takes back the player move and the AI reply together', () => {
    const { history, states } = playOut(2);
    expect(canUndo(history)).toBe(true);
    const undone = undoLastPlayerMove(history)!;
    expect(undone.state).toBe(states[0]);
    expect(undone.history).toEqual([]);
    expect(undone.removed).toBe(2);
  });

  it('takes back only the player move while the AI is still to reply', () => {
    const { history, states } = playOut(3);
    const undone = undoLastPlayerMove(history)!;
    expect(undone.state).toBe(states[2]);
    expect(undone.state.currentColor).toBe(PLAYER);
    expect(undone.history).toEqual(history.slice(0, 2));
    expect(undone.removed).toBe(1);
  });

  it('restores the un-mirrored board when undoing across a flip', () => {
    // Ply 3 is the player's, ply 4 (the AI's) triggers the flip.
    const { state, history, states } = playOut(MIRROR_INTERVAL);
    expect(history[MIRROR_INTERVAL - 1].record.mirrored).toBe(true);
    const undone = undoLastPlayerMove(history)!;
    expect(undone.state).toBe(states[2]);
    expect(undone.state.turnCount).toBe(2);
    expect(undone.state.board).not.toEqual(mirrorHorizontally(state.board));
    expect(undone.state.validMoves).toEqual(
      getValidMoves(undone.state.board, PLAYER),
    );
  });

  it('can be repeated all the way back to the opening', () => {
    let { history } = playOut(11);
    let last: GameState | null = null;
    while (canUndo(history)) {
      const undone = undoLastPlayerMove(history)!;
      expect(undone.state.currentColor).toBe(PLAYER);
      expect(undone.history.length).toBeLessThan(history.length);
      history = undone.history;
      last = undone.state;
    }
    expect(history).toEqual([]);
    expect(last).toEqual(freshGame());
  });

  it('skips back over consecutive AI moves made while the player had to pass', () => {
    const before = freshGame();
    const entry = (ply: number, color: Cell): HistoryEntry => ({
      before: { ...before, turnCount: ply - 1, currentColor: color },
      record: {
        ply,
        color,
        point: { x: 0, y: 0 },
        label: 'a1',
        mirrored: false,
        passed: false,
      },
    });
    const history = [
      entry(1, PLAYER),
      entry(2, AI),
      entry(3, PLAYER),
      entry(4, AI),
      entry(5, AI),
    ];
    const undone = undoLastPlayerMove(history)!;
    expect(undone.state).toBe(history[2].before);
    expect(undone.history).toEqual(history.slice(0, 2));
    expect(undone.removed).toBe(3);
  });

  it('reopens a finished game', () => {
    const b = empty();
    b[0][0] = PLAYER;
    b[0][1] = AI;
    const start = stateFor(b, PLAYER);
    const played = playMove(start, { x: 2, y: 0 }, PLAYER)!;
    expect(played.state.result).not.toBeNull();
    const undone = undoLastPlayerMove([played.entry])!;
    expect(undone.state).toBe(start);
    expect(undone.state.result).toBeNull();
  });

  it('replaying the undone move reaches the same position', () => {
    const { state, history } = playOut(6);
    const undone = undoLastPlayerMove(history)!;
    let replay = undone.state;
    for (const { record } of history.slice(undone.history.length)) {
      replay = playMove(replay, record.point, record.color)!.state;
    }
    expect(replay).toEqual(state);
  });
});
