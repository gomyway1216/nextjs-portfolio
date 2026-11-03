import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chooseMove, defaultViews, reviewMove, seededRandom } from '@/components/game/Blokus/ai';
import { PASS, PIECES, applyMove, cloneState, legalMoves, movePiece, newGame, passTurn, scoreOf, type Mode } from '@/components/game/Blokus/engine';
import {
  MAX_RECORDS,
  RECORDS_KEY,
  RECORD_VERSION,
  deleteRecord,
  loadRecords,
  moveText,
  positions,
  recordText,
  reviewedSeatOf,
  reviewedSeats,
  saveRecord,
  verdictOf,
  type GameRecord,
} from '@/components/game/Blokus/record';
import { defaultSeating, type Seating } from '@/components/game/Blokus/seating';

/** A whole game between hard AIs, with the passes, as the page records it. */
const selfPlay = (mode: Mode, seed: number): number[] => {
  const game = newGame(mode);
  const random = seededRandom(seed);
  const moves: number[] = [];
  while (!game.over) {
    const legal = legalMoves(game);
    if (legal.length === 0) {
      passTurn(game);
      moves.push(PASS);
      continue;
    }
    const move = chooseMove(game, legal, 'hard', { random });
    applyMove(game, move);
    moves.push(move);
  }
  return moves;
};

const youAgainstAi = (mode: Mode, count: number): Seating =>
  defaultSeating(
    mode,
    count,
    Array.from({ length: count }, (_, seat) => (seat === 0 ? { kind: 'human' as const } : { kind: 'ai' as const, level: 'hard' as const })),
  );

const recordOf = (overrides: Partial<GameRecord> = {}): GameRecord => ({
  v: RECORD_VERSION,
  id: 'a',
  playedAt: 1_000,
  online: false,
  seating: youAgainstAi('duo', 2),
  me: 0,
  moves: selfPlay('duo', 1),
  ...overrides,
});

describe('rebuilding a game from its moves', () => {
  it('ends where the game ended, with a position before every move', () => {
    const moves = selfPlay('classic', 4);
    const states = positions({ seating: youAgainstAi('classic', 4), moves });
    expect(states).toHaveLength(moves.length + 1);
    expect(states.at(-1)!.over).toBe(true);
    expect(states[0].placed.every((squares) => squares === 0)).toBe(true);
  });

  it('stops at the first move that is not legal, keeping what came before', () => {
    const moves = selfPlay('duo', 2);
    const broken = [...moves.slice(0, 5), moves[0], ...moves.slice(6)];
    expect(positions({ seating: youAgainstAi('duo', 2), moves: broken })).toHaveLength(6);
  });

  it('takes a pass online even with moves left, as a turn that ran out', () => {
    const moves = selfPlay('duo', 3);
    const states = positions({ seating: youAgainstAi('duo', 2), moves: [moves[0], PASS, ...moves.slice(1, 4)] });
    expect(states[2].out[1]).toBe(1);
  });
});

describe('which moves a review looks at', () => {
  it('looks at your seat only, against AIs', () => {
    expect(reviewedSeats(recordOf())).toEqual([0]);
  });

  it('looks at every person when several shared the device', () => {
    const seating = defaultSeating('classic', 3, [{ kind: 'human' }, { kind: 'human' }, { kind: 'ai', level: 'easy' }]);
    expect(reviewedSeats({ seating, me: null })).toEqual([0, 1]);
  });

  it('leaves out the shared colour, which scores for nobody, and passes', () => {
    const seating = youAgainstAi('classic', 3);
    const moves = selfPlay('classic', 5);
    const states = positions({ seating, moves });
    const seats = moves.map((move, index) => reviewedSeatOf({ seating, me: 0 }, states[index], move));
    moves.forEach((move, index) => {
      const color = states[index].toMove;
      expect(seats[index]).toBe(move !== PASS && color === 0 ? 0 : -1);
    });
    expect(seats.filter((seat) => seat === 0).length).toBeGreaterThan(5);
  });
});

describe('verdicts', () => {
  const review = (lost: number) => ({ best: 1, bestMargin: 10, playedMargin: 10 - lost });

  it('calls the best move best, and nothing inside the noise a slip', () => {
    expect(verdictOf(review(3), 1)).toBe('best');
    expect(verdictOf(review(0.2), 2)).toBe('best');
    expect(verdictOf(review(1.4), 2)).toBe('good');
  });

  it('grows with the points given away', () => {
    expect(verdictOf(review(1.5), 2)).toBe('inaccuracy');
    expect(verdictOf(review(4), 2)).toBe('mistake');
    expect(verdictOf(review(8), 2)).toBe('blunder');
  });
});

