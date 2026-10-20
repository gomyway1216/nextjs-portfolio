/**
 * Cherry Blossom Carousel on the medal center's floor: played with the medals every machine of the medal center shares
 * (`MedalCenter/bank.ts`).
 *
 * ## The session
 *
 * What the machine holds for the player is written down in one record, the session: the medals in the slot (CREDIT),
 * and the machine itself, its field of medals, the medals in the air, the counter and the treasure dish. The field is
 * the machine's: a medal fed is gone, and comes back only by being pushed off the front edge. Two things move medals,
 * each under a receipt (`bank.apply`; "A machine's rounds" in bank.ts), and the session says what each will be before
 * it is made:
 *
 * - **Into the slot** (`lend`): `LEND` medals (or what is left, if fewer) taken from the player's medals into the slot,
 *   as a handful dropped into a real one. Its receipt stands for the medals being out ("Medals out" in ledger.ts): no
 *   free refill is given while any are in the slot or the machine still has something on the way to the player.
 * - **Into the tray** (`collect`, `giveBack`): medals pushed off the front edge and the counter's prizes go into the
 *   machine's tray as they come, and from the tray into the player's medals, a handful at a time; the medals left in
 *   the slot go back the same way when the player asks.
 *
 * A browser can die between any two writes. Whichever page next holds the card squares the session with the receipts:
 * a handful into the slot whose medals never went did not happen; a handful into the tray whose medals never went is
 * paid then, once.
 *
 * Everything else (a medal fed from the slot, the field moving) changes the session only, which the page writes down
 * as it plays: whenever a medal leaves the field, a spin starts or ends, and at least once a second while anything
 * moves. A page killed between those writes comes back a moment earlier, with the medals it had fed then still in the
 * slot: never a medal paid twice, and never one lost that was paid.
 *
 * Nothing here touches React or the browser: the bank and storage are passed in, so that the tests can run it against
 * a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { busy, feed as feedMachine, freshMachine, type Machine, type MachineEvent } from './engine';
import { CREDIT_MOST, LEND } from './credit';
import { packMachine, parseMachine } from './save';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const CAROUSEL_GAME = 'carousel-pusher';
/** Where a guest's session is kept on this device. An account's is under its own name (`sessionKey`). */
export const SESSION_KEY = 'carousel-pusher-session-v1';
export const sessionKey = (owner: string | null): string => (owner === null ? SESSION_KEY : `${SESSION_KEY}:${owner}`);
/** The names of the two moves of medals at the bank. */
export const LEND_STEP = 'lend';
export const PAY_STEP = 'pay';
export { LEND, CREDIT_MOST };

export type Pending = { kind: 'lend' | 'pay'; id: string; medals: number };

/** The session as it is written down. */
export interface SessionRecord {
  v: 1;
  /** Whose medals: an account's id, or null for a guest's. It says where the session is kept (`sessionKey`). */
  owner: string | null;
  /** The ledger the medals came from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals: a reset since voids the session. */
  era: number;
  /** Medals in the slot, the player's still. */
  credit: number;
  machine: Machine;
  /** A move of medals written down before it is made. */
  pending: Pending | null;
  /** The round of the last handful into the slot: its receipts say the session's medals are out. */
  lent: string | null;
  /**
   * Whether the machine was written down standing still (PlayTab.tsx `standsStill`): it opens turning on its own, as
   * it was left, rather than being played on until it is still again. Left out, or false, for one written while it moved.
   */
  still?: boolean;
}

// ── Reading a session back ──────────────────────────────────────────────────

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A round's name, as the bank takes it: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;

const parsePending = (value: unknown): Pending | null | undefined => {
  if (value === null) return null;
  if (!isRecordLike(value) || (value.kind !== 'lend' && value.kind !== 'pay') || typeof value.id !== 'string' || !ID_SHAPE.test(value.id)) return undefined;
  if (!isWhole(value.medals, 1, 1_000_000)) return undefined;
  return { kind: value.kind, id: value.id, medals: value.medals };
};

/** A session as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is trusted. */
export function parseSession(text: unknown): SessionRecord | null {
  if (typeof text !== 'string' || text.length > 200_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordLike(data) || data.v !== 1) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (!isWhole(data.credit, 0, CREDIT_MOST)) return null;
  const machine = parseMachine(data.machine);
  if (!machine) return null;
  const pending = parsePending(data.pending);
  if (pending === undefined) return null;
  if (data.lent !== null && (typeof data.lent !== 'string' || !ID_SHAPE.test(data.lent))) return null;
  if (data.still !== undefined && typeof data.still !== 'boolean') return null;
  return { v: 1, owner, ledger: data.ledger, era: data.era, credit: data.credit, machine, pending, lent: data.lent as string | null, still: data.still === true };
}

export const serializeSession = (record: SessionRecord): string => JSON.stringify({ ...record, machine: packMachine(record.machine) });

/** Whether a session has medals out: in the slot, in the tray, on a move, or on their way to the player (a medal in the air, a spin, a jackpot). */
export const live = (record: SessionRecord): boolean => record.credit > 0 || record.pending !== null || record.machine.tray > 0 || busy(record.machine);

