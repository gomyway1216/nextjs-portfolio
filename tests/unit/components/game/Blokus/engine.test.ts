import { describe, expect, it } from 'vitest';
import {
  ALL_PLACED_BONUS,
  FULL_HAND,
  ORIENTATIONS,
  PIECES,
  RULES,
  SINGLE_LAST_BONUS,
  TOTAL_SQUARES,
  applyMove,
  cloneState,
  copyState,
  encodeMove,
  flipCells,
  hasLegalMove,
  isLegalPlacement,
  legalMoves,
  moveCells,
  moveOrientation,
  movePiece,
  newGame,
  orientationOf,
  passTurn,
  rotateCells,
  scoreOf,
  scores,
  winners,
  type GameState,
  type Mode,
} from '@/components/game/Blokus/engine';

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The rules written out cell by cell, sharing nothing with the masks under test. */
function referenceMoves(state: GameState, color: number): number[] {
  const { size, starts } = state.rules;
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= size || c >= size ? -2 : state.board[r * size + c]);
  const first = state.placed[color] === 0;
  const moves: number[] = [];
  for (const orientation of ORIENTATIONS) {
    if ((state.hands[color] & (1 << orientation.piece)) === 0) continue;
    for (let row = 0; row + orientation.height <= size; row++) {
      for (let col = 0; col + orientation.width <= size; col++) {
        const cells = orientation.cells.map(([r, c]) => [row + r, col + c] as const);
        if (cells.some(([r, c]) => at(r, c) !== -1)) continue;
        if (cells.some(([r, c]) => [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)].includes(color))) continue;
        const touches = first
          ? cells.some(([r, c]) => r === starts[color][0] && c === starts[color][1])
          : cells.some(([r, c]) => [at(r - 1, c - 1), at(r - 1, c + 1), at(r + 1, c - 1), at(r + 1, c + 1)].includes(color));
        if (touches) moves.push(encodeMove(orientation.index, row, col));
      }
    }
  }
  return moves.sort((a, b) => a - b);
}

const sorted = (moves: number[]) => [...moves].sort((a, b) => a - b);

/** Play a random game, calling `visit` before each move. */
function playRandom(mode: Mode, seed: number, visit: (state: GameState) => void = () => {}): GameState {
  const random = rng(seed);
  const state = newGame(mode);
  while (!state.over) {
    visit(state);
    const moves = legalMoves(state);
    if (moves.length === 0) passTurn(state);
    else applyMove(state, moves[Math.floor(random() * moves.length)]);
  }
  return state;
}

describe('pieces', () => {
  it('has the 21 Blokus pieces: 89 squares and 91 orientations', () => {
    expect(PIECES).toHaveLength(21);
    expect(TOTAL_SQUARES).toBe(89);
    expect(ORIENTATIONS).toHaveLength(91);
    const bySize = PIECES.reduce<Record<number, number>>((count, piece) => ({ ...count, [piece.size]: (count[piece.size] ?? 0) + 1 }), {});
    expect(bySize).toEqual({ 1: 1, 2: 1, 3: 2, 4: 5, 5: 12 });
  });

  it('counts each piece’s distinct orientations', () => {
    const counts = Object.fromEntries(PIECES.map((piece) => [piece.name, piece.orientations.length]));
    expect(counts).toEqual({
      I1: 1, I2: 2, I3: 2, V3: 4, I4: 2, L4: 8, O4: 1, T4: 4, Z4: 4,
      F5: 8, I5: 2, L5: 8, N5: 8, P5: 8, T5: 4, U5: 4, V5: 4, W5: 4, X5: 1, Y5: 8, Z5: 4,
    });
  });

  it('has every piece connected and no two pieces the same shape', () => {
    const keys = new Set<string>();
    for (const orientation of ORIENTATIONS) {
      const key = orientation.cells.join(';');
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      const left = new Set(orientation.cells.map(([r, c]) => `${r},${c}`));
      const stack = [orientation.cells[0]];
      left.delete(`${stack[0][0]},${stack[0][1]}`);
      while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          if (left.delete(`${nr},${nc}`)) stack.push([nr, nc]);
        }
      }
      expect(left.size).toBe(0);
    }
  });

  it('turns and flips within the piece’s orientations', () => {
    for (const piece of PIECES) {
      let cells = piece.shape.map(([r, c]): [number, number] => [r, c]);
      for (let i = 0; i < 8; i++) {
        const orientation = orientationOf(piece.index, cells);
        expect(orientation.piece).toBe(piece.index);
        cells = i === 3 ? flipCells(cells) : rotateCells(cells);
      }
    }
    expect(() => orientationOf(0, [[0, 0], [0, 1]])).toThrow();
  });
});

