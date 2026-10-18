/**
 * The Sic Bo table on the medal center's floor: the bets on its layout are
 * the player's medals, taken out of the medals the player holds as each bet
 * is made, and given back when a roll pays them or the player takes them off.
 * It keeps its medals the way the craps table does (Craps/medalTable.ts), and
 * for the same reasons.
 *
 * - **A bet takes medals once.** `place` takes the stake out of the player's
 *   medals before the layout holds it.
 * - **A roll gives medals once.** `roll` settles every bet on the layout and
 *   gives back, in one go, the medals and the win of every bet that won. The
 *   layout is clear after every roll, as on the electronic tables: losing
 *   bets are taken, winning ones paid. `undo` and `clear` give back the
 *   stakes they take off before a roll.
 * - **The layout is kept with its bets on it.** Every change is written to
 *   this device as it is made, under the player whose medals it holds
 *   (`tableKey`), so a reload finds the same bets, the same last roll and the
 *   same board of results.
 * - **The table says what is about to move before the medals move, and each
 *   step is kept or the change is not made.** A change that moves medals is
 *   written down first, with the move it makes and the table as it was
 *   before it (`pending`), and then the medals are moved under a receipt
 *   (`bank.apply`; "A machine's rounds" in bank.ts). If they are not kept as
 *   moved, they are moved back and the table is written as it was.
 * - **A browser that dies between the two writes loses nothing and makes
 *   nothing.** The page that next holds the card looks at the table against
 *   the receipts: a bet written down whose medals the medals do not show as
 *   taken was never made, and the table goes back to how it was before it;
 *   medals written down as coming back (a win, a bet taken off) that never
 *   came are given now, once.
 * - **A roll is drawn in the press, and settled at once.** Where the dice
 *   land is drawn when SHAKE is pressed, and the table and the medals are
 *   settled there and then: a page that is closed while the dome still
 *   shakes has paid what it owes. The dome only shows the roll.
 * - **A guest's table goes with the guest's medals**, as the craps table's
 *   does, and **a reset at the Medal Game Center clears it**: its bets went
 *   with the medals.
 * - **One page plays at a time**: only a page that holds the medal center's
 *   card (`may`) changes the table.
 *
 * Nothing here touches a browser: the medals, the storage and whether this
 * page may play are handed in, so the tests run it against the real medal
 * bank in a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { BET_IDS, isBetId, isDice, labelOf, resolveRoll, totalOnLayout, type BetId, type Bets, type Dice, type RollResolution } from './engine';

// ── Names and sizes ─────────────────────────────────────────────────────────

/** The game's name at the medal center: its seat, its receipts, and its restart after a reset. */
export const SIC_BO_GAME = 'sic-bo';
/** Where a guest's table is kept on this device. */
export const TABLE_KEY = 'sic-bo-table';
/** Where the table of the player whose medals are on it is kept on this device: a guest's, or an account's. */
export const tableKey = (owner: string | null): string => (owner === null ? TABLE_KEY : `${TABLE_KEY}:${owner}`);
/** What a table nobody can read is put aside under, instead of being written over. */
export const unreadKey = (owner: string | null): string => `${tableKey(owner)}#unread`;
export const TABLE_VERSION = 1;

/** The most medals one area holds: the two digits of the lamp on it. */
export const SPOT_MAX = 99;
/** The medals put on an area by one press. The smallest bet is one medal. */
export const BET_SIZES = [1, 5, 10, 50] as const;
/** The most a roll can take: every area at its most. */
export const ROLL_STAKE_MOST = BET_IDS.length * SPOT_MAX;
/** Rolls kept on the board of results: the last twenty, as the electronic tables show them. */
export const HISTORY_LIMIT = 20;

// ── The table ───────────────────────────────────────────────────────────────

export interface Stats {
  rolls: number;
  /** Medals bet on rolls at this table. */
  played: number;
  /** Medals that came back off the layout from them. */
  won: number;
  /** The most one roll brought back. */
  biggest: number;
  triples: number;
}

