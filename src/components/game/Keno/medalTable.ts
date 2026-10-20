/**
 * Video Keno on the medal center's floor: a game is played with the medals
 * every machine of the medal center shares (`MedalCenter/bank.ts`).
 *
 * ## A game, once
 *
 * DRAW draws the game's twenty balls (engine.ts), writes the game down and
 * takes the bet, in that order: the game is on record before its medals are
 * gone. What it pays is known from that moment (the balls are drawn), and it
 * goes into the medals once, whichever comes first:
 *
 * - the last ball has come out on this page (or Skip has shown them all);
 * - the page gives up the card (it is hidden, left or reloaded, or another
 *   tab needs the medals): the game is settled then, before the card goes;
 * - the page was killed before it could do either: the next page that holds
 *   the card for the same player finds the game on record, unpaid, shows the
 *   same twenty balls again and pays it.
 *
 * So a game is never refunded and never drawn again: its balls were drawn as
 * the medals went in, and a reload shows the same ones. A game on record is
 * paid exactly once, and only by the page that holds the card.
 *
 * ## Receipts
 *
 * The record and the medals are two writes, and a browser can die between any
 * two writes. So the bet and the win each go into the medals under a receipt
 * (`bank.apply`; "A machine's rounds" in bank.ts), and whichever page next
 * holds the card squares the record with them:
 *
 * - a game on record whose bet never went in never happened: it is thrown
 *   away, its balls never shown;
 * - a game marked paid whose win never went in (its bet did) is paid now,
 *   once.
 *
 * A game's receipts are let go of when the next game's bet goes in. A game that
 * pays nothing moves no medals at its end; the medal center is told that its
 * medals are out no more (`bank.settle`).
 *
 * When this browser's storage can be read but will not keep the game, no game
 * is played (`unsaved`). Storage that cannot be used at all keeps nothing,
 * and the game is played from this page's memory, as the medals then are.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { isBet, isDraw, isSpots, labelOf, sortSpots, winOf, type Bet } from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const KENO_GAME = 'keno';
/** Where a guest's game is kept on this device. An account's is under its own name (`gameKey`). */
export const GAME_KEY = 'keno-game-v1';
export const gameKey = (owner: string | null): string => (owner === null ? GAME_KEY : `${GAME_KEY}:${owner}`);

/** The names of a game's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

/** A game as it is written down: the ticket, the bet, the balls drawn, and whether it has been settled. */
export interface GameRecord {
  v: 1;
  id: string;
  /** Whose medals: an account's id, or null for a guest's. It says where the game is kept (`gameKey`). */
  owner: string | null;
  /** The ledger the bet was played from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was played: a reset since voids it. */
  era: number;
  /** The ticket's spots, in order. */
  spots: number[];
  bet: Bet;
  /** The twenty balls, in the order they come out. */
  balls: number[];
  /** What it pays, the bet included (0 for nothing): worked out from the rest, and checked when read back. */
  won: number;
  /** Whether it has been settled: shown to its end, and what it pays put in (or there was nothing). */
  paid: boolean;
}

/** A game as the page that holds it knows it. */
export interface Staked {
  record: GameRecord;
  /** Whether it is written down on this device. A game that could not be is settled from what the page knows. */
  stored: boolean;
  /** Whether it has been settled: paid, or found paid by another page. */
  paid: boolean;
  /** Whether a reset came between its bet and its end, or its bet never went in: it pays nothing. */
  void: boolean;
}

/** How a game ended when it was settled. */
export type Settled = 'paid' | 'already' | 'void' | 'later';

export type StakeOutcome =
  | { kind: 'staked'; staked: Staked }
  /** Not that many medals, or a ticket, a bet or a draw the machine does not take. */
  | { kind: 'short' }
  /** A game of these medals is still to be finished: it is finished first. */
  | { kind: 'unfinished' }
  /** Storage can be read but will not keep the game: nothing is taken. */
  | { kind: 'unsaved' }
  /** The medals are in another tab's machine, or are still being read. */
  | { kind: 'away' };