describe('the first move', () => {
  it('must cover the colour’s start square', () => {
    for (const mode of ['classic', 'duo'] as const) {
      const state = newGame(mode);
      const moves = legalMoves(state);
      expect(moves.length).toBeGreaterThan(0);
      const [row, col] = RULES[mode].starts[0];
      for (const move of moves) expect(moveCells(move)).toContainEqual([row, col]);
    }
  });

  it('offers every piece that can sit in a corner: all but the X', () => {
    const state = newGame('classic');
    const moves = legalMoves(state);
    const offered = new Set(moves.map((move) => PIECES[movePiece(move)].name));
    expect(offered.size).toBe(20);
    expect(offered.has('X5')).toBe(false);
    expect(sorted(moves)).toEqual(referenceMoves(state, 0));
  });

  it('lets any cell of a piece cover the Duo start square', () => {
    const state = newGame('duo');
    const moves = legalMoves(state);
    expect(sorted(moves)).toEqual(referenceMoves(state, 0));
    // X5 has five cells and one orientation, so five ways to cover the square.
    expect(moves.filter((move) => PIECES[movePiece(move)].name === 'X5')).toHaveLength(5);
  });
});

describe('placement', () => {
  const single = PIECES.find((piece) => piece.name === 'I1')!;
  const dot = ORIENTATIONS[single.orientations[0]];
  const v3 = ORIENTATIONS[PIECES.find((piece) => piece.name === 'V3')!.orientations[0]];

  it('takes a corner touch and refuses an edge touch of the same colour', () => {
    const state = newGame('classic');
    applyMove(state, encodeMove(dot.index, 0, 0));
    for (let color = 1; color < 4; color++) passTurn(state);
    expect(state.toMove).toBe(0);
    const domino = ORIENTATIONS[PIECES.find((piece) => piece.name === 'I2')!.orientations[0]];
    // Diagonal to the single: fine.
    expect(isLegalPlacement(state, 0, domino, 1, 1)).toBe(true);
    // Beside it.
    expect(isLegalPlacement(state, 0, domino, 0, 1)).toBe(false);
    // Touching nothing.
    expect(isLegalPlacement(state, 0, domino, 5, 5)).toBe(false);
  });

  it('lets a colour touch another colour by edge, and not overlap it', () => {
    const state = newGame('duo');
    applyMove(state, encodeMove(dot.index, 4, 4));
    applyMove(state, encodeMove(dot.index, 9, 9));
    state.toMove = 0;
    applyMove(state, encodeMove(v3.index, 5, 5));
    expect(state.board[5 * 14 + 5]).toBe(0);
    state.toMove = 1;
    const domino = ORIENTATIONS[PIECES.find((piece) => piece.name === 'I2')!.orientations[0]];
    expect(isLegalPlacement(state, 1, domino, 5, 5)).toBe(false);
  });

  it('refuses a piece already played and a placement off the board', () => {
    const state = newGame('classic');
    applyMove(state, encodeMove(dot.index, 0, 0));
    expect(isLegalPlacement(state, 0, dot, 1, 1)).toBe(false);
    const long = ORIENTATIONS[PIECES.find((piece) => piece.name === 'I5')!.orientations[0]];
    const across = long.width === 5 ? long : ORIENTATIONS[PIECES.find((piece) => piece.name === 'I5')!.orientations[1]];
    expect(isLegalPlacement(state, 1, across, 0, 16)).toBe(false);
    expect(isLegalPlacement(state, 1, across, 0, 15)).toBe(true);
    expect(isLegalPlacement(state, 1, across, -1, 15)).toBe(false);
  });
});

