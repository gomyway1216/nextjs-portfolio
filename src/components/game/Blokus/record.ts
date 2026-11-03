/**
 * Game records: every finished game's moves, kept on this device so it can be
 * replayed and reviewed afterwards, and written out as text to send on.
 *
 * A move is the engine's number for it, so a record only means anything to the
 * engine that wrote it: `v` goes up if the encoding ever changes, and a record
 * whose moves stop being legal is cut short where they do.
 */

import type { MoveReview } from './ai';
import { PASS, PIECES, RULES, applyMove, cloneState, legalMoves, moveCells, movePiece, newGame, passTurn, type GameState, type Mode } from './engine';
import { SHARED, isValidSeating, ownerOf, seatScores, type Seating } from './seating';

export const RECORD_VERSION = 1;
export const RECORDS_KEY = 'blokus-records-v1';
/** Kept on the device, newest first. */
export const MAX_RECORDS = 30;

export type StoredReview = Pick<MoveReview, 'best' | 'bestMargin' | 'playedMargin'>;

export interface GameRecord {
  v: typeof RECORD_VERSION;
  id: string;
  /** When the game ended, in ms since 1970. */
  playedAt: number;
  online: boolean;
  seating: Seating;
  /** The seat that is "you" here, or null when several people shared this device. */
  me: number | null;
  /** In order, a pass as {@link PASS}. */
  moves: number[];
  /** By move, once reviewed: null for a move nobody asked about (an AI's, a pass, the shared colour's). */
  review?: (StoredReview | null)[];
}

const isMode = (value: unknown): value is Mode => typeof value === 'string' && value in RULES;

const isRecord = (value: unknown): value is GameRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<GameRecord>;
  return (
    record.v === RECORD_VERSION &&
    typeof record.id === 'string' &&
    typeof record.playedAt === 'number' &&
    !!record.seating &&
    isMode(record.seating.mode) &&
    isValidSeating(record.seating) &&
    (record.me === null || (Number.isInteger(record.me) && record.me! >= 0 && record.me! < record.seating.seats.length)) &&
    Array.isArray(record.moves) &&
    record.moves.every((move) => Number.isSafeInteger(move))
  );
};

/** The position before each move and after the last: one more than there are moves, fewer if a move is not legal. */
export const positions = (record: Pick<GameRecord, 'seating' | 'moves'>): GameState[] => {
  const game = newGame(record.seating.mode);
  const states = [cloneState(game)];
  for (const move of record.moves) {
    if (game.over) break;
    // Online a colour also passes with moves left, when its turn ran out or its player left.
    if (move === PASS) {
      passTurn(game);
    } else {
      if (!legalMoves(game).includes(move)) break;
      applyMove(game, move);
    }
    states.push(cloneState(game));
  }
  return states;
};

/** The seats a review looks at: yours, or every person's when several shared the device. */
export const reviewedSeats = (record: Pick<GameRecord, 'seating' | 'me'>): number[] =>
  record.me !== null
    ? [record.me]
    : record.seating.seats.flatMap((seat, index) => (seat.controller.kind === 'human' ? [index] : []));

/** The seat whose move this was, for review, or -1 when it is not one a review looks at. */
export const reviewedSeatOf = (record: Pick<GameRecord, 'seating' | 'me'>, before: GameState, move: number): number => {
  if (move === PASS) return -1;
  const owner = ownerOf(record.seating, before.toMove);
  return owner !== SHARED && reviewedSeats(record).includes(owner) ? owner : -1;
};

export type Verdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * Points given away, as a word. Below 1.5 is inside what two reviews of the same move can disagree by (at 160 games a
 * candidate, nine in ten moves are within 1.4 points of each other), so nothing under it is called a slip.
 */
export const verdictOf = (review: StoredReview, played: number): Verdict => {
  const lost = review.bestMargin - review.playedMargin;
  if (review.best === played || lost < 0.5) return 'best';
  if (lost < 1.5) return 'good';
  if (lost < 4) return 'inaccuracy';
  if (lost < 8) return 'mistake';
  return 'blunder';
};

const readAll = (): unknown[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECORDS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** What is kept on this device, newest first. Empty where storage is off. */
export const loadRecords = (): GameRecord[] => readAll().filter(isRecord);

const writeAll = (records: readonly GameRecord[]): boolean => {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
};

/** Keep a record, or replace the one with its id. The oldest go once there are too many. */
export const saveRecord = (record: GameRecord): boolean => {
  const others = loadRecords().filter(({ id }) => id !== record.id);
  return writeAll([record, ...others].sort((a, b) => b.playedAt - a.playedAt).slice(0, MAX_RECORDS));
};

export const deleteRecord = (id: string): boolean => writeAll(loadRecords().filter((record) => record.id !== id));

export const newRecordId = (playedAt: number): string => `${playedAt.toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`;

/** A cell as a board label: columns A, B, … from the left, rows 1, 2, … from the top. */
export const cellLabel = (row: number, col: number): string => `${String.fromCharCode(65 + col)}${row + 1}`;

/** A move as text: its piece, and the cells it covers in brackets (a piece's name looks like a cell: I3, F5). */
export const moveText = (move: number): string =>
  move === PASS
    ? 'pass'
    : `${PIECES[movePiece(move)].name} (${moveCells(move)
        .map(([row, col]) => cellLabel(row, col))
        .join(' ')})`;

export interface TextNames {
  colors: readonly string[];
  seat: (seat: number) => string;
}

/**
 * The record as plain text: a line a move, the review where there is one, and the record itself at the end so the
 * game can be rebuilt exactly.
 */
export const recordText = (record: GameRecord, names: TextNames): string => {
  const states = positions(record);
  const final = states[states.length - 1];
  const { seating } = record;
  const lines = [
    `Blokus ${seating.mode}, ${seating.seats.length} players, ${new Date(record.playedAt).toISOString()}${record.online ? ', online' : ''}`,
    ...seating.seats.map((seat, index) => `Seat ${index + 1}: ${names.seat(index)} (${seat.colors.map((color) => names.colors[color]).join(', ')})`),
    ...(seating.shared !== null ? [`Shared: ${names.colors[seating.shared]}`] : []),
    `Final: ${seatScores(seating, final)
      .map((score, seat) => `${names.seat(seat)} ${score}`)
      .join(', ')}`,
    '',
  ];
  record.moves.slice(0, states.length - 1).forEach((move, index) => {
    const review = record.review?.[index];
    const note = review
      ? `  [${verdictOf(review, move)}, ${(review.bestMargin - review.playedMargin).toFixed(1)} pts${review.best !== move ? `, best ${moveText(review.best)}` : ''}]`
      : '';
    lines.push(`${index + 1}. ${names.colors[states[index].toMove]}: ${moveText(move)}${note}`);
  });
  lines.push('', JSON.stringify({ v: record.v, seating: record.seating, me: record.me, moves: record.moves }));
  return lines.join('\n');
};
