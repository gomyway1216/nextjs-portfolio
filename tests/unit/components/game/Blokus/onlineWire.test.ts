import { describe, expect, it } from 'vitest';

import { PASS, applyMove, encodeMove, legalMoves, moveCells, newGame, passTurn } from '@/components/game/Blokus/engine';
import { defaultSeating, seatFor } from '@/components/game/Blokus/seating';
import { errorText, getBlokusOnlineStrings } from '@/components/game/Blokus/online/strings';
import {
  inviteUrl,
  leftSeatsOf,
  parseInvite,
  parseMoves,
  parseSeats,
  parseWinners,
  randomKey,
  replay,
  seatToPlay,
  toSeating,
} from '@/components/game/Blokus/online/wire';

describe('parsing the wire', () => {
  it('reads a move list', () => {
    expect(parseMoves('[12345,-1,0]')).toEqual([12345, PASS, 0]);
    expect(parseMoves('[]')).toEqual([]);
  });

  it('treats a missing or broken move list as no moves', () => {
    expect(parseMoves(undefined)).toEqual([]);
    expect(parseMoves('not json')).toEqual([]);
    expect(parseMoves('{"a":1}')).toEqual([]);
    expect(parseMoves('[1,"two"]')).toEqual([]);
    expect(parseMoves('[1.5]')).toEqual([]);
  });

  it('reads seats, and rejects anything else', () => {
    const wire = { seats: [{ id: 'a', name: 'Ann', colors: [0, 2] }], shared: null };
    expect(parseSeats(JSON.stringify(wire))).toEqual(wire);
    expect(parseSeats(undefined)).toBeNull();
    expect(parseSeats('null')).toBeNull();
    expect(parseSeats('{"seats":1}')).toBeNull();
    expect(parseSeats('oops')).toBeNull();
  });

  it('reads the winners', () => {
    expect(parseWinners('[0,2]')).toEqual([0, 2]);
    expect(parseWinners(undefined)).toEqual([]);
  });
});

describe('replay', () => {
  it('is the same as playing the moves', () => {
    const game = newGame('duo');
    const moves: number[] = [];
    for (let i = 0; i < 6; i++) {
      const move = legalMoves(game)[i];
      applyMove(game, move);
      moves.push(move);
    }
    expect(Array.from(replay('duo', moves).game.board)).toEqual(Array.from(game.board));
    expect(replay('duo', moves).game.toMove).toBe(game.toMove);
  });

  it('passes a colour for good', () => {
    const { game } = replay('classic', [PASS]);
    expect(game.out[0]).toBe(1);
    expect(game.toMove).toBe(1);
  });

  it('keeps each colour its latest piece through passes', () => {
    const start = newGame('classic');
    const first = legalMoves(start)[0];
    const other = newGame('classic');
    applyMove(other, first);
    const second = legalMoves(other)[0];
    const { latest } = replay('classic', [first, second, PASS]);
    expect(latest).toEqual([first, second, -1, -1]);
    expect(latest.filter((move) => move >= 0).map(moveCells)).toHaveLength(2);
  });

  it('starts empty, with one latest slot per colour', () => {
    expect(replay('duo', []).latest).toEqual([-1, -1]);
    expect(replay('classic', []).latest).toEqual([-1, -1, -1, -1]);
  });

  it('stops at the end of the game rather than running a stray pass', () => {
    const { game } = replay('duo', [PASS, PASS, PASS]);
    expect(game.over).toBe(true);
  });
});