describe('the move generator', () => {
  it.each(['classic', 'duo'] as const)('agrees with the cell-by-cell rules through random %s games', (mode) => {
    for (let seed = 1; seed <= 3; seed++) {
      playRandom(mode, seed, (state) => {
        for (let color = 0; color < state.rules.colors; color++) {
          const moves = legalMoves(state, color);
          expect(new Set(moves).size).toBe(moves.length);
          expect(sorted(moves)).toEqual(referenceMoves(state, color));
          expect(hasLegalMove(state, color)).toBe(moves.length > 0);
        }
      });
    }
  }, 30_000);

  it('accepts exactly what isLegalPlacement accepts', () => {
    playRandom('duo', 9, (state) => {
      const color = state.toMove;
      const legal = new Set(legalMoves(state, color));
      for (const orientation of ORIENTATIONS) {
        for (let row = 0; row + orientation.height <= state.rules.size; row++) {
          for (let col = 0; col + orientation.width <= state.rules.size; col++) {
            const move = encodeMove(orientation.index, row, col);
            expect(isLegalPlacement(state, color, orientation, row, col)).toBe(legal.has(move));
          }
        }
      }
    });
  }, 30_000);
});

describe('a whole game', () => {
  it.each(['classic', 'duo'] as const)('ends with every colour out, the board matching the hands (%s)', (mode) => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = playRandom(mode, seed);
      expect(state.over).toBe(true);
      expect([...state.out].every((flag, color) => flag === 1 || state.hands[color] === 0)).toBe(true);
      for (let color = 0; color < state.rules.colors; color++) {
        const onBoard = [...state.board].filter((cell) => cell === color).length;
        expect(onBoard).toBe(state.placed[color]);
        const inHand = PIECES.filter((piece) => (state.hands[color] & (1 << piece.index)) !== 0).reduce((sum, piece) => sum + piece.size, 0);
        expect(onBoard + inHand).toBe(TOTAL_SQUARES);
        expect(hasLegalMove(state, color)).toBe(false);
      }
    }
  });

  it('skips a colour that is out', () => {
    const state = newGame('classic');
    passTurn(state);
    expect(state.toMove).toBe(1);
    passTurn(state);
    passTurn(state);
    expect(state.toMove).toBe(3);
    applyMove(state, legalMoves(state)[0]);
    expect(state.toMove).toBe(3);
    expect(state.over).toBe(false);
    passTurn(state);
    expect(state.over).toBe(true);
  });

  it('copies state without sharing it', () => {
    const state = newGame('classic');
    applyMove(state, legalMoves(state)[3]);
    const clone = cloneState(state);
    const before = legalMoves(clone);
    applyMove(clone, before[0]);
    expect(legalMoves(state)).toEqual(before);
    expect(clone.toMove).toBe(2);
    expect(state.toMove).toBe(1);
    copyState(clone, state);
    expect(clone.toMove).toBe(1);
    expect(legalMoves(clone)).toEqual(before);
  });

  it('rebuilds a played move from its id', () => {
    const state = newGame('classic');
    for (const move of legalMoves(state)) {
      const orientation = moveOrientation(move);
      const [firstRow, firstCol] = moveCells(move)[0];
      expect(firstRow).toBeGreaterThanOrEqual(0);
      expect(firstCol).toBeLessThan(20);
      expect(orientation.cells).toHaveLength(moveCells(move).length);
    }
  });
});

describe('scoring', () => {
  it('counts squares left in hand against a colour', () => {
    const state = newGame('classic');
    expect(state.hands[0]).toBe(FULL_HAND);
    expect(scoreOf(state, 0)).toBe(-89);
    const big = legalMoves(state).find((move) => PIECES[movePiece(move)].size === 5)!;
    applyMove(state, big);
    expect(scoreOf(state, 0)).toBe(-84);
  });

  it('gives 15 for placing everything and 5 more when the single went last', () => {
    const state = newGame('classic');
    state.hands[0] = 0;
    state.last[0] = 3;
    expect(scoreOf(state, 0)).toBe(ALL_PLACED_BONUS);
    state.last[0] = 0;
    expect(scoreOf(state, 0)).toBe(ALL_PLACED_BONUS + SINGLE_LAST_BONUS);
  });

  it('names every colour on the top score', () => {
    const state = newGame('classic');
    state.placed[1] = 30;
    state.placed[3] = 30;
    expect(scores(state)).toEqual([-89, -59, -89, -59]);
    expect(winners(state)).toEqual([1, 3]);
  });
});