// ── Reading a game back ─────────────────────────────────────────────────────

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A game's name, as the bank takes a round's: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;

/**
 * A game as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is
 * trusted: a ticket of 1 to 10 different numbers in order, a bet the machine takes, twenty different balls, and what it
 * won worked out again from them.
 */
export function parseGame(text: unknown): GameRecord | null {
  if (typeof text !== 'string' || text.length > 2_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordLike(data) || data.v !== 1 || typeof data.id !== 'string' || !ID_SHAPE.test(data.id)) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (!isSpots(data.spots) || !isBet(data.bet) || !isDraw(data.balls) || typeof data.paid !== 'boolean') return null;
  const spots = [...data.spots];
  const balls = [...data.balls];
  if (data.won !== winOf(spots, balls, data.bet)) return null;
  return { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, spots, bet: data.bet, balls, won: data.won as number, paid: data.paid };
}

export const serializeGame = (record: GameRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  /** A move of a game's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every game but those in `keep` has no medals out any more: no refill is given while one does. */
  settle(game: string, keep?: readonly string[]): boolean;
}

/** This device's storage. Every call may throw: storage can be blocked, full or switched off. */
export interface TableStorage {
  read(key: string): string | null;
  write(key: string, text: string): void;
  remove(key: string): void;
}

export interface TableOptions {
  bank: TableBank;
  storage: TableStorage;
  /** Whether this page holds the card, so that it may take and give medals. */
  holding: () => boolean;
  /** A name for a game that no other game has. */
  newId: () => string;
}

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /** The game, where storage cannot be used at all (or would not keep it): this page's memory alone keeps it. */
  let memory: GameRecord | null = null;
  /** The games settled on this page, whether or not storage took the record saying so. */
  const settledHere = new Set<string>();
  /**
   * The game this table is staking at this moment: from its record being written until its bet is in and the games
   * before it are let go of. The bank tells everything that listens to it of each of those moves as it makes it, inside
   * `stake`: a page that looks for a game left unfinished then is looking at its own press, not at a game left
   * unfinished (`leftover`).
   */
  let staking: string | null = null;

  /** The medals on the table: which ledger, in which era. */
  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };
  const belongs = (record: GameRecord): boolean => {
    const medals = onTable();
    return medals !== null && record.ledger === medals.device && record.era === medals.era;
  };

  /** Storage's text at `key`; undefined when storage cannot be read at all. */
  const read = (key: string): string | null | undefined => {
    try {
      return storage.read(key);
    } catch {
      return undefined;
    }
  };
  const write = (key: string, text: string): boolean => {
    try {
      storage.write(key, text);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (key: string): boolean => {
    try {
      storage.remove(key);
      return true;
    } catch {
      return false;
    }
  };

  /** A move of a game's medals, under its receipt. */
  const move = (record: GameRecord, step: string, medals: number) => bank.apply({ game: KENO_GAME, round: record.id, step, medals, era: record.era });
  const moved = (record: GameRecord, step: string): boolean => bank.applied({ game: KENO_GAME, round: record.id, step });

  /** A game's win, in under its receipt; the medal floor hears of it once, as it goes in, every spot caught by name. */
  const payWin = (record: GameRecord): void => {
    if (record.won <= 0 || move(record, PAY_STEP, record.won) !== 'applied') return;
    const label = labelOf(record.spots, record.balls);
    floorReport(KENO_GAME, { won: record.won, prize: label ? { medals: record.won, label } : { medals: record.won } });
  };

  /** Whether a game is still to be finished: its bet went in (or may have), and it has not been settled. */
  const unfinished = (record: GameRecord | null): record is GameRecord => record !== null && !record.paid && !settledHere.has(record.id);

  /**
   * The game of the medals on the table, wherever it is kept, and the key it is kept under (null for this page's
   * memory): under the player's name, or, for an account whose medals were this device's guest's until the first
   * sign-in moved them in, under the guest's, from where the page that holds the card moves it to the account's place.
   * A game of these medals from before a reset, and text that is not a game, are thrown away by that page. Games of
   * other medals are left as they are. Undefined: storage cannot be read, and memory holds no game of these medals.
   */
  const find = (): { record: GameRecord; key: string | null } | null | undefined => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const mine = holding();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const key = gameKey(place);
      const text = read(key);
      if (text === undefined) return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : undefined;
      if (text === null) continue;
      const found = parseGame(text);
      if (!found) {
        // Text that is not a game this machine can read: not a game, and not one to keep.
        if (mine && place === owner) remove(key);
        continue;
      }
      if (found.ledger !== medals.device) continue;
      if (found.era !== medals.era) {
        // From these medals before a reset: it went with them.
        if (mine) remove(key);
        continue;
      }
      if (place === owner) return { record: found, key };
      if (!mine) return { record: { ...found, owner }, key };
      const adopted: GameRecord = { ...found, owner };
      if (!write(gameKey(owner), serializeGame(adopted))) return { record: found, key };
      remove(key);
      return { record: adopted, key: gameKey(owner) };
    }
    return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : null;
  };

  /**
   * Squares a game found with its receipts, by the page that holds the card: a game whose bet never went in never
   * happened, and is thrown away; a game marked paid whose win never went in, though its bet did, is paid now.
   * Returns the game as it stands, or null for none.
   */
  const square = (found: { record: GameRecord; key: string | null }): GameRecord | null => {
    const { record, key } = found;
    if (settledHere.has(record.id) || record.id === staking) return record;
    const staked = moved(record, STAKE_STEP);
    if (!record.paid) {
      if (staked) return record;
      if (key === null) memory = null;
      else remove(key);
      return null;
    }
    if (staked && !moved(record, PAY_STEP) && record.won > 0) payWin(record);
    return record;
  };

  /** The game of the medals on the table as it stands, squared with its receipts when this page holds the card. */
  const look = (): GameRecord | null | undefined => {
    const found = find();
    if (!found) return found;
    return holding() ? square(found) : found.record;
  };

  return {
    /**
     * DRAW: the game of `spots` on `bet`, its `balls` drawn in the press, is written down, and the bet taken. Nothing is
     * taken when it cannot be: the card is not here, the medals do not cover the bet, the ticket, the bet or the draw is
     * not one the machine takes, a game of these medals is still to be finished, or storage will not keep the game.
     */
    stake(spots: readonly number[], bet: number, balls: readonly number[]): StakeOutcome {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null) return { kind: 'away' };
      const ticket = sortSpots(spots);
      if (!isSpots(ticket) || ticket.length !== spots.length || !isBet(bet) || !isDraw(balls) || bank.balance() < bet) return { kind: 'short' };
      const found = find();
      const now = found ? square(found) : null;
      if (unfinished(now)) return { kind: 'unfinished' };
      const owner = bank.owner();
      const drawn = [...balls];
      const record: GameRecord = { v: 1, id: newId(), owner, ledger: medals.device, era: medals.era, spots: ticket, bet, balls: drawn, won: winOf(ticket, drawn, bet), paid: false };
      const key = gameKey(owner);
      const before = memory;
      staking = record.id;
      try {
        const stored = write(key, serializeGame(record));
        if (stored) memory = null;
        else if (read(key) !== undefined) return { kind: 'unsaved' };
        else memory = record;
        // The bet goes in under its receipt after the game is written down: a browser that dies between the two leaves
        // a game whose bet the medals do not hold, which never happened (`square`).
        if (move(record, STAKE_STEP, -bet) !== 'applied') {
          if (stored) {
            if (now) write(key, serializeGame(now));
            else remove(key);
          }
          memory = before;
          return { kind: 'short' };
        }
        // The medals played feed the floor jackpot, once, as they go in.
        floorReport(KENO_GAME, { played: bet });
        // The game before this one is no longer on record: nothing will look at its receipts again.
        bank.forget(KENO_GAME, [record.id]);
        return { kind: 'staked', staked: { record, stored, paid: false, void: false } };
      } finally {
        staking = null;
      }
    },

    /**
     * Puts a game's win into the medals, once. `later`: not now (the card is not here, or the medals on the table are
     * not the ones it was played from), and the game stays on record to be finished. `already`: another page settled
     * it. `void`: the medals were reset since it was played, or its bet never went in.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = gameKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseGame(there)?.id === record.id) remove(key);
        if (memory?.id === record.id) memory = null;
        return 'void';
      }
      if (!holding()) return 'later';
      if (staked.stored) {
        const there = read(key);
        if (there !== undefined) {
          const found = there === null ? null : parseGame(there);
          // Not on record any more, or another game in its place: another page has settled it, or a reset cleared it.
          if (!found || found.id !== record.id || found.paid) {
            staked.paid = true;
            return 'already';
          }
        }
      }
      if (!moved(record, STAKE_STEP)) {
        // Its bet never went in: it never happened.
        staked.void = true;
        staked.paid = true;
        if (staked.stored) remove(key);
        if (memory?.id === record.id) memory = null;
        return 'void';
      }
      // Marked paid first, so that nothing that hears of the medals moving finds the game still to finish; then its win
      // goes in under its receipt. A page that dies between the two leaves a game marked paid whose win the next page
      // that holds the card puts in, once (`square`).
      const paid: GameRecord = { ...record, paid: true };
      if (staked.stored) write(key, serializeGame(paid));
      if (memory?.id === record.id) memory = paid;
      settledHere.add(record.id);
      staked.record = paid;
      staked.paid = true;
      payWin(paid);
      // The last ball is out: none of the game's medals are out any more, a game that paid nothing included.
      bank.settle(KENO_GAME);
      return 'paid';
    },

    /**
     * A game this device left unfinished with the medals on the table, which the page that holds the card now is to
     * finish: null when there is none.
     */
    leftover(): GameRecord | null {
      // While DRAW stakes, the game on record is that press's own: nothing is left unfinished, and nothing is settled.
      if (!holding() || !bank.getState().loaded || staking !== null) return null;
      const now = look();
      const left = unfinished(now ?? null) ? now! : null;
      // Only a game still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(KENO_GAME, left ? [left.id] : []);
      return left;
    },

    /** The last game of the medals on the table, settled, to show: null for none. */
    last(): GameRecord | null {
      const now = look() ?? null;
      return now && (now.paid || settledHere.has(now.id)) ? now : null;
    },

    /** Forgets the game kept for the player on the table: the medals have been reset. */
    clear(): void {
      remove(gameKey(bank.owner()));
      memory = null;
      settledHere.clear();
    },
  };
}

/**
 * A name for a game: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the draw's alone.
 */
export const gameId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;

// ── The ticket kept between visits ──────────────────────────────────────────

/** Where this device keeps the spots marked and the bet chosen, so that they are still marked after a reload. */
export const TICKET_KEY = 'keno-ticket-v1';

/** The spots marked (none, or a ticket) and the bet chosen, as kept. */
export interface KeptTicket {
  spots: number[];
  bet: Bet;
}

/** The ticket kept, read back; null for none, or for text that is not one. */
export function parseTicket(text: unknown): KeptTicket | null {
  if (typeof text !== 'string' || text.length > 500) return null;
  try {
    const data = JSON.parse(text) as unknown;
    if (!isRecordLike(data) || !isBet(data.bet) || !Array.isArray(data.spots)) return null;
    if (data.spots.length > 0 && !isSpots(data.spots)) return null;
    return { spots: [...(data.spots as number[])], bet: data.bet };
  } catch {
    return null;
  }
}