export interface Placed {
  id: BetId;
  amount: number;
}

export interface Table {
  v: typeof TABLE_VERSION;
  /** The medals on each area. */
  bets: Bets;
  /** What was put on since the last roll, in order: what Undo takes back. */
  placed: Placed[];
  /** The bets on the layout at the last roll, for Same bets. */
  lastRound: Bets;
  stats: Stats;
  /** The board of results: the latest roll first, at most `HISTORY_LIMIT`. */
  history: Dice[];
  /**
   * The last roll: the layout as it was bet and the dice. What it paid is
   * worked out again from these. `seed` is what the dome's show of it was
   * made from, so that the dice lie the same way after a reload.
   */
  last: { bets: Bets; dice: Dice; seed: number } | null;
  /** Which medals the bets on it were taken from (`TablePurse.mark`), as the craps table keeps it. */
  mark?: string;
  /** The table's name, which its moves of medals go under (`bank.apply`), and how many moves it has made. */
  id?: string;
  seq?: number;
  /** The last move of medals written down, still to be squared with the receipts (as the craps table's). */
  pending?: Pending;
}

/** A move of medals written down before it is made (`Table.pending`). */
export interface Pending {
  n: number;
  medals: number;
  before: string | null;
}

/** The name every move of the table's medals goes under, at the bank: one move to a round. */
export const MOVE_STEP = 'move';
/** The round a move of a table's medals is, at the bank: the table's name and the move's number. */
export const moveRound = (id: string, n: number): string => `${id}-${n}`;

export const EMPTY_STATS: Stats = { rolls: 0, played: 0, won: 0, biggest: 0, triples: 0 };

export const freshTable = (): Table => ({ v: TABLE_VERSION, bets: {}, placed: [], lastRound: {}, stats: { ...EMPTY_STATS }, history: [], last: null });

/** A table with nothing on it and nothing in its record, for the server and the first drawing. */
export const FRESH_TABLE: Table = freshTable();

/** What the last roll paid, worked out from the layout it was bet on. */
export const lastRoll = (table: Table): RollResolution | null => (table.last ? resolveRoll(table.last.bets, table.last.dice) : null);

export const onTable = (table: Table): number => totalOnLayout(table.bets);

function nextStats(stats: Stats, res: RollResolution, triple: boolean): Stats {
  return {
    rolls: stats.rolls + 1,
    played: stats.played + res.decided,
    won: stats.won + res.returned,
    biggest: Math.max(stats.biggest, res.returned),
    triples: stats.triples + (triple ? 1 : 0),
  };
}

// ── Reading and writing a table ─────────────────────────────────────────────

const LONGEST = 32_000;
const MOST = 1_000_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown, least = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= least && value <= MOST;
const isSeed = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 2 ** 32;

/** Medals on areas: every amount whole, at most an area's limit, on an area the layout has. */
function readBets(value: unknown): Bets | null {
  if (!isRecord(value)) return null;
  const bets: Bets = {};
  for (const key of Object.keys(value)) {
    const amount = value[key];
    if (!isBetId(key) || !isCount(amount, 1) || amount > SPOT_MAX) return null;
    bets[key] = amount;
  }
  return bets;
}

const readDice = (value: unknown): Dice | null => (isDice(value) ? [value[0], value[1], value[2]] : null);

function readStats(value: unknown): Stats | null {
  if (!isRecord(value)) return null;
  const { rolls, played, won, biggest, triples } = value;
  if (!isCount(rolls) || !isCount(played) || !isCount(won) || !isCount(biggest) || !isCount(triples)) return null;
  return { rolls, played, won, biggest, triples };
}

/**
 * A table as written down, or null when the text is not a table this version
 * can read: anything else under its name, a table from a later version, one
 * whose bets the layout could not hold, or one cut short.
 */