describe('keeping records on the device', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads back what it saved, newest first', () => {
    saveRecord(recordOf({ id: 'old', playedAt: 1 }));
    saveRecord(recordOf({ id: 'new', playedAt: 2 }));
    expect(loadRecords().map(({ id }) => id)).toEqual(['new', 'old']);
  });

  it('replaces a record with the same id, so a review is saved onto its game', () => {
    const record = recordOf();
    saveRecord(record);
    saveRecord({ ...record, review: [{ best: 3, bestMargin: 1, playedMargin: 0 }] });
    expect(loadRecords()).toHaveLength(1);
    expect(loadRecords()[0].review).toHaveLength(1);
  });

  it(`keeps the newest ${MAX_RECORDS}`, () => {
    for (let n = 0; n < MAX_RECORDS + 5; n++) saveRecord(recordOf({ id: `r${n}`, playedAt: n }));
    const kept = loadRecords();
    expect(kept).toHaveLength(MAX_RECORDS);
    expect(kept[0].id).toBe(`r${MAX_RECORDS + 4}`);
  });

  it('deletes one', () => {
    saveRecord(recordOf({ id: 'keep', playedAt: 1 }));
    saveRecord(recordOf({ id: 'go', playedAt: 2 }));
    deleteRecord('go');
    expect(loadRecords().map(({ id }) => id)).toEqual(['keep']);
  });

  it('skips what it cannot read, and survives storage that is broken', () => {
    store.set(RECORDS_KEY, JSON.stringify([{ v: 99 }, recordOf({ id: 'ok' }), { ...recordOf(), seating: { mode: 'duo', seats: [], shared: null } }]));
    expect(loadRecords().map(({ id }) => id)).toEqual(['ok']);
    store.set(RECORDS_KEY, '{not json');
    expect(loadRecords()).toEqual([]);
  });

  it('says so when storage refuses a write', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    expect(saveRecord(recordOf())).toBe(false);
  });
});

describe('the record as text', () => {
  it('has a line a move, the final scores and the record itself to rebuild it from', () => {
    const record = recordOf({ review: [{ best: PASS, bestMargin: 5, playedMargin: 0 }] });
    const text = recordText(record, { colors: ['Violet', 'Orange'], seat: (seat) => (seat === 0 ? 'You' : 'AI') });
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^Blokus duo, 2 players, /);
    expect(text).toMatch(/^1\. Violet: [A-Z]\d \([A-N]\d+( [A-N]\d+)*\)/m);
    expect(lines.find((line) => line.startsWith('1. '))).toMatch(/\[mistake, 5\.0 pts, best pass\]$/);
    const final = positions(record).at(-1)!;
    expect(text).toContain(`Final: You ${scoreOf(final, 0)}, AI ${scoreOf(final, 1)}`);
    const rebuilt = JSON.parse(lines.at(-1)!);
    expect(positions(rebuilt).at(-1)!.board).toEqual(final.board);
  });

  it('names a move by its piece and the cells it covers', () => {
    const game = newGame('duo');
    const move = legalMoves(game).find((candidate) => PIECES[movePiece(candidate)].name === 'I1')!;
    expect(moveText(move)).toBe('I1 (E5)');
    expect(moveText(PASS)).toBe('pass');
  });
});

describe('reviewing a move', () => {
  const position = () => {
    const game = newGame('duo');
    const moves = selfPlay('duo', 6);
    for (const move of moves.slice(0, 6)) applyMove(game, move);
    return game;
  };
  const views = defaultViews(newGame('duo'));
  const budget = { playouts: 24, timeLimitMs: 60_000 };

  it('finds the one-square piece early on a loss against the best', () => {
    const game = position();
    const tiny = legalMoves(game).find((move) => PIECES[movePiece(move)].size === 1)!;
    const review = reviewMove(cloneState(game), tiny, { view: views[game.toMove], views, seed: 1, budget });
    expect(review.playouts).toBe(24);
    expect(review.best).not.toBe(tiny);
    expect(review.bestMargin - review.playedMargin).toBeGreaterThan(1.5);
    expect(legalMoves(game)).toContain(review.best);
  });

  it('gives the same answer for the same seed, and leaves the position alone', () => {
    const game = position();
    const before = cloneState(game);
    const played = legalMoves(game)[0];
    const first = reviewMove(game, played, { view: views[game.toMove], views, seed: 9, budget });
    expect(reviewMove(game, played, { view: views[game.toMove], views, seed: 9, budget })).toEqual(first);
    expect(game.board).toEqual(before.board);
    expect(game.toMove).toBe(before.toMove);
  });

  it('stops at its time limit after at least one game each', () => {
    const game = position();
    let clock = 0;
    const review = reviewMove(game, legalMoves(game)[0], { view: views[game.toMove], views, seed: 2, budget: { playouts: 1_000, timeLimitMs: 5 }, now: () => (clock += 10) });
    expect(review.playouts).toBe(1);
  });
});
