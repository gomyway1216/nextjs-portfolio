/**
 * The craps table on the medal center's floor: the bets on it are the
 * player's medals, taken out of the medals the player holds as each bet is
 * made and put back when a bet is decided or taken down.
 *
 * - **A bet takes medals once.** `place` takes the stake out of the player's
 *   medals before the table holds it.
 * - **A decision gives medals once.** `roll` resolves every bet on the table
 *   and gives back, in one go, the stake and the win of every bet that won
 *   (only the win, for a place bet that stays up). `undo`, `clear` and
 *   `takeDown` give back the stakes they take off.
 * - **The table is kept with its bets on it.** Every change is written to
 *   this device as it is made, under the player whose medals it holds
 *   (`tableKey`), so a reload finds the same bets, puck and record. Bets are
 *   not handed back when the page is left: a Pass Line bet with its point on
 *   cannot be taken down at a real table, and handing it back at a reload would
 *   let a player out of a bet that is worth less than its stake.
 * - **The table says what is about to move before the medals move, and each
 *   step is kept or the change is not made.** A change that moves medals is
 *   written down first, with the move it makes and the table as it was
 *   before it (`pending`), and then the medals are moved under a receipt
 *   (`bank.apply`; "A machine's rounds" in bank.ts). If they are not kept as
 *   moved, they are moved back and the table is written as it was. So no
 *   write that fails can make medals twice, or lose them. Only where storage
 *   cannot be read at all is everything played in the page alone, and there
 *   nothing outlives it.
 * - **A browser that dies between the two writes loses nothing and makes
 *   nothing.** The page that next holds the card looks at the table against
 *   the receipts: a bet written down whose medals the medals do not show as
 *   taken was never made, and the table goes back to how it was before it;
 *   medals written down as coming back (a win, a bet taken down) that never
 *   came are given now, once. Each move's receipt is let go of once the
 *   next move is made. A table from before receipts is taken at its word.
 * - **A guest's table goes with the guest's medals.** On a first sign-in to an
 *   account with no medals, the guest's medals become the account's
 *   (MedalCenter/bank.ts); the table, marked with those medals (`mark`), moves
 *   with them. An account with medals of its own keeps its own table, and the
 *   guest's stays the guest's.
 * - **Every win is whole medals.** A spot that pays a fraction (Place 6 pays
 *   7 for 6) takes medals only in amounts it pays in whole medals
 *   (`stakeStep`), as a dealer asks for 6 on the 6. Nothing is ever rounded,
 *   so the house edge on the table is exactly the edge the Odds tab shows.
 * - **One page plays at a time.** Only a page that holds the medal center's
 *   card (`may`) changes the table; any other shows it as it was last written.
 * - **A reset at the Medal Game Center clears the table.** When the medals
 *   have been reset since this device last cleared its table
 *   (`restartDue`), the table starts over: its bets went with the medals.
 *
 * Nothing here touches a browser: the medals, the storage and whether this
 * page may play are handed in, so the tests run it against the real medal
 * bank in a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import {
  BET_IDS,
  LAY_ODDS,
  PLACE_PAYS,
  TRUE_ODDS,
  canTakeDown,
  isPointNumber,
  maxOdds,
  placeNumber,
  placementError,
  resolveRoll,
  totalOnTable,
  type BetId,
  type Bets,
  type Dice,
  type PlacementError,
  type PointNumber,
  type Ratio,
  type RollEvent,
  type RollResolution,
} from './engine';

// ── Names and sizes ─────────────────────────────────────────────────────────

/** The game's name at the medal center: its seat, and its restart after a reset. */
export const CRAPS_GAME = 'craps';
/** Where a guest's table is kept on this device. */
export const TABLE_KEY = 'craps-table';
/** Where the table of the player whose medals are on it is kept on this device: a guest's, or an account's. */
export const tableKey = (owner: string | null): string => (owner === null ? TABLE_KEY : `${TABLE_KEY}:${owner}`);
/** What a table nobody can read is put aside under, instead of being written over. */
export const unreadKey = (owner: string | null): string => `${tableKey(owner)}#unread`;
export const TABLE_VERSION = 1;

/**
 * The most medals one spot holds, as on Sega's medal machine SUPER DICE CRAPS
 * (1995), whose spots took 5 to 50 medals. The odds go past it, as they go
 * past a real table's limit: up to 3-4-5× the line bet, and 6× on the lay.
 */
