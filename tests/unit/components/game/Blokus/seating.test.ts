import { describe, expect, it } from 'vitest';

import { applyMove, legalMoves, newGame, scoreOf } from '@/components/game/Blokus/engine';
import {
  SHARED,
  chooseColor,
  defaultSeating,
  isValidSeating,
  ownerOf,
  seatFor,
  seatScores,
  seatWinners,
  sideOf,
} from '@/components/game/Blokus/seating';

const colorsOf = (seating: ReturnType<typeof defaultSeating>) => seating.seats.map((seat) => seat.colors);

describe('default seatings', () => {
  it('seats four players on a colour each', () => {
    const seating = defaultSeating('classic', 4);
    expect(colorsOf(seating)).toEqual([[0], [1], [2], [3]]);
    expect(seating.shared).toBeNull();
  });

  it('shares the fourth colour among three players', () => {
    const seating = defaultSeating('classic', 3);
    expect(colorsOf(seating)).toEqual([[0], [1], [2]]);
    expect(seating.shared).toBe(3);
    expect(ownerOf(seating, 3)).toBe(SHARED);
  });

  it('gives two players opposite corners', () => {
    expect(colorsOf(defaultSeating('classic', 2))).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('gives Duo one colour a side', () => {
    expect(colorsOf(defaultSeating('duo', 2))).toEqual([[0], [1]]);
  });

  it('refuses a count the board cannot seat', () => {
    expect(() => defaultSeating('duo', 3)).toThrow();
    expect(() => defaultSeating('classic', 1)).toThrow();
  });

  it.each([
    ['classic', 2],
    ['classic', 3],
    ['classic', 4],
    ['duo', 2],
  ] as const)('%s for %i is valid', (mode, count) => {
    expect(isValidSeating(defaultSeating(mode, count))).toBe(true);
  });
});

describe('choosing a colour', () => {
  it('swaps with the seat that held it', () => {
    expect(colorsOf(chooseColor(defaultSeating('classic', 4), 0, 2))).toEqual([[2], [1], [0], [3]]);
  });

  it('takes the shared colour and leaves the old one shared', () => {
    const seating = chooseColor(defaultSeating('classic', 3), 1, 3);
    expect(colorsOf(seating)).toEqual([[0], [3], [2]]);
    expect(seating.shared).toBe(1);
    expect(isValidSeating(seating)).toBe(true);
  });

  it('brings the opposite corner along in a two-player game', () => {
    expect(colorsOf(chooseColor(defaultSeating('classic', 2), 0, 1))).toEqual([
      [1, 3],
      [0, 2],
    ]);
    expect(colorsOf(chooseColor(defaultSeating('classic', 2), 0, 3))).toEqual([
      [1, 3],
      [0, 2],
    ]);
  });

  it('swaps sides in Duo', () => {
    expect(colorsOf(chooseColor(defaultSeating('duo', 2), 0, 1))).toEqual([[1], [0]]);
  });

  it('changes nothing when the seat already holds it', () => {
    const seating = defaultSeating('classic', 2);
    expect(chooseColor(seating, 0, 2)).toBe(seating);
  });

  it('keeps the controllers in their seats', () => {
    const seating = defaultSeating('classic', 4, [{ kind: 'human' }, { kind: 'ai', level: 'hard' }]);
    expect(chooseColor(seating, 0, 1).seats[1].controller).toEqual({ kind: 'ai', level: 'hard' });
  });
});

describe('whose turn', () => {
  it('follows the colour to the seat that holds it', () => {
    const seating = chooseColor(defaultSeating('classic', 4), 0, 2);
    const state = newGame('classic');
    expect(seatFor(seating, state)).toBe(2);
    expect(seatFor(seating, state, 2)).toBe(0);
  });

  it('takes the shared colour round the seats, one piece each', () => {
    const seating = defaultSeating('classic', 3);
    const state = newGame('classic');
    const seen: number[] = [];
    for (let turn = 0; turn < 12; turn++) {
      if (state.toMove === 3) seen.push(seatFor(seating, state));
      applyMove(state, legalMoves(state)[0]);
    }
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe('scores', () => {
  it('adds a side together', () => {
    const seating = defaultSeating('classic', 2);
    const state = newGame('classic');
    applyMove(state, legalMoves(state)[0]);
    expect(seatScores(seating, state)).toEqual([scoreOf(state, 0) + scoreOf(state, 2), scoreOf(state, 1) + scoreOf(state, 3)]);
  });

  it('leaves the shared colour out', () => {
    const seating = defaultSeating('classic', 3);
    const state = newGame('classic');
    for (let turn = 0; turn < 4; turn++) applyMove(state, legalMoves(state)[0]);
    expect(seatScores(seating, state)).toEqual([scoreOf(state, 0), scoreOf(state, 1), scoreOf(state, 2)]);
  });

  it('ties every top seat', () => {
    expect(seatWinners(defaultSeating('classic', 4), newGame('classic'))).toEqual([0, 1, 2, 3]);
  });

  it('counts the shared colour on neither side', () => {
    expect(sideOf(defaultSeating('classic', 3), 0)).toEqual({ own: [0], rivals: [1, 2] });
    expect(sideOf(defaultSeating('classic', 2), 1)).toEqual({ own: [1, 3], rivals: [0, 2] });
  });
});
