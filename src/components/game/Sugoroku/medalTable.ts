/**
 * Whale Isle Sugoroku on the medal center's floor: a roll is played with the
 * medals every machine of the medal center shares (`MedalCenter/bank.ts`),
 * and the board is kept as the player left it.
 *
 * ## The board, kept
 *
 * One record a player keeps the board on this device (`boardKey`): the square
 * the boat stood on before the last roll (`at`), and that roll (its bet, how
 * it was drawn, what it won, and whether that went in). Where the boat stands
 * now is worked out from them (`standingOf`): a reload, or another tab, finds
 * the boat on the same square, as a real cabinet keeps its board. The board
 * belongs to the medals: a reset at the medal center starts it over at START.
 *
 * ## A roll, once
 *
 * ROLL draws the roll (engine.ts), writes it down with the board and takes
 * the bet, in that order: the roll is on record before its medals are gone.
 * What it wins is known from that moment, and it goes into the medals once,
 * whichever comes first:
 *
 * - the boat stops on this page (or the player skips to the end);
 * - the page gives up the card (it is hidden, left or reloaded, or another
 *   tab needs the medals): the roll is settled then, before the card goes;
 * - the page was killed before it could do either: the next page that holds
 *   the card for the same player finds the roll on record, unfinished, and
 *   finishes it. The boat sails the same squares again, the same chance plays
 *   out, and it is paid once.
 *
 * So a roll is never taken back: where the boat stops was drawn when the bet
 * went in, and a reload is no way out of a square that pays nothing.
 *
 * ## Receipts
 *
 * The record and the medals are two writes, and a browser can die between any
 * two writes. So the bet and the pay each go into the medals under a receipt
 * (`bank.apply`; "A machine's rounds" in bank.ts), and whichever page next
 * holds the card squares the record with them:
 *
 * - a roll on record whose bet never went in never happened: the board goes
 *   back to the square it was rolled from;
 * - a roll marked paid whose pay never went in (its bet did) is paid now,
 *   once.
 *
 * A roll's receipts are let go of when the next roll's bet goes in. A roll
 * that wins nothing moves no medals at its end; the medal center is told that
 * its medals are out no more (`bank.settle`).
 *
 * When this browser's storage can be read but will not keep the roll, no roll
 * is played (`unsaved`). Storage that cannot be used at all keeps nothing,
 * and the board is played from this page's memory, as the medals then are.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { BOARD, START, copyDraw, isArrow, isBet, isDraw, isSquare, labelOf, playOf, wonFor, type Bet, type Draw, type Play } from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const SUGOROKU_GAME = 'sugoroku';
/** Where a guest's board is kept on this device. An account's is under its own name (`boardKey`). */
export const BOARD_KEY = 'sugoroku-board-v1';
export const boardKey = (owner: string | null): string => (owner === null ? BOARD_KEY : `${BOARD_KEY}:${owner}`);

/** The names of a roll's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

/** A roll on record. */
export interface RollRecord {
  id: string;
  bet: Bet;
  draw: Draw;
  /** The medals it wins, worked out from the board and the draw (0 when nothing). */
  won: number;
  /** Whether it has been settled: its winnings are in (or there were none). */
  paid: boolean;
}

/** The board as it is written down. */
export interface BoardRecord {
  v: 1;
  /** Whose medals: an account's id, or null for a guest's. It says where the board is kept (`boardKey`). */
  owner: string | null;
  /** The ledger the medals are in: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals: a reset since starts the board over. */
  era: number;
  /** The square the boat stood on before `roll`: where it stands when there is none. */
  at: number;
  /** The last roll, or null before the first (or after one whose bet never went in). */
  roll: RollRecord | null;
}

/** A roll as the page that holds it knows it. */
export interface Staked {
  record: BoardRecord & { roll: RollRecord };
  /** Whether it was written down on this device. A roll that could not be is paid from what the page knows. */
  stored: boolean;
  /** Whether it has been settled: paid, or found paid by another page. */
  paid: boolean;
  /** Whether a reset came between its bet and its end, or its bet never went in: it pays nothing. */
  void: boolean;
}

/** How a roll ended when it was settled. */
export type Settled = 'paid' | 'already' | 'void' | 'later';

export type StakeOutcome =
  | { kind: 'staked'; staked: Staked }
  /** Not that many medals, or a bet or a roll the machine does not take. */
  | { kind: 'short' }
  /** A roll of these medals is still to be finished: it is finished first. */
  | { kind: 'unfinished' }
  /** Storage can be read but will not keep the roll: nothing is bet. */
  | { kind: 'unsaved' }
  /** The medals are in another tab's machine, or are still being read. */
  | { kind: 'away' };

/** A roll on record, played out: where it went and what it did. */
export const playOfRecord = (record: BoardRecord & { roll: RollRecord }): Play => playOf(record.at, record.roll.draw);

/** Where the boat stands on a board as written down: where its last roll left it, or where it stood. */
export const standingOf = (record: BoardRecord | null): number => (!record ? START : record.roll ? playOf(record.at, record.roll.draw).to : record.at);