export function parseTable(text: unknown): Table | null {
  if (typeof text !== 'string' || text.length > LONGEST) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== TABLE_VERSION) return null;
  const bets = readBets(raw.bets);
  const lastRound = readBets(raw.lastRound);
  const stats = readStats(raw.stats);
  if (!bets || !lastRound || !stats) return null;

  if (!Array.isArray(raw.placed) || raw.placed.length > 1000) return null;
  const placed: Placed[] = [];
  const taken: Bets = {};
  for (const item of raw.placed as unknown[]) {
    if (!isRecord(item) || !isBetId(item.id) || !isCount(item.amount, 1)) return null;
    placed.push({ id: item.id, amount: item.amount });
    taken[item.id] = (taken[item.id] ?? 0) + item.amount;
  }
  // What can be taken back is on the layout.
  if (BET_IDS.some((id) => (taken[id] ?? 0) > (bets[id] ?? 0))) return null;

  if (!Array.isArray(raw.history) || raw.history.length > HISTORY_LIMIT) return null;
  const history: Dice[] = [];
  for (const item of raw.history as unknown[]) {
    const dice = readDice(item);
    if (!dice) return null;
    history.push(dice);
  }

  let last: Table['last'] = null;
  if (raw.last !== null) {
    if (!isRecord(raw.last)) return null;
    const lastBets = readBets(raw.last.bets);
    const dice = readDice(raw.last.dice);
    if (!lastBets || !dice || !isSeed(raw.last.seed)) return null;
    last = { bets: lastBets, dice, seed: raw.last.seed };
  }
  const { mark, id, seq, pending } = raw;
  if (mark !== undefined && !(typeof mark === 'string' && mark.length <= 64)) return null;
  if (id !== undefined && !(typeof id === 'string' && /^[a-z0-9]{1,12}$/.test(id))) return null;
  if (seq !== undefined && !isCount(seq)) return null;
  const parsed: Table = { v: TABLE_VERSION, bets, placed, lastRound, stats, history, last };
  if (mark !== undefined) parsed.mark = mark;
  if (id !== undefined) parsed.id = id;
  if (seq !== undefined) parsed.seq = seq;
  if (pending !== undefined) {
    if (!isRecord(pending) || !isCount(pending.n, 1) || typeof pending.medals !== 'number' || !Number.isSafeInteger(pending.medals) || pending.medals === 0) return null;
    if (pending.before !== null && (typeof pending.before !== 'string' || pending.before.length > LONGEST / 2)) return null;
    parsed.pending = { n: pending.n, medals: pending.medals, before: pending.before };
  }
  return parsed;
}

/** A table as it is written down. */
export function serializeTable(table: Table): string {
  return JSON.stringify({
    v: table.v,
    bets: table.bets,
    placed: table.placed,
    lastRound: table.lastRound,
    stats: table.stats,
    history: table.history,
    last: table.last,
    ...(table.mark === undefined ? {} : { mark: table.mark }),
    ...(table.id === undefined ? {} : { id: table.id }),
    ...(table.seq === undefined ? {} : { seq: table.seq }),
    ...(table.pending === undefined ? {} : { pending: table.pending }),
  });
}

// ── The table at play ───────────────────────────────────────────────────────

/** Why a bet cannot be made, or a change to the layout. */
export type TableError =
  /** An area holds `SPOT_MAX` at most. */
  | 'spotLimit'
  /** More medals than the player holds. */
  | 'noMedals'
  /** This page cannot play now: the medals are in another tab, or not read yet. */
  | 'notHere'
  /** The table could not be written, so the change was not made. */
  | 'notKept'
  /** Nothing to take back, or no bets to roll for. */
  | 'nothing'
  /** Not an area of the layout, or not a whole number of medals. */
  | 'bad';

