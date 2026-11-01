/**
 * Who plays which colour. The engine only knows colours taking turns; a seat is
 * a player, at this table or online, with one or more of them.
 *
 * The official ways to play the four-colour board:
 * - four players: one colour each;
 * - three players: one colour each, and the fourth is shared: they take turns
 *   playing it, and it scores for nobody;
 * - two players: two colours each, on opposite corners, added together.
 * Duo is always two players with one colour each.
 *
 * Everything here is pure and derived from the game state, so a shared colour's
 * turn needs no counter of its own and an online game replays to the same seats.
 */

import type { Difficulty } from '../common/types';
import type { View } from './ai';
import { FULL_HAND, PIECES, RULES, scoreOf, type GameState, type Mode } from './engine';

export type Controller =
  /** `id` is the room's player id online; at one table it is unset. */
  | { kind: 'human'; id?: string; name?: string }
  | { kind: 'ai'; level: Difficulty };

export interface Seat {
  colors: number[];
  controller: Controller;
}

export interface Seating {
  mode: Mode;
  seats: Seat[];
  /** The colour the seats take turns with, in a three-player game. */
  shared: number | null;
}

/** `ownerOf`'s answer for the shared colour. */
export const SHARED = -1;

/** The colours on opposite corners, which a two-player game plays as one side. */
const PARTNERS: readonly (readonly [number, number])[] = [
  [0, 2],
  [1, 3],
];

export const seatCounts = (mode: Mode): number[] => (mode === 'duo' ? [2] : [2, 3, 4]);

/** A legal seating for `count` players, in colour order. Controllers default to humans. */
export const defaultSeating = (mode: Mode, count: number, controllers: readonly Controller[] = []): Seating => {
  if (!seatCounts(mode).includes(count)) throw new Error(`${mode} cannot seat ${count}`);
  const controllerAt = (seat: number): Controller => controllers[seat] ?? { kind: 'human' };
  if (mode === 'classic' && count === 2) {
    return { mode, seats: PARTNERS.map((colors, seat) => ({ colors: [...colors], controller: controllerAt(seat) })), shared: null };
  }
  return {
    mode,
    seats: Array.from({ length: count }, (_, seat) => ({ colors: [seat], controller: controllerAt(seat) })),
    shared: count === 3 ? 3 : null,
  };
};

/**
 * Give `seat` a colour, swapping with whoever holds it. In a two-player game the
 * opposite corner comes with it, so the sides stay partners.
 */
export const chooseColor = (seating: Seating, seat: number, color: number): Seating => {
  const seats = seating.seats.map((entry) => ({ ...entry, colors: [...entry.colors] }));
  const mine = seats[seat];
  if (mine.colors.includes(color)) return seating;

  if (seating.mode === 'classic' && seats.length === 2) {
    const other = seats[1 - seat];
    [mine.colors, other.colors] = [other.colors, mine.colors];
    return { ...seating, seats };
  }

  const given = mine.colors[0];
  if (seating.shared === color) return { ...seating, seats: seats.map((entry, index) => (index === seat ? { ...entry, colors: [color] } : entry)), shared: given };
  const holder = seats.find((entry) => entry.colors.includes(color))!;
  holder.colors = [given];
  mine.colors = [color];
  return { ...seating, seats };
};

/** The seat holding a colour, or `SHARED`. */
export const ownerOf = (seating: Seating, color: number): number => {
  if (color === seating.shared) return SHARED;
  return seating.seats.findIndex((seat) => seat.colors.includes(color));
};

const piecesPlayed = (state: GameState, color: number): number => {
  const played = FULL_HAND & ~state.hands[color];
  return PIECES.reduce((count, piece) => count + ((played >> piece.index) & 1), 0);
};

/** The seat that plays `color` now. The shared colour goes round the seats, one piece each. */
export const seatFor = (seating: Seating, state: GameState, color: number = state.toMove): number => {
  const owner = ownerOf(seating, color);
  return owner === SHARED ? piecesPlayed(state, color) % seating.seats.length : owner;
};

/**
 * The colour a player at this screen plays next, `controls` saying which seats
 * those are: the colour to move when it is theirs, or else the next that will be.
 * The tray shows it, so a player can plan while someone else moves.
 */
export const nextColorFor = (seating: Seating, state: GameState, controls: (seat: number) => boolean): number => {
  const { colors } = state.rules;
  for (let step = 0; step < colors; step++) {
    const color = (state.toMove + step) % colors;
    if (!state.out[color] && state.hands[color] !== 0 && controls(seatFor(seating, state, color))) return color;
  }
  const seat = seating.seats.findIndex((_, index) => controls(index));
  return seating.seats[Math.max(seat, 0)].colors[0];
};

/** Nothing is left for these seats to play, their own colours or their turns with the shared one. */
export const seatsAreOut = (seating: Seating, state: GameState, controls: (seat: number) => boolean): boolean => {
  const finished = (color: number) => state.out[color] === 1 || state.hands[color] === 0;
  const own = seating.seats.every((seat, index) => !controls(index) || seat.colors.every(finished));
  return own && (seating.shared === null || finished(seating.shared));
};

/** What a seat plays for. The shared colour is on neither side of it: it scores for nobody. */
export const sideOf = (seating: Seating, seat: number): View => ({
  own: seating.seats[seat].colors,
  rivals: seating.seats.flatMap((entry, index) => (index === seat ? [] : entry.colors)),
});

/**
 * What each colour plays for in an AI's playouts. The shared colour has no owner
 * in a line that has not happened, so there it simply makes the most of itself.
 */
export const viewsOf = (seating: Seating): View[] =>
  Array.from({ length: RULES[seating.mode].colors }, (_, color) => {
    const owner = ownerOf(seating, color);
    if (owner !== SHARED) return sideOf(seating, owner);
    return { own: [color], rivals: seating.seats.flatMap((seat) => seat.colors) };
  });

/** Each seat's score: its colours added together. */
export const seatScores = (seating: Seating, state: GameState): number[] =>
  seating.seats.map((seat) => seat.colors.reduce((total, color) => total + scoreOf(state, color), 0));

/** The seats on the top score. */
export const seatWinners = (seating: Seating, state: GameState): number[] => {
  const all = seatScores(seating, state);
  const best = Math.max(...all);
  return all.flatMap((score, seat) => (score === best ? [seat] : []));
};

/** Every colour held once, by a seat or as the shared colour, and the count fits the board. */
export const isValidSeating = (seating: Seating): boolean => {
  const held = [...seating.seats.flatMap((seat) => seat.colors), ...(seating.shared === null ? [] : [seating.shared])];
  const colors = RULES[seating.mode].colors;
  return (
    seatCounts(seating.mode).includes(seating.seats.length) &&
    held.length === colors &&
    new Set(held).size === colors &&
    held.every((color) => color >= 0 && color < colors)
  );
};
