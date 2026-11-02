/**
 * Writes blokus-online-fixture.json: seeded games played with this repo's engine
 * and what each must replay to. The backend keeps an identical copy of the JSON
 * and of the engine, and both repos test against it, so a change on one side
 * only fails a test.
 *
 * After a deliberate change to the engine or seating, run this, copy the JSON to
 * the backend's functions/test/fixtures/, and copy the engine change across too:
 *   npx tsx tests/unit/components/game/Blokus/fixtures/generateBlokusFixture.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ORIENTATIONS,
  PASS,
  applyMove,
  hasLegalMove,
  legalMoves,
  newGame,
  passTurn,
  scores,
  type Mode,
} from '../../../../../../src/components/game/Blokus/engine';
import {
  chooseColor,
  defaultSeating,
  seatFor,
  seatScores,
  seatWinners,
  type Seating,
} from '../../../../../../src/components/game/Blokus/seating';

const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const playOut = (mode: Mode, count: number, picks: ReadonlyArray<readonly [number, number]>, seed: number) => {
  const next = random(seed);
  const seating: Seating = picks.reduce((taken, [seat, color]) => chooseColor(taken, seat, color), defaultSeating(mode, count));
  const game = newGame(mode);
  const moves: number[] = [];
  /** At each turn: colour, whose seat, how many legal moves and the sum of their ids. */
  const turns: number[][] = [];
  while (!game.over) {
    if (!hasLegalMove(game)) {
      passTurn(game);
      moves.push(PASS);
      continue;
    }
    const legal = legalMoves(game);
    turns.push([game.toMove, seatFor(seating, game), legal.length, legal.reduce((sum, move) => sum + move, 0)]);
    const move = legal[Math.floor(next() * legal.length)];
    applyMove(game, move);
    moves.push(move);
  }
  return {
    mode,
    picks,
    seats: seating.seats.map((seat) => seat.colors),
    shared: seating.shared,
    moves,
    turns,
    expected: {
      board: Array.from(game.board).map((cell) => (cell < 0 ? '.' : cell)).join(''),
      scores: scores(game),
      seatScores: seatScores(seating, game),
      seatWinners: seatWinners(seating, game),
    },
  };
};

const fixture = {
  orientations: ORIENTATIONS.map((orientation) => `${orientation.piece}:${orientation.rows.join('.')}`),
  games: [
    playOut('classic', 4, [], 1),
    playOut('classic', 4, [[0, 2]], 2),
    playOut('classic', 3, [], 3),
    playOut('classic', 3, [[1, 3]], 4),
    playOut('classic', 2, [], 5),
    playOut('classic', 2, [[0, 1]], 6),
    playOut('duo', 2, [], 7),
    playOut('duo', 2, [[0, 1]], 8),
  ],
};

writeFileSync(resolve(__dirname, 'blokus-online-fixture.json'), `${JSON.stringify(fixture)}\n`);