export const SPOT_MAX = 50;
/** The BET buttons: medals put on a spot by one press. The smallest bet is one medal. */
export const BET_SIZES = [1, 5, 10, 50] as const;
/** Rolls kept in the table's record. */
export const HISTORY_LIMIT = 18;

// ── Whole medals ────────────────────────────────────────────────────────────

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** The smallest stake a payout pays in whole medals: 6 for 7:6, 2 for 3:2, 1 for 30:1. */
const wholeStep = ([num, den]: Ratio): number => den / gcd(num, den);

/**
 * How many medals a spot takes at a time, so that every win on it is whole
 * medals: Place 6 and 8 in 6s, Place 4, 5, 9 and 10 in 5s; the odds behind 5
 * and 9 in 2s and behind 6 and 8 in 5s; the lay against 4 and 10 in 2s, 5 and
 * 9 in 3s, 6 and 8 in 6s. Every other bet pays whole multiples of its stake.
 */
export function stakeStep(id: BetId, point: PointNumber | null): number {
  const place = placeNumber(id);
  if (place !== null) return wholeStep(PLACE_PAYS[place]);
  if (id === 'passOdds') return point === null ? 1 : wholeStep(TRUE_ODDS[point]);
  if (id === 'dontPassOdds') return point === null ? 1 : wholeStep(LAY_ODDS[point]);
  return 1;
}

const isOdds = (id: BetId): id is 'passOdds' | 'dontPassOdds' => id === 'passOdds' || id === 'dontPassOdds';

/** The most a spot can hold now: the spot limit, or for the odds 3-4-5× (lay 6×) the line bet. Always a whole number of steps. */
export function spotLimit(id: BetId, point: PointNumber | null, bets: Bets): number {
  if (isOdds(id)) return maxOdds(id, point, bets);
  const step = stakeStep(id, point);
  return SPOT_MAX - (SPOT_MAX % step);
}

/** Why a bet cannot be made: the rules' reasons, and the medals'. */
export type TableError =
  | PlacementError
  /** Over the most a spot holds (`SPOT_MAX`). */
  | 'spotLimit'
  /** Not a whole number of the spot's steps. */
  | 'step'
  /** More medals than the player holds. */
  | 'noMedals'
  /** This page cannot play now: the medals are in another tab, or not read yet. */
  | 'notHere'
  /** The table could not be written, so the change was not made. */
  | 'notKept'
  /** Nothing to take back. */
  | 'nothing';

/** Why `amount` more medals cannot go on `id` now, or null if they can. */
export function placeError(id: BetId, amount: number, point: PointNumber | null, bets: Bets, medals: number): TableError | null {
  if (!Number.isSafeInteger(amount) || amount < 1) return 'step';
  const rule = placementError(id, amount, point, bets);
  if (rule) return rule;
  if (amount % stakeStep(id, point) !== 0) return 'step';
  if (!isOdds(id) && (bets[id] ?? 0) + amount > spotLimit(id, point, bets)) return 'spotLimit';
  if (amount > medals) return 'noMedals';
  return null;
}

/**
 * What one press of BET `size` on `id` puts on now: the size rounded up to the
 * spot's step, and no more than the spot still has room for. Or why nothing.
 */
export function pressAmount(id: BetId, size: number, point: PointNumber | null, bets: Bets): { amount: number } | { error: TableError } {
  const rule = placementError(id, 0, point, bets);
  if (rule) return { error: rule };
  const step = stakeStep(id, point);
  const room = spotLimit(id, point, bets) - (bets[id] ?? 0);
  const fits = Math.floor(Math.max(0, room) / step) * step;
  if (fits < step) return { error: isOdds(id) ? 'oddsLimit' : 'spotLimit' };
  return { amount: Math.min(Math.ceil(Math.max(1, size) / step) * step, fits) };
}

// ── The table ───────────────────────────────────────────────────────────────

export interface Stats {
  rolls: number;
  shooter: number;
  handRolls: number;
  longestHand: number;
  pointsMade: number;
  sevenOuts: number;
  /** Medals won less medals lost on bets decided at this table. */
  net: number;
}

export interface HistoryEntry {
  dice: Dice;
  event: RollEvent;
}

export interface Placed {
  id: BetId;
  amount: number;
}