/** How many medals one press of `size` puts on an area that holds `onIt`, when the player has `medals` left. */
export const pressAmount = (size: number, onIt: number, medals: number): number => Math.max(0, Math.min(Math.floor(size), SPOT_MAX - onIt, Math.floor(medals)));

/** What the table needs of the player's medals. The medal center's `bank()` is one (`purseOf`). */
export interface TablePurse {
  loaded(): boolean;
  balance(): number;
  owner(): string | null;
  /** Which medals they are: this device's copy of them and its era. Null until they are read. */
  mark(): string | null;
  take(medals: number): boolean;
  give(medals: number): boolean;
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  settle(game: string, keep?: readonly string[]): boolean;
  restartDue(game: string): boolean;
  restarted(game: string): void;
  kept(): boolean;
  /** Tells the medals' history of a roll as one round: the bets it decided, and what came back off the layout (bank.ts `played`). */
  rolled?(roll: { round: string; bet: number; won: number }): void;
}

/** The medal center's bank, as the table uses it. */
export const purseOf = (bank: {
  getState(): { loaded: boolean; kept: boolean; ledger: { device: string; era: number } | null };
  balance(): number;
  owner(): string | null;
  take(medals: number): boolean;
  give(medals: number): boolean;
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  settle(game: string, keep?: readonly string[]): boolean;
  restartDue(game: string): boolean;
  restarted(game: string): void;
  played?(report: { game: string; round: string; bet: number; won: number }): void;
}): TablePurse => ({
  loaded: () => bank.getState().loaded,
  balance: () => bank.balance(),
  owner: () => bank.owner(),
  mark: () => {
    const ledger = bank.getState().ledger;
    return ledger ? `${ledger.device}:${ledger.era}` : null;
  },
  take: (medals) => bank.take(medals),
  give: (medals) => bank.give(medals),
  apply: (move) => bank.apply(move),
  applied: (move) => bank.applied(move),
  forget: (game, keep) => bank.forget(game, keep),
  settle: (game, keep) => bank.settle(game, keep),
  restartDue: (game) => bank.restartDue(game),
  restarted: (game) => bank.restarted(game),
  kept: () => bank.getState().kept,
  rolled: (roll) => bank.played?.({ game: SIC_BO_GAME, ...roll }),
});

/** Where tables are written: this device's storage. Every call may throw (storage blocked or full). */
export interface TableStorage {
  read(key: string): string | null;
  write(key: string, text: string): void;
  remove(key: string): void;
}

export type Done<T = true> = { ok: true; value: T } | { ok: false; error: TableError };
const fail = (error: TableError): { ok: false; error: TableError } => ({ ok: false, error });

/** What a roll did: what it settled, and the table as it stood when the dome was shaken. */
export interface Rolled {
  resolution: RollResolution;
  before: Table;
}

export type MedalTable = ReturnType<typeof createTable>;

/** Nothing read yet, or what was read is to be read again. */
const UNREAD = Symbol('unread');

const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A new table's name: ten letters and digits from the browser's random numbers (not Math.random, which is the draw's alone). */
const randomId = (): string => {
  try {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(10)), (n) => LETTERS[n % LETTERS.length]).join('');
  } catch {
    return Array.from({ length: 10 }, (_, i) => LETTERS[(Date.now() + i * 7) % LETTERS.length]).join('');
  }
};

/**
 * The table of whoever's medals are on it, as this page knows it. `may` says
 * whether this page may play now: it holds the medal center's card, and the
 * medals are its player's.
 */
