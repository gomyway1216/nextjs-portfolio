import { describe, expect, it } from 'vitest';

import { replay } from '@/components/game/Blokus/online/wire';
import { ORIENTATIONS, PASS, hasLegalMove, isLegalPlacement, legalMoves, moveCol, moveOrientation, moveRow, scores, type Mode } from '@/components/game/Blokus/engine';
import { chooseColor, defaultSeating, isValidSeating, seatFor, seatScores, seatWinners } from '@/components/game/Blokus/seating';
import fixture from './fixtures/blokus-online-fixture.json';

/**
 * The backend keeps the same JSON and a copy of the engine and seating
 * (functions/src/gameRoom/games/blokusEngine.ts, blokusSeating.ts), and runs the
 * same checks. If this fails after a change here, the server no longer agrees
 * with the client: see fixtures/generateBlokusFixture.ts.
 */
interface FixtureGame {
  mode: Mode;
  picks: Array<[number, number]>;
  seats: number[][];
  shared: number | null;
  moves: number[];
  turns: number[][];
  expected: { board: string; scores: number[]; seatScores: number[]; seatWinners: number[] };
}

const games = fixture.games as unknown as FixtureGame[];

const seatingOf = (entry: FixtureGame) =>
  entry.picks.reduce((taken, [seat, color]) => chooseColor(taken, seat, color), defaultSeating(entry.mode, entry.seats.length));

describe('the fixture shared with the server', () => {
  it('has the same piece and orientation tables', () => {
    expect(ORIENTATIONS.map((orientation) => `${orientation.piece}:${orientation.rows.join('.')}`)).toEqual(fixture.orientations);
  });

  it.each(games.map((entry, index) => [`${entry.mode} ${entry.seats.length} seats, game ${index}`, entry] as const))('%s', (_, entry) => {
    const seating = seatingOf(entry);
    expect(seating.seats.map((seat) => seat.colors)).toEqual(entry.seats);
    expect(seating.shared).toBe(entry.shared);
    expect(isValidSeating(seating)).toBe(true);

    let turn = 0;
    entry.moves.forEach((move, index) => {
      const { game } = replay(entry.mode, entry.moves.slice(0, index));
      if (move === PASS) {
        expect(hasLegalMove(game)).toBe(false);
        return;
      }
      const legal = legalMoves(game);
      expect([game.toMove, seatFor(seating, game), legal.length, legal.reduce((sum, id) => sum + id, 0)]).toEqual(entry.turns[turn]);
      expect(isLegalPlacement(game, game.toMove, moveOrientation(move), moveRow(move), moveCol(move))).toBe(true);
      turn += 1;
    });

    const { game } = replay(entry.mode, entry.moves);
    expect(game.over).toBe(true);
    expect(Array.from(game.board).map((cell) => (cell < 0 ? '.' : cell)).join('')).toBe(entry.expected.board);
    expect(scores(game)).toEqual(entry.expected.scores);
    expect(seatScores(seating, game)).toEqual(entry.expected.seatScores);
    expect(seatWinners(seating, game)).toEqual(entry.expected.seatWinners);
  });
});