export interface Table {
  v: typeof TABLE_VERSION;
  point: PointNumber | null;
  /** The medals on each spot. */
  bets: Bets;
  /** What was put on since the last roll, in order: what Undo and Clear take back. */
  placed: Placed[];
  /** The bets on the table at the last roll, for Repeat bets. */
  lastRound: Bets;
  stats: Stats;
  /** The latest roll first. */
  history: HistoryEntry[];
  /**
   * The last roll as it was thrown: the table before it and the dice. What it
   * decided is worked out again from these. `seed` is what the throw's look
   * was made from, so that the dice lie where they came to rest after a
   * reload too; a table written before the throw was drawn has none.
   */
  last: { point: PointNumber | null; bets: Bets; dice: Dice; seed?: number } | null;
  /**
   * Which medals the bets on it were taken from: the medals' own copy on this
   * device and its era (`TablePurse.mark`). A guest's medals that become an
   * account's on its first sign-in keep their mark, and so the table goes with
   * them; an account that brings medals of its own has another.
   */
  mark?: string;
  /** The table's name, which its moves of medals go under (`bank.apply`), and how many moves it has made. */
  id?: string;
  seq?: number;
  /**
   * The last move of medals written down: its number, the medals it moves (taken below nothing, given above), and the
   * table as it was before it. Until the medals hold its receipt it may never have been made (the browser died
   * between the two writes): a bet then goes back off the table, and medals coming back are given.
   */
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

export const EMPTY_STATS: Stats = { rolls: 0, shooter: 1, handRolls: 0, longestHand: 0, pointsMade: 0, sevenOuts: 0, net: 0 };

export const freshTable = (): Table => ({ v: TABLE_VERSION, point: null, bets: {}, placed: [], lastRound: {}, stats: { ...EMPTY_STATS }, history: [], last: null });

/** A table with nothing on it and nothing in its record, for the server and the first drawing. */
export const FRESH_TABLE: Table = freshTable();

/** What the last roll decided, worked out from the table before it. */
export const lastRoll = (table: Table): RollResolution | null => (table.last ? resolveRoll(table.last.point, table.last.bets, table.last.dice) : null);

export const onTable = (table: Table): number => totalOnTable(table.bets);

function nextStats(stats: Stats, res: RollResolution): Stats {
  const handRolls = stats.handRolls + 1;
  const sevenOut = res.event === 'sevenOut';
  const net = res.results.reduce((sum, r) => sum + (r.outcome === 'win' ? r.profit : r.outcome === 'lose' ? -r.stake : 0), 0);
  return {
    rolls: stats.rolls + 1,
    shooter: stats.shooter + (sevenOut ? 1 : 0),
    handRolls: sevenOut ? 0 : handRolls,
    longestHand: Math.max(stats.longestHand, handRolls),
    pointsMade: stats.pointsMade + (res.event === 'pointMade' ? 1 : 0),
    sevenOuts: stats.sevenOuts + (sevenOut ? 1 : 0),
    net: stats.net + net,
  };
}

// ── Reading and writing a table ─────────────────────────────────────────────

const LONGEST = 32_000;
/** More medals than anyone puts on one spot. */
const MOST = 1_000_000;
const EVENTS: readonly RollEvent[] = ['natural', 'craps', 'pointSet', 'pointMade', 'sevenOut', 'noDecision'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown, least = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= least && value <= MOST * 1000;
const isBetId = (value: unknown): value is BetId => typeof value === 'string' && (BET_IDS as readonly string[]).includes(value);
const isDie = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
const readDice = (value: unknown): Dice | null => (Array.isArray(value) && value.length === 2 && isDie(value[0]) && isDie(value[1]) ? [value[0], value[1]] : null);
const readPoint = (value: unknown): PointNumber | null | undefined => (value === null ? null : typeof value === 'number' && isPointNumber(value) ? value : undefined);

/** Medals on spots: every amount whole and on a spot the table has. */
function readBets(value: unknown): Bets | null {
  if (!isRecord(value)) return null;
  const bets: Bets = {};
  for (const key of Object.keys(value)) {
    const amount = value[key];
    if (!isBetId(key) || !isCount(amount, 1) || amount > MOST) return null;
    bets[key] = amount;
  }
  return bets;
}

/**
 * Whether every bet on a table could stand there, at that point: each one
 * pays whole medals and is no more than its spot holds, and the odds sit
 * behind a line bet within their limit. A table with anything else is not one
 * this version made, and is not played.
 */
function standsUp(bets: Bets, point: PointNumber | null): boolean {
  for (const id of BET_IDS) {
    const amount = bets[id];
    if (!amount) continue;
    if (amount % stakeStep(id, point) !== 0) return false;
    if (isOdds(id) ? point === null || amount > maxOdds(id, point, bets) : amount > spotLimit(id, point, bets)) return false;
  }
  return true;
}

function readStats(value: unknown): Stats | null {
  if (!isRecord(value)) return null;
  const { rolls, shooter, handRolls, longestHand, pointsMade, sevenOuts, net } = value;
  if (!isCount(rolls) || !isCount(shooter, 1) || !isCount(handRolls) || !isCount(longestHand) || !isCount(pointsMade) || !isCount(sevenOuts)) return null;
  if (typeof net !== 'number' || !Number.isSafeInteger(net)) return null;
  return { rolls, shooter, handRolls, longestHand, pointsMade, sevenOuts, net };
}

/**
 * A table as written down, or null when the text is not a table this version
 * can read: anything else under its name, a table from a later version, one
 * whose bets could not stand, or one cut short.
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
  const point = readPoint(raw.point);
  const bets = readBets(raw.bets);
  const lastRound = readBets(raw.lastRound);
  const stats = readStats(raw.stats);
  if (point === undefined || !bets || !lastRound || !stats || !standsUp(bets, point)) return null;

  if (!Array.isArray(raw.placed) || raw.placed.length > 1000) return null;
  const placed: Placed[] = [];
  const taken: Bets = {};
  for (const item of raw.placed as unknown[]) {
    if (!isRecord(item) || !isBetId(item.id) || !isCount(item.amount, 1)) return null;
    placed.push({ id: item.id, amount: item.amount });
    taken[item.id] = (taken[item.id] ?? 0) + item.amount;
  }
  // What can be taken back is on the table.
  if (BET_IDS.some((id) => (taken[id] ?? 0) > (bets[id] ?? 0))) return null;

  if (!Array.isArray(raw.history) || raw.history.length > HISTORY_LIMIT) return null;
  const history: HistoryEntry[] = [];
  for (const item of raw.history as unknown[]) {
    const dice = isRecord(item) ? readDice(item.dice) : null;
    if (!isRecord(item) || !dice || typeof item.event !== 'string' || !(EVENTS as readonly string[]).includes(item.event)) return null;
    history.push({ dice, event: item.event as RollEvent });
  }

  let last: Table['last'] = null;
  if (raw.last !== null) {
    if (!isRecord(raw.last)) return null;
    const lastPoint = readPoint(raw.last.point);
    const lastBets = readBets(raw.last.bets);
    const dice = readDice(raw.last.dice);
    if (lastPoint === undefined || !lastBets || !dice || !standsUp(lastBets, lastPoint)) return null;
    const seed = raw.last.seed;
    if (seed !== undefined && !(typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0 && seed < 2 ** 32)) return null;
    last = seed === undefined ? { point: lastPoint, bets: lastBets, dice } : { point: lastPoint, bets: lastBets, dice, seed };
  }
  const { mark, id, seq, pending } = raw;
  if (mark !== undefined && !(typeof mark === 'string' && mark.length <= 64)) return null;
  if (id !== undefined && !(typeof id === 'string' && /^[a-z0-9]{1,12}$/.test(id))) return null;
  if (seq !== undefined && !isCount(seq)) return null;
  const parsed: Table = { v: TABLE_VERSION, point, bets, placed, lastRound, stats, history, last };
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
    point: table.point,
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

/** What the table needs of the player's medals. The medal center's `bank()` is one (`purseOf`). */
export interface TablePurse {
  /** Whether the medals have been read. */
  loaded(): boolean;
  /** The medals that can be played now. */
  balance(): number;
  /** Whose medals they are: an account's id, or null for a guest's. */
  owner(): string | null;
  /**
   * Which medals they are: this device's copy of them and its era. A guest's
   * medals that become an account's on its first sign-in keep it; an
   * account's own medals have another. Null until they are read.
   */
  mark(): string | null;
  take(medals: number): boolean;
  give(medals: number): boolean;
  /** A move of the table's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  restartDue(game: string): boolean;
  restarted(game: string): void;
  /** Whether this browser kept the medals' last write: read straight after a take or a give, whether that one was. */
  kept(): boolean;
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
  restartDue(game: string): boolean;
  restarted(game: string): void;
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
  restartDue: (game) => bank.restartDue(game),
  restarted: (game) => bank.restarted(game),
  kept: () => bank.getState().kept,
});

/** Where tables are written: this device's storage. Every call may throw (storage blocked or full). */
export interface TableStorage {
  read(key: string): string | null;
  write(key: string, text: string): void;
  remove(key: string): void;
}

export type Done<T = true> = { ok: true; value: T } | { ok: false; error: TableError };
const fail = (error: TableError): { ok: false; error: TableError } => ({ ok: false, error });

/** What a roll did: what it decided, and the table as it stood when the dice were thrown. */
export interface Thrown {
  resolution: RollResolution;
  before: Table;
}

export type MedalTable = ReturnType<typeof createTable>;

/** Nothing read yet, or what was read is to be read again. */
const UNREAD = Symbol('unread');

const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A new table's name: ten letters and digits from the browser's random numbers. */
const randomId = (): string => {
  try {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(10)), (n) => LETTERS[n % LETTERS.length]).join('');
  } catch {
    return Array.from({ length: 10 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  }
};

/**
 * The table of whoever's medals are on the table, as this page knows it.
 * `may` says whether this page may play now: it holds the medal center's card,
 * and the medals are its player's.
 *
 * Where storage can be read, every change is kept or not made at all: a bet
 * whose medals were not kept as taken is not put on, and medals that were not
 * kept as given back leave the table as it was. Only where storage cannot be
 * read at all (a browser that blocks it) is the table played in the page
 * alone; nothing there outlives the page, the medals included.
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

  /**
   * A guest's medals that became the account's on its first sign-in are the
   * same medals: the guest's table, played with them, goes with them, and
   * leaves the guest's place once it is in the account's.
   */
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
   * the table now, as storage has it (another tab may have played it), and
   * cleared if the medals have been reset since this device last cleared it.
   * Only a page that may play writes anything.
   */
  const sync = (): void => {
    if (!purse.loaded()) return;
    const now = purse.owner();
    if (now !== owner) {
      // Another player's medals: nothing of the last player's table stays in hand, whatever storage says next.
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
      const read = text === null ? null : parseTable(text);
      // A table is played only with the medals its bets were taken from. One marked with other medals (a guest's
      // table left behind when the guest's medals became an account's, or one from before the medals were started
      // again) is put aside like a table that cannot be read: its bets are not medals these medals hold. A table with
      // no mark is from before tables were marked, and is played as it is.
      const mark = purse.mark();
      const parsed = read && (read.mark === undefined || mark === null || read.mark === mark) ? read : null;
      if (text !== null && !parsed) {
        // A table this version cannot read, or cannot play, is put aside by the page that may write, not written over.
        // Until it is, nothing is written under its name.
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
    if (purse.restartDue(CRAPS_GAME)) {
      // The medals have been reset since this table last was: its bets went with them. It is cleared for good once
      // that is written (or nothing is kept by this browser at all); until then it is only shown cleared.
      show(FRESH_TABLE);
      if (may() && (unkept || write(FRESH_TABLE))) purse.restarted(CRAPS_GAME);
      else seen = UNREAD;
    }
    square();
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
      const move = { game: CRAPS_GAME, round: moveRound(id, pending.n), step: MOVE_STEP };
      if (purse.applied(move)) return;
      if (pending.medals > 0) {
        purse.apply({ ...move, medals: pending.medals });
        return;
      }
      const earlier = pending.before === null ? null : parseTable(pending.before);
      const restored = write(earlier ?? { ...freshTable(), stats: table.stats, history: table.history });
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

  const without = (bets: Bets, id: BetId, amount: number): Bets => {
    const next = { ...bets };
    const left = (next[id] ?? 0) - amount;
    if (left > 0) next[id] = left;
    else delete next[id];
    return next;
  };

  /**
   * Makes a change to the table that moves `medals` (taken below nothing, given above): the table after it is written
   * down first, with the move still to be made and the table as it was, and then the medals are moved under the
   * move's receipt. Medals the bank would not move (not there to take) leave the table as it was; medals that are not
   * kept as moved are moved back, and the table goes back to what it was, so that nothing is lost and nothing is made
   * twice. A change that moves nothing is simply written. Returns why it was not made, or null.
   */
  const change = (before: Table, next: Table, medals: number): TableError | null => {
    if (medals === 0) return commit({ ...next, pending: undefined }) ? null : 'notKept';
    const id = before.id ?? newId();
    const n = (before.seq ?? 0) + 1;
    const plain: Table = { ...before };
    delete plain.pending;
    const pending: Pending = { n, medals, before: serializeTable(plain) };
    if (!commit({ ...next, id, seq: n, pending })) return 'notKept';
    const move = { game: CRAPS_GAME, round: moveRound(id, n), step: MOVE_STEP };
    const done = purse.apply({ ...move, medals });
    if (done === 'applied' && medalsKept()) {
      // Made, and the table says so: the moves before it are let go of.
      purse.forget(CRAPS_GAME, [move.round]);
      return null;
    }
    if (done === 'applied') {
      // Not kept as moved: moved back, and the move's receipt let go of with it, so that it can be made again.
      if (medals < 0) purse.give(-medals);
      else purse.take(medals);
      purse.forget(CRAPS_GAME, before.id !== undefined && before.pending ? [moveRound(before.id, before.pending.n)] : []);
    }
    commit(before);
    return done === null && medals < 0 ? 'noMedals' : 'notKept';
  };

  /** Gives medals back for bets taken off the table: the table without them, and then the medals (`change`). */
  const giveBack = (before: Table, next: Table, medals: number): boolean => change(before, next, medals) === null;

  /** Puts `amount` medals on `id`, taken from the player's medals: the table with the bet on it, and then the medals (`change`). */
  const place = (id: BetId, amount: number): Done => {
    if (!ready()) return fail('notHere');
    const error = placeError(id, amount, table.point, table.bets, purse.balance());
    if (error) return fail(error);
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
      const before = table;
      return giveBack(before, { ...table, bets: without(table.bets, lastPlaced.id, lastPlaced.amount), placed: table.placed.slice(0, -1) }, lastPlaced.amount)
        ? { ok: true, value: true }
        : fail('notKept');
    },

    /** Takes back everything put on since the roll. */
    clear(): Done {
      if (!ready()) return fail('notHere');
      if (table.placed.length === 0) return fail('nothing');
      let bets = table.bets;
      let medals = 0;
      for (const { id, amount } of table.placed) {
        bets = without(bets, id, amount);
        medals += amount;
      }
      return giveBack(table, { ...table, bets, placed: [] }, medals) ? { ok: true, value: true } : fail('notKept');
    },

    /** Takes down every bet that may come down: all of them but a Pass Line bet whose point is on. */
    takeDown(): Done {
      if (!ready()) return fail('notHere');
      const bets: Bets = {};
      let medals = 0;
      for (const id of BET_IDS) {
        const amount = table.bets[id];
        if (!amount) continue;
        if (canTakeDown(id, table.point)) medals += amount;
        else bets[id] = amount;
      }
      if (medals === 0) return fail('nothing');
      return giveBack(table, { ...table, bets, placed: table.placed.filter(({ id }) => bets[id] !== undefined) }, medals) ? { ok: true, value: true } : fail('notKept');
    },

    /** Puts back what was on the table at the last roll, where it is missing. Returns the last reason a bet could not be made, if one could not. */
    repeat(): Done {
      if (!ready()) return fail('notHere');
      let result: Done = { ok: true, value: true };
      for (const id of BET_IDS) {
        const missing = (table.lastRound[id] ?? 0) - (table.bets[id] ?? 0);
        if (missing <= 0) continue;
        const done = place(id, missing);
        if (!done.ok) result = done;
      }
      return result;
    },

    /**
     * Throws the dice: every bet is resolved, the table is written as the roll
     * leaves it, and then the medals the roll gives back are given, once. A
     * roll whose table or medals cannot be kept is not made. `seed`, if given,
     * is kept with the roll: what its throw's look was made from.
     */
    roll(dice: Dice, seed?: number): Done<Thrown> {
      if (!ready()) return fail('notHere');
      const before = table;
      const resolution = resolveRoll(before.point, before.bets, dice);
      // Every stake the table takes pays whole medals; a table that holds anything else is not played.
      if (!Number.isSafeInteger(resolution.returned) || resolution.returned < 0) return fail('step');
      const next: Table = {
        ...before,
        point: resolution.pointAfter,
        bets: resolution.bets,
        placed: [],
        lastRound: { ...before.bets },
        stats: nextStats(before.stats, resolution),
        history: [{ dice, event: resolution.event }, ...before.history].slice(0, HISTORY_LIMIT),
        last: seed === undefined ? { point: before.point, bets: before.bets, dice } : { point: before.point, bets: before.bets, dice, seed: seed >>> 0 },
      };
      if (!giveBack(before, next, resolution.returned)) return fail('notKept');
      // The medal floor hears of what the roll gave back, once, as it is given.
      if (resolution.returned > 0) floorReport(CRAPS_GAME, { won: resolution.returned, prize: { medals: resolution.returned } });
      return { ok: true, value: { resolution, before } };
    },
  };
}