// ── Reading a board back ────────────────────────────────────────────────────

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A roll's name, as the bank takes a round's: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;
/** A square the boat can stand on before a roll: any but an arrow. */
const isStanding = (value: unknown): value is number => isSquare(value) && !isArrow(BOARD[value].kind);

/**
 * A board as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is
 * trusted: the boat on a square it can stand on, a roll the machine could have drawn, and what it won worked out
 * again from them.
 */
export function parseBoard(text: unknown): BoardRecord | null {
  if (typeof text !== 'string' || text.length > 2_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordLike(data) || data.v !== 1) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000) || !isStanding(data.at)) return null;
  if (data.roll === null) return { v: 1, owner, ledger: data.ledger, era: data.era, at: data.at, roll: null };
  const roll = data.roll;
  if (!isRecordLike(roll) || typeof roll.id !== 'string' || !ID_SHAPE.test(roll.id) || !isBet(roll.bet) || !isDraw(roll.draw) || typeof roll.paid !== 'boolean') return null;
  const draw = copyDraw(roll.draw);
  if (roll.won !== wonFor(roll.bet, playOf(data.at, draw))) return null;
  return { v: 1, owner, ledger: data.ledger, era: data.era, at: data.at, roll: { id: roll.id, bet: roll.bet, draw, won: roll.won, paid: roll.paid } };
}

export const serializeBoard = (record: BoardRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  restartDue(game: string): boolean;
  /** A move of a roll's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every roll but those in `keep` has no medals out any more: no refill is given while one does. */
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
  /** A name for a roll that no other roll has. */
  newId: () => string;
}

export type Table = ReturnType<typeof createTable>;