describe('seats', () => {
  const wire = {
    shared: 3,
    seats: [
      { id: 'a', name: 'Ann', colors: [0] },
      { id: 'b', name: 'Ben', colors: [1] },
      { id: 'c', name: 'Cal', colors: [2], left: true },
    ],
  };

  it('turns the wire into a Seating of humans with ids and names', () => {
    expect(toSeating('classic', wire)).toEqual({
      mode: 'classic',
      shared: 3,
      seats: [
        { colors: [0], controller: { kind: 'human', id: 'a', name: 'Ann' } },
        { colors: [1], controller: { kind: 'human', id: 'b', name: 'Ben' } },
        { colors: [2], controller: { kind: 'human', id: 'c', name: 'Cal' } },
      ],
    });
  });

  it('leaves an open seat without an id', () => {
    const seating = toSeating('classic', { shared: null, seats: [{ id: 'a', name: 'Ann', colors: [0, 2] }, { id: '', name: '', colors: [1, 3] }] });
    expect(seating.seats[1].controller).toEqual({ kind: 'human' });
  });

  it('lists who left', () => {
    expect(leftSeatsOf(wire)).toEqual([2]);
  });

  it('is seatFor for a colour with an owner', () => {
    const seating = defaultSeating('classic', 4);
    const game = newGame('classic');
    expect(seatToPlay(seating, game, [])).toBe(0);
    passTurn(game);
    expect(seatToPlay(seating, game, [])).toBe(1);
  });

  it('is seatFor for the shared colour while everyone is here', () => {
    const seating = defaultSeating('classic', 3);
    const game = newGame('classic');
    [PASS, PASS, PASS].forEach(() => passTurn(game));
    expect(game.toMove).toBe(3);
    expect(seatToPlay(seating, game, [])).toBe(seatFor(seating, game));
  });

  it('takes the shared colour round only those still here', () => {
    const seating = defaultSeating('classic', 3);
    const game = newGame('classic');
    [0, 1, 2].forEach(() => passTurn(game));
    const sharedPieces = legalMoves(game);
    const expected = [0, 2, 0];
    expected.forEach((seat, index) => {
      expect(game.toMove).toBe(3);
      expect(seatToPlay(seating, game, [1])).toBe(seat);
      const move = index === 0 ? sharedPieces[0] : legalMoves(game)[0];
      applyMove(game, move);
    });
  });
});

describe('invites', () => {
  it('round-trips a code and key', () => {
    const url = inviteUrl('https://meetyudai.com', 'AB12CD', 'k3y');
    expect(url).toBe('https://meetyudai.com/games/blokus?room=AB12CD&key=k3y');
    expect(parseInvite(new URL(url).search)).toEqual({ roomId: 'AB12CD', key: 'k3y' });
  });

  it('survives a key that needs escaping', () => {
    const url = inviteUrl('https://x.test', 'AB12CD', 'a b&c');
    expect(parseInvite(new URL(url).search)?.key).toBe('a b&c');
  });

  it('upper-cases a typed code, and takes a code with no key', () => {
    expect(parseInvite('?room=ab12cd')).toEqual({ roomId: 'AB12CD', key: '' });
  });

  it('finds nothing in an ordinary address', () => {
    expect(parseInvite('')).toBeNull();
    expect(parseInvite('?utm_source=x')).toBeNull();
    expect(parseInvite('?room=')).toBeNull();
  });

  it('makes keys that differ and survive a URL unescaped', () => {
    const key = randomKey();
    expect(key).toMatch(/^[a-z2-9]{10}$/);
    expect(randomKey()).not.toBe(key);
  });
});

describe('error words', () => {
  it.each(['en', 'ja'] as const)('has words for what the server can refuse (%s)', (language) => {
    const t = getBlokusOnlineStrings(language);
    for (const code of ['stale-turn', 'not-your-turn', 'illegal-move', 'too-early', 'not-host', 'Room not found', 'Incorrect password']) {
      expect(errorText(t, code)).not.toBe(t.errorFallback);
    }
  });

  it('falls back for anything else, rather than showing a raw message', () => {
    const t = getBlokusOnlineStrings('ja');
    expect(errorText(t, 'HTTP 500')).toBe(t.errorFallback);
  });
});

it('encodes moves the same way the server reads them', () => {
  expect(encodeMove(1, 2, 3)).toBe(1 * 400 + 2 * 20 + 3);
});