export function createTable(purse: TablePurse, storage: TableStorage, may: () => boolean, newId: () => string = randomId) {
  let owner: string | null = null;
  let table: Table = FRESH_TABLE;
  /** The text last read or written under the owner's name. */
  let seen: string | null | typeof UNREAD = UNREAD;
  /** Whether storage cannot be read at all, so that the table is played in the page alone. */
  let unkept = false;
  /** A table nobody can read lies under the owner's name and could not be put aside: nothing is written over it. */
  let stuck = false;
  /** Whether the last write took. */
  let kept = true;
  const listeners = new Set<() => void>();

  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const show = (next: Table): void => {
    if (next === table) return;
    table = next;
    tell();
  };

  const read = (key: string): string | null | undefined => {
    try {
      const text = storage.read(key);
      unkept = false;
      return text;
    } catch {
      unkept = true;
      return undefined;
    }
  };
  const writeText = (key: string, text: string): boolean => {
    try {
      storage.write(key, text);
      return true;
    } catch {
      return false;
    }
  };
  /** Writes a table under the owner's name, marked with the medals it was played with. */
  const write = (next: Table): Table | null => {
    if (stuck) return null;
    const mark = purse.mark();
    const marked: Table = mark === null ? next : { ...next, mark };
    const text = serializeTable(marked);
    kept = writeText(tableKey(owner), text);
    if (!kept) return null;
    seen = text;
    return marked;
  };
  /** Puts a change on the table if it is written down, or if nothing is kept by this browser at all. */
  const commit = (next: Table): boolean => {
    if (unkept) {
      show(next);
      return true;
    }
    const written = write(next);
    if (!written) return false;
    show(written);
    return true;
  };
  /** Whether a take or a give just made was kept: always, where nothing is. */
  const medalsKept = (): boolean => unkept || purse.kept();

  /** A guest's medals that became the account's on its first sign-in are the same medals: the guest's table goes with them. */
  const adopt = (): void => {
    if (owner === null || !may()) return;
    const guestText = read(TABLE_KEY);
    const guest = typeof guestText === 'string' ? parseTable(guestText) : null;
    const mark = purse.mark();
    if (!guest || guest.mark === undefined || mark === null || guest.mark !== mark) return;
    const text = serializeTable(guest);
    if (!writeText(tableKey(owner), text)) return;
    try {
      storage.remove(TABLE_KEY);
    } catch {
      // It stays under the guest's name, where its mark no longer matches the guest's medals.
    }
    seen = text;
    show(guest);
  };

  /**
   * Brings the table up to date: the table of the player whose medals are on
   * it now, as storage has it (another tab may have played it), and cleared if
   * the medals have been reset since this device last cleared it. Only a page
   * that may play writes anything.
   */
  const sync = (): void => {
    if (!purse.loaded()) return;
    const now = purse.owner();
    if (now !== owner) {
      owner = now;
      seen = UNREAD;
      stuck = false;
      show(FRESH_TABLE);
    }
    let text = read(tableKey(owner));
    if (text === null && owner !== null) {
      adopt();
      text = read(tableKey(owner));
    }
    if (text !== undefined && text !== seen) {
      const found = text === null ? null : parseTable(text);
      // A table is played only with the medals its bets were taken from (as the craps table's is).
      const mark = purse.mark();
      const parsed = found && (found.mark === undefined || mark === null || found.mark === mark) ? found : null;
      if (text !== null && !parsed) {
        // A table this version cannot read, or cannot play, is put aside by the page that may write, not written over.
        stuck = true;
        if (may() && writeText(unreadKey(owner), text)) {
          stuck = false;
          seen = text;
        }
      } else {
        stuck = false;
        seen = text;
      }
      show(parsed ?? FRESH_TABLE);
    }
    if (purse.restartDue(SIC_BO_GAME)) {
      // The medals have been reset since this table last was: its bets went with them.
      show(FRESH_TABLE);
      if (may() && (unkept || write(FRESH_TABLE))) purse.restarted(SIC_BO_GAME);
      else seen = UNREAD;
    }
    square();
    // Medals are out at the table while bets lie on it, and only then.
    if (may() && !stuck && onTable(table) === 0) purse.settle(SIC_BO_GAME);
  };

  /**
   * Squares the table with its receipts, by the page that may play: a move written down whose receipt the medals do
   * not hold was never made, because the browser died between the two writes. A bet goes back off the table (it is
   * written as it was before), and medals coming back are given now, once.
   */
  const square = (): void => {
    for (let back = 0; back < 16 && may() && !unkept && !stuck; back++) {
      const { id, pending } = table;
      if (id === undefined || !pending) return;
      const move = { game: SIC_BO_GAME, round: moveRound(id, pending.n), step: MOVE_STEP };
      if (purse.applied(move)) return;
      if (pending.medals > 0) {
        purse.apply({ ...move, medals: pending.medals, out: onTable(table) > 0 });
        return;
      }
      const earlier = pending.before === null ? null : parseTable(pending.before);
      const restored = write(earlier ?? { ...freshTable(), stats: table.stats, history: table.history, last: table.last });
      if (!restored) return;
      show(restored);
    }
  };

  /** Whether this page may play now, the table brought up to date first. */
  const ready = (): boolean => {
    if (!may()) return false;
    sync();
    return may();
  };

  /**
   * Makes a change to the table that moves `medals` (taken below nothing, given above): the table after it is written
   * down first, with the move still to be made and the table as it was, and then the medals are moved under the
   * move's receipt. Medals the bank would not move leave the table as it was; medals that are not kept as moved are
   * moved back, and the table goes back to what it was. A change that moves nothing is simply written.
   */
  const change = (before: Table, next: Table, medals: number): TableError | null => {
    if (medals === 0) {
      if (!commit({ ...next, pending: undefined })) return 'notKept';
      // A roll that took every bet off the layout and gave nothing back: none of its medals are out any more.
      if (onTable(next) === 0) purse.settle(SIC_BO_GAME);
      return null;
    }
    const id = before.id ?? newId();
    const n = (before.seq ?? 0) + 1;
    const plain: Table = { ...before };
    delete plain.pending;
    const pending: Pending = { n, medals, before: serializeTable(plain) };
    if (!commit({ ...next, id, seq: n, pending })) return 'notKept';
    const move = { game: SIC_BO_GAME, round: moveRound(id, n), step: MOVE_STEP };
    // The table's medals are out while bets lie on it: the move says whether any still do.
    const done = purse.apply({ ...move, medals, out: onTable(next) > 0 });
    if (done === 'applied' && medalsKept()) {
      purse.forget(SIC_BO_GAME, [move.round]);
      return null;
    }
    if (done === 'applied') {
      // Not kept as moved: moved back, and the move's receipt let go of with it, so that it can be made again.
      if (medals < 0) purse.give(-medals);
      else purse.take(medals);
      purse.forget(SIC_BO_GAME, before.id !== undefined && before.pending ? [moveRound(before.id, before.pending.n)] : []);
    }
    commit(before);
    return done === null && medals < 0 ? 'noMedals' : 'notKept';
  };

  const without = (bets: Bets, id: BetId, amount: number): Bets => {
    const next = { ...bets };
    const left = (next[id] ?? 0) - amount;
    if (left > 0) next[id] = left;
    else delete next[id];
    return next;
  };

  /** Puts `amount` medals on `id`, taken from the player's medals. */
  const place = (id: BetId, amount: number): Done => {
    if (!ready()) return fail('notHere');
    if (!isBetId(id) || !Number.isSafeInteger(amount) || amount < 1) return fail('bad');
    if ((table.bets[id] ?? 0) + amount > SPOT_MAX) return fail('spotLimit');
    if (amount > purse.balance()) return fail('noMedals');
    const next: Table = { ...table, bets: { ...table.bets, [id]: (table.bets[id] ?? 0) + amount }, placed: [...table.placed, { id, amount }] };
    const why = change(table, next, -amount);
    return why === null ? { ok: true, value: true } : fail(why);
  };

  return {
    /** The table as this page knows it. */
    table: (): Table => table,
    /** Whose table it is. */
    owner: (): string | null => owner,
    /** Whether the last write of the table took. */
    kept: (): boolean => kept,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sync,

    /** The medals have been reset somewhere, and this page cannot clear the table now: it shows it cleared, and clears it when it can. */
    resetSeen(): void {
      seen = UNREAD;
      show(FRESH_TABLE);
    },

    place,

    /** Takes back the last medals put on since the roll. */
    undo(): Done {
      if (!ready()) return fail('notHere');
      const lastPlaced = table.placed.at(-1);
      if (!lastPlaced) return fail('nothing');
      const next = { ...table, bets: without(table.bets, lastPlaced.id, lastPlaced.amount), placed: table.placed.slice(0, -1) };
      const why = change(table, next, lastPlaced.amount);
      return why === null ? { ok: true, value: true } : fail(why);
    },

    /** Takes every bet off the layout. */
    clear(): Done {
      if (!ready()) return fail('notHere');
      const medals = onTable(table);
      if (medals === 0) return fail('nothing');
      const why = change(table, { ...table, bets: {}, placed: [] }, medals);
      return why === null ? { ok: true, value: true } : fail(why);
    },

    /**
     * Puts the last roll's bets back where they are missing, all of them or none: in one move, if the medals cover
     * every one of them.
     */
    repeat(): Done {
      if (!ready()) return fail('notHere');
      const adds: Placed[] = [];
      for (const id of BET_IDS) {
        const missing = Math.min(SPOT_MAX, table.lastRound[id] ?? 0) - (table.bets[id] ?? 0);
        if (missing > 0) adds.push({ id, amount: missing });
      }
      const medals = adds.reduce((sum, { amount }) => sum + amount, 0);
      if (medals === 0) return fail('nothing');
      if (medals > purse.balance()) return fail('noMedals');
      const bets = { ...table.bets };
      for (const { id, amount } of adds) bets[id] = (bets[id] ?? 0) + amount;
      const why = change(table, { ...table, bets, placed: [...table.placed, ...adds] }, -medals);
      return why === null ? { ok: true, value: true } : fail(why);
    },

    /**
     * Rolls the dice drawn: every bet on the layout is settled, the table is written as the roll leaves it (the layout
     * clear, the roll on the board), and then the medals the roll gives back are given, once. A roll whose table or
     * medals cannot be kept is not made. `seed` is kept with the roll: what the dome's show of it is made from.
     */
    roll(dice: Dice, seed: number): Done<Rolled> {
      if (!ready()) return fail('notHere');
      if (!isDice(dice)) return fail('bad');
      const before = table;
      if (onTable(before) === 0) return fail('nothing');
      const resolution = resolveRoll(before.bets, dice);
      const triple = dice[0] === dice[1] && dice[1] === dice[2];
      const next: Table = {
        ...before,
        bets: {},
        placed: [],
        lastRound: { ...before.bets },
        stats: nextStats(before.stats, resolution, triple),
        history: [[dice[0], dice[1], dice[2]] as Dice, ...before.history].slice(0, HISTORY_LIMIT),
        last: { bets: before.bets, dice: [dice[0], dice[1], dice[2]], seed: seed >>> 0 },
      };
      if (change(before, next, resolution.returned) !== null) return fail('notKept');
      // The medals' history counts the roll as one round: what it took off the layout, and what it gave back.
      purse.rolled?.({ round: `${table.id ?? 'table'}-r${table.stats.rolls}`, bet: resolution.decided, won: resolution.returned });
      // The medal floor hears of the medals the roll decided (they feed the floor jackpot: Sic Bo is linked to it) and
      // of what it gave back, once, as it is given: a triple by name.
      const label = labelOf(resolution);
      floorReport(SIC_BO_GAME, {
        played: resolution.decided,
        won: resolution.returned,
        ...(resolution.returned > 0 ? { prize: label ? { medals: resolution.returned, label } : { medals: resolution.returned } } : {}),
      });
      return { ok: true, value: { resolution, before } };
    },
  };
}