type WithRoll = BoardRecord & { roll: RollRecord };
const hasRoll = (record: BoardRecord | null): record is WithRoll => record !== null && record.roll !== null;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /** The board, where storage cannot be used at all: this page's memory alone keeps it. */
  let memory: BoardRecord | null = null;
  /** The rolls settled on this page, whether or not storage took the record saying so. */
  const settledHere = new Set<string>();

  /** The medals on the table: which ledger, in which era. */
  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };
  const belongs = (record: BoardRecord): boolean => {
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

  /** A move of a roll's medals, under its receipt. */
  const move = (record: WithRoll, step: string, medals: number) => bank.apply({ game: SUGOROKU_GAME, round: record.roll.id, step, medals, era: record.era });
  const moved = (record: WithRoll, step: string): boolean => bank.applied({ game: SUGOROKU_GAME, round: record.roll.id, step });

  /** A roll's winnings, in under their receipt; the medal floor hears of them once, as they go in, the jackpot and the whale ride by name. */
  const payWinnings = (record: WithRoll): void => {
    const { won } = record.roll;
    if (won <= 0 || move(record, PAY_STEP, won) !== 'applied') return;
    const label = labelOf(playOfRecord(record));
    floorReport(SUGOROKU_GAME, { won, prize: label ? { medals: won, label } : { medals: won } });
  };

  /** Whether a roll is still to be finished: its bet went in, and it has not been settled. */
  const unfinished = (record: BoardRecord | null): record is WithRoll => hasRoll(record) && !record.roll.paid && !settledHere.has(record.roll.id);

  /**
   * The board of the medals on the table, wherever it is kept, and the key it is kept under (null for this page's
   * memory): under the player's name, or, for an account whose medals were this device's guest's until the first
   * sign-in moved them in, under the guest's, from where the page that holds the card moves it to the account's place.
   * A board of these medals from before a reset, and text that is not a board, are thrown away by that page. Boards of
   * other medals are left as they are. Undefined: storage cannot be read, and memory holds no board of these medals.
   */
  const find = (): { record: BoardRecord; key: string | null } | null | undefined => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const mine = holding();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const key = boardKey(place);
      const text = read(key);
      if (text === undefined) return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : undefined;
      if (text === null) continue;
      const found = parseBoard(text);
      if (!found) {
        // Text that is not a board this machine can read: not a roll, and not one to keep.
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
      const adopted: BoardRecord = { ...found, owner };
      if (!write(boardKey(owner), serializeBoard(adopted))) return { record: found, key };
      remove(key);
      return { record: adopted, key: boardKey(owner) };
    }
    return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : null;
  };

  /** Writes the board where it was found: storage, or this page's memory. */
  const keep = (record: BoardRecord, key: string | null): void => {
    if (key === null) memory = record;
    else if (!write(key, serializeBoard(record))) remove(key);
  };

  /**
   * Squares a board found with its receipts, by the page that holds the card: a roll whose bet never went in never
   * happened, and the board goes back to where it was rolled from; a roll marked paid whose pay never went in, though
   * its bet did, is paid now. Returns the board as it stands.
   */
  const square = (found: { record: BoardRecord; key: string | null }): BoardRecord => {
    const { record, key } = found;
    if (!hasRoll(record) || settledHere.has(record.roll.id)) return record;
    const staked = moved(record, STAKE_STEP);
    if (!record.roll.paid) {
      if (staked) return record;
      const back: BoardRecord = { ...record, roll: null };
      keep(back, key);
      return back;
    }
    if (record.roll.won > 0 && staked && !moved(record, PAY_STEP)) payWinnings(record);
    return record;
  };

  /** The board of the medals on the table as it stands, squared with its receipts when this page holds the card. */
  const look = (): BoardRecord | null | undefined => {
    const found = find();
    if (!found) return found;
    return holding() ? square(found) : found.record;
  };

  return {
    /**
     * ROLL: `draw` (drawn in the press) is written down with the board, and the bet is taken. Nothing is taken when
     * it cannot be: the card is not here, the medals are not enough, the bet or the draw is not one the machine takes,
     * a roll of these medals is still to be finished, or storage will not keep the roll.
     */
    stake(bet: number, draw: Draw): StakeOutcome {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null) return { kind: 'away' };
      if (!isBet(bet) || !isDraw(draw) || bank.balance() < bet) return { kind: 'short' };
      const found = find();
      const now = found ? square(found) : null;
      if (unfinished(now)) return { kind: 'unfinished' };
      const at = standingOf(now);
      const owner = bank.owner();
      const drawn = copyDraw(draw);
      const record: WithRoll = { v: 1, owner, ledger: medals.device, era: medals.era, at, roll: { id: newId(), bet, draw: drawn, won: wonFor(bet, playOf(at, drawn)), paid: false } };
      const key = boardKey(owner);
      const before = memory;
      const stored = write(key, serializeBoard(record));
      if (stored) memory = null;
      else if (read(key) !== undefined) return { kind: 'unsaved' };
      else memory = record;
      // The bet goes in under its receipt after the roll is written down: a browser that dies between the two leaves a
      // roll whose bet the medals do not hold, which never happened (`square`).
      if (move(record, STAKE_STEP, -bet) !== 'applied') {
        if (stored) keep(now ?? { v: 1, owner, ledger: medals.device, era: medals.era, at, roll: null }, key);
        memory = before;
        return { kind: 'short' };
      }
      // The medals played feed the floor jackpot, once, as the bet goes in.
      floorReport(SUGOROKU_GAME, { played: bet });
      // The roll before this one is no longer on record: nothing will look at its receipts again.
      bank.forget(SUGOROKU_GAME, [record.roll.id]);
      return { kind: 'staked', staked: { record, stored, paid: false, void: false } };
    },

    /**
     * Puts a roll's winnings into the medals, once. `later`: not now (the card is not here, or the medals on the table
     * are not the ones it was bet from), and the roll stays on record to be finished. `already`: another page settled
     * it. `void`: the medals were reset since it was bet, or its bet never went in.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = boardKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseBoard(there)?.roll?.id === record.roll.id) remove(key);
        if (memory?.roll?.id === record.roll.id) memory = null;
        return 'void';
      }
      if (!holding()) return 'later';
      if (staked.stored) {
        const there = read(key);
        if (there !== undefined) {
          const found = there === null ? null : parseBoard(there);
          // Not on record any more, or another roll in its place: another page has settled it, or a reset cleared it.
          if (!found || found.roll?.id !== record.roll.id || found.roll.paid) {
            staked.paid = true;
            return 'already';
          }
        }
      }
      if (!moved(record, STAKE_STEP)) {
        // Its bet never went in: it never happened, and the board is where it was rolled from.
        staked.void = true;
        staked.paid = true;
        keep({ ...record, roll: null }, staked.stored ? key : null);
        return 'void';
      }
      // Marked paid first, so that nothing that hears of the medals moving finds the roll still to finish; then its
      // winnings go in under their receipt. A page that dies between the two leaves a roll marked paid whose winnings
      // the next page that holds the card puts in, once (`square`).
      const paid: WithRoll = { ...record, roll: { ...record.roll, paid: true } };
      if (staked.stored) write(key, serializeBoard(paid));
      if (memory?.roll?.id === record.roll.id) memory = paid;
      settledHere.add(record.roll.id);
      staked.paid = true;
      if (record.roll.won > 0) payWinnings(record);
      // The boat has stopped: none of the roll's medals are out any more, a roll that won nothing included.
      bank.settle(SUGOROKU_GAME);
      return 'paid';
    },

    /** A roll this device left unfinished with the medals on the table, which the page that holds the card now is to finish: null when there is none. */
    leftover(): WithRoll | null {
      if (!holding() || !bank.getState().loaded) return null;
      const now = look();
      const left = unfinished(now ?? null) ? (now as WithRoll) : null;
      // Only a roll still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(SUGOROKU_GAME, left ? [left.roll.id] : []);
      return left;
    },

    /** The board of the medals on the table, to show: null for none yet (the boat at START). */
    board(): BoardRecord | null {
      return look() ?? null;
    },

    /** Forgets the board kept for the player on the table: the medals have been reset. */
    clear(): void {
      remove(boardKey(bank.owner()));
      memory = null;
      settledHere.clear();
    },
  };
}

/**
 * A name for a roll: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the draw's alone.
 */
export const rollId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
