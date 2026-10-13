/**
 * The machine, as the thing that is kept on the device and on the account.
 *
 * account.ts keeps a text in step between the two and knows nothing about
 * machines. This says what is the machine's own: where it lives on the
 * device, the key it has on the account, how to tell that a text is a machine
 * (it is `restore` that decides, as for any save), when a machine has changed
 * enough to be worth sending, and that of two copies the one played last wins.
 *
 * None of it depends on the version of the save. Whatever `serialize` writes
 * is what travels, and whatever comes back is handed to `restore`: a copy
 * written by a newer version of the game than this one fails there, and a
 * copy on the account that fails is left exactly as it is (see `decide`).
 */

import { createSync, decide, type AccountStore, type Slots, type Status, type Sync } from './account';
import type { Session } from './session';
import { STORAGE_KEY, restore, serialize } from './storage';

/** The key the machine has among a player's saves on the account. */
export const MACHINE_GAME_KEY = 'medal-pusher';

/**
 * The machine's books: the purse, the counters, the jackpot, the spins held,
 * as one short text. A machine is worth sending again when these have
 * changed. The pusher going to and fro, medals settling and an arm being
 * turned change the field and not the books, so a machine that is only being
 * watched is not sent to the account again and again.
 */
export function booksOf(session: Session): string {
  const { machine: _machine, spin: _spin, bonus: _bonus, roulette: _roulette, ...numbers } = session;
  return JSON.stringify(numbers);
}

/** The same from a save's text, for a copy that is not on the table. A text that is no save has no books: it is its own. */
export function booksOfText(text: string): string {
  try {
    const save = JSON.parse(text) as { session?: unknown } | null;
    return save && typeof save === 'object' && 'session' in save ? JSON.stringify(save.session) : text;
  } catch {
    return text;
  }
}

/** A mark no other copy will carry: sixteen hex digits from the browser's own generator. */
export function newMark(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface MachineKeeper {
  /** The account's store, or null where the page has none to give: every machine is then a guest's. */
  store: AccountStore | null;
  /** The browser's storage. Getting it may throw. */
  slots: () => Slots;
  /** The machine on the table, if there is one. */
  session: () => Session | null;
  /** Asked when the table needs another machine put on it: `open` then gives it. */
  reopen: () => void;
  onStatus: (status: Status) => void;
  /** This device's clock in milliseconds, and a mark for each copy sent. They are the browser's own unless a test gives others. */
  now?: () => number;
  mark?: () => string;
}

/** Keeps the machine on the table in step with the device and, for a player who is signed in, with the account. */
export function keepMachine({ store, slots, session, reopen, onStatus, now = Date.now, mark = newMark }: MachineKeeper): Sync {
  // The text and the books of the machine as it stands, worked out once for all the questions one save asks.
  let seen: { text: string; books: string } | null = null;
  return createSync({
    kept: {
      slot: STORAGE_KEY,
      current() {
        const machine = session();
        seen = machine ? { text: serialize(machine), books: booksOf(machine) } : null;
        return seen ? seen.text : null;
      },
      reads: (text) => restore(text, 1) !== null,
      print: (text) => (seen && seen.text === text ? seen.books : booksOfText(text)),
      settle: decide,
      reopen,
    },
    store,
    slots,
    now,
    mark,
    onStatus,
  });
}