/** A machine's seed from the ledger's name for this device and the era: the same untouched machine every time it is opened. */
export function seedFor(ledger: string, era: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${ledger}:${era}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

// ── The machine at the bank ─────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
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
  /** A name for a move of medals that no other has. */
  newId: () => string;
}

export type LendOutcome = 'lent' | 'short' | 'away' | 'unsaved';

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /** The session where storage cannot be used at all, or will not keep it: this page's memory alone keeps it. */
  let memory: string | null = null;
  let memoryKey: string | null = null;
  /**
   * Whether this table is moving medals at this moment. The bank tells everything that listens to it of each move as
   * it makes it, inside the press: a page that looked for a session to square then would be looking at its own move,
   * half made. While it is set, nothing is squared and `leftover` finds nothing.
   */
  let staking = false;

  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };

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

  /** Writes the session down: in storage, or in this page's memory where storage cannot be used. False: storage can be read but would not keep it. */
  const keep = (record: SessionRecord): boolean => {
    const key = sessionKey(record.owner);
    const text = serializeSession(record);
    if (write(key, text)) {
      memory = null;
      memoryKey = null;
      return true;
    }
    memory = text;
    memoryKey = key;
    if (read(key) !== undefined) {
      // Storage is there but full: what it holds of the session is taken away, so that a reload never finds the
      // session as it was before this write; the page plays on from memory.
      remove(key);
      return false;
    }
    return true;
  };

  const move = (record: SessionRecord, round: string, step: string, medals: number) => bank.apply({ game: CAROUSEL_GAME, round, step, medals, era: record.era });
  const moved = (round: string, step: string): boolean => bank.applied({ game: CAROUSEL_GAME, round, step });

  /**
   * The session of the medals on the table, wherever it is kept: under the player's name, or, for an account whose
   * medals were this device's guest's until the first sign-in moved them in, under the guest's (moved to the account's
   * place by the page that holds the card). Sessions from before a reset, and text that is not a session, are thrown
   * away by that page. Undefined: storage cannot be read, and memory holds none.
   */
  const find = (): { record: SessionRecord; key: string | null } | null | undefined => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const mine = holding();
    const inMemory = () => {
      if (memory === null || memoryKey !== sessionKey(owner)) return null;
      const found = parseSession(memory);
      return found && found.ledger === medals.device && found.era === medals.era ? { record: found, key: null } : null;
    };
    for (const place of owner === null ? [null] : [owner, null]) {
      const key = sessionKey(place);
      const text = read(key);
      if (text === undefined) return inMemory() ?? undefined;
      if (text === null) continue;
      const found = parseSession(text);
      if (!found) {
        if (mine && place === owner) remove(key);
        continue;
      }
      if (found.ledger !== medals.device) continue;
      if (found.era !== medals.era) {
        if (mine) remove(key);
        continue;
      }
      if (place === owner) return { record: found, key };
      if (!mine) return { record: { ...found, owner }, key };
      const adopted: SessionRecord = { ...found, owner };
      if (!write(sessionKey(owner), serializeSession(adopted))) return { record: found, key };
      remove(key);
      return { record: adopted, key: sessionKey(owner) };
    }
    return inMemory();
  };

  /** Medals into the player's medals under their receipt, once; the floor hears of the medals won. */
  const pay = (record: SessionRecord, pending: Pending): void => {
    if (move(record, pending.id, PAY_STEP, pending.medals) === 'applied') floorReport(CAROUSEL_GAME, { won: pending.medals });
  };

  /** Lets go of the medals out, once nothing is left of the session's: nothing in the slot, the tray, or on its way. */
  const settleIfDone = (record: SessionRecord): SessionRecord => {
    if (live(record) || record.lent === null) return record;
    const done = { ...record, lent: null };
    keep(done);
    bank.settle(CAROUSEL_GAME);
    bank.forget(CAROUSEL_GAME);
    return done;
  };

  /** Squares a session found with its receipts, by the page that holds the card. Returns the session as it stands. */
  const square = (found: SessionRecord): SessionRecord => {
    let record = found;
    const pending = record.pending;
    if (pending?.kind === 'lend') {
      // The session was written down before the medals went: they are in the slot only if they went.
      const lent = moved(pending.id, LEND_STEP);
      record = { ...record, pending: null, credit: record.credit + (lent ? pending.medals : 0), lent: lent ? pending.id : record.lent };
      keep(record);
      if (lent) bank.forget(CAROUSEL_GAME, [pending.id]);
    } else if (pending?.kind === 'pay') {
      // The medals came out of the tray (or the slot) before they went in: they are owed, once.
      if (!moved(pending.id, PAY_STEP)) pay(record, pending);
      record = { ...record, pending: null };
      keep(record);
      bank.forget(CAROUSEL_GAME, record.lent ? [record.lent] : []);
    }
    return settleIfDone(record);
  };

  /** The session as it stands, squared when this page holds the card; null for none. */
  const look = (): SessionRecord | null => {
    const found = find();
    if (!found) return null;
    if (!holding() || staking) return found.record;
    staking = true;
    try {
      return square(found.record);
    } finally {
      staking = false;
    }
  };

  /** A session for the medals on the table: the one there is, or a new one with an untouched machine. */
  const current = (): SessionRecord | null => {
    const medals = onTable();
    if (!medals) return null;
    return look() ?? { v: 1, owner: bank.owner(), ledger: medals.device, era: medals.era, credit: 0, machine: freshMachine(seedFor(medals.device, medals.era)), pending: null, lent: null };
  };

  /** Medals from the tray (or the slot) into the player's medals: written down first, then moved, then written as done. */
  const payOut = (record: SessionRecord, medals: number, from: 'tray' | 'credit'): SessionRecord | null => {
    if (medals <= 0) return record;
    const id = newId();
    staking = true;
    try {
      const pending: Pending = { kind: 'pay', id, medals };
      const asked: SessionRecord = { ...record, credit: from === 'credit' ? record.credit - medals : record.credit, pending };
      if (from === 'tray') asked.machine.tray -= medals;
      if (!keep(asked)) {
        if (from === 'tray') asked.machine.tray += medals;
        return null;
      }
      pay(asked, pending);
      const done: SessionRecord = { ...asked, pending: null };
      keep(done);
      bank.forget(CAROUSEL_GAME, done.lent ? [done.lent] : []);
      return settleIfDone(done);
    } finally {
      staking = false;
    }
  };

  return {
    /** The session as it stands, squared with its receipts by the page that holds the card; null before the medals are read. */
    session(): SessionRecord | null {
      if (!bank.getState().loaded) return null;
      return current();
    },

    /**
     * A session left half-made by a page that died between two writes, squared now (a handful into the slot made or
     * undone, a handful into the tray paid once), by the page that holds the card. Null when there is none, and while
     * this table is moving medals itself.
     */
    leftover(): SessionRecord | null {
      if (staking || !holding() || !bank.getState().loaded) return null;
      const found = find();
      if (!found || !found.record.pending) return null;
      return look();
    },

    /**
     * A handful into the slot: `LEND` medals, or what is left if fewer. Nothing is taken when it cannot be: the card is
     * not here, no medals, or storage that can be read will not keep the session. Returns the session as it stands.
     */
    lend(record: SessionRecord): { outcome: LendOutcome; record: SessionRecord } {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null || record.pending) return { outcome: 'away', record };
      const handful = Math.min(LEND, Math.max(0, Math.floor(bank.balance())), CREDIT_MOST - record.credit);
      if (handful < 1) return { outcome: 'short', record };
      const id = newId();
      staking = true;
      try {
        const asked: SessionRecord = { ...record, pending: { kind: 'lend', id, medals: handful } };
        if (!keep(asked)) return { outcome: 'unsaved', record };
        if (move(asked, id, LEND_STEP, -handful) !== 'applied') {
          keep(record);
          return { outcome: 'short', record };
        }
        const done: SessionRecord = { ...asked, pending: null, credit: asked.credit + handful, lent: id };
        keep(done);
        // Every handful before this one is over: only this one's receipts say the session's medals are out.
        bank.forget(CAROUSEL_GAME, [id]);
        return { outcome: 'lent', record: done };
      } finally {
        staking = false;
      }
    },

    /**
     * A medal from the slot into the machine, with the press's three random numbers (where it comes down, and a number
     * kept for a coming spin). The session is changed in place; the page writes it down as it plays. False when there
     * is no medal in the slot, or the session is not this page's to play.
     */
    feed(record: SessionRecord, u: number, v: number, ticket: number, events?: MachineEvent[]): boolean {
      if (!holding() || record.pending || record.credit < 1) return false;
      record.credit -= 1;
      feedMachine(record.machine, u, v, ticket, events);
      floorReport(CAROUSEL_GAME, { played: 1 });
      return true;
    },

    /** The machine's tray into the player's medals. Returns the session as it stands, or null when it could not be written. */
    collect(record: SessionRecord): SessionRecord | null {
      if (!holding() || record.pending) return null;
      return payOut(record, record.machine.tray, 'tray');
    },

    /** The medals left in the slot, back into the player's medals. */
    giveBack(record: SessionRecord): SessionRecord | null {
      if (!holding() || record.pending) return null;
      return payOut(record, record.credit, 'credit');
    },

    /** Writes the session down as it stands, and lets go of the medals out once nothing is left of them. */
    save(record: SessionRecord): SessionRecord {
      if (!holding() || record.pending) return record;
      keep(record);
      return settleIfDone(record);
    },

    /** Forgets the session kept for the player on the table: the medals have been reset. */
    clear(): void {
      remove(sessionKey(bank.owner()));
      memory = null;
      memoryKey = null;
    },
  };
}

/**
 * A name for a move of medals: the time and a random part, in letters and digits. The page takes the random part from
 * the browser's crypto, not from Math.random, which the presses' draws have to themselves.
 */
export const roundId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
