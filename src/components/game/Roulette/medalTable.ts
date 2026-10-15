/**
 * The roulette table on the medal center's floor: the player bets their
 * medals, the ones every game of the medal center plays with
 * (`MedalCenter/bank.ts`), and wins them back into the same medals.
 *
 * ## A spin, once
 *
 * Bets lie on the felt and are not taken until SPIN is pressed. Then the
 * number is drawn, the spin is written down on this device (`spinKey`) and
 * the medals bet are taken, in that order: the spin is on record before its
 * stake is gone. Its winnings are known from that moment (the number is
 * drawn), and they go into the medals once, whichever comes first:
 *
 * - the ball stops on this page;
 * - the page gives up the card (it is hidden, it is left or reloaded, or
 *   another tab needs the medals): the spin is settled then, before the card
 *   goes, so that a page that is closed with the ball still rolling has paid
 *   what it owes;
 * - the page was killed before it could do either: the next page that holds
 *   the card for the same player finds the spin on record, unpaid, and
 *   finishes it. The wheel spins again to the same number and pays.
 *
 * So a spin is never refunded. Its number was drawn when it was bet, as on a
 * real wheel once the ball is in the bowl, and a reload is no way to take
 * back a bet that is going to lose. A spin on record is paid at most once:
 * it is marked paid before its winnings go in, and only the page that holds
 * the card pays one.
 *
 * A spin staked before the medals were reset at the medal center is not
 * paid after it: the reset threw away every medal there was, its stake with
 * them.
 *
 * ## The table's limits
 *
 * At least one medal a spot and at most `SPOT_MAX` (99) on any one spot, the
 * two-digit bet a medal machine's spot shows. A tap adds `BET_STEPS` medals,
 * or as many as still fit on the spot and in the player's medals.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import { payoutMultiplier, type Bet } from './engine';

/** The game's name at the medal center: its seat, and its restarts after a reset. */
export const ROULETTE_GAME = 'roulette';
/** Where a guest's spin is written down on this device. An account's is under its own name (`spinKey`). */
export const SPIN_KEY = 'roulette-spin-v1';
export const spinKey = (owner: string | null): string => (owner === null ? SPIN_KEY : `${SPIN_KEY}:${owner}`);
/** Whether the one-time note that roulette now plays with the medal center's medals has been put away. */
export const NOTICE_KEY = 'roulette-medals-notice-v1';

/** The fewest medals a bet can be. */
export const MIN_BET = 1;
/** The most medals on one spot. */
export const SPOT_MAX = 99;
/** How many medals one tap on the felt adds. */
export const BET_STEPS = [1, 5, 10, 50] as const;

export interface PlacedBet {
  bet: Bet;
  amount: number;
}

/** A spin on record: what was bet, on what, by whom, the number drawn, and whether its winnings are in. */
export interface SpinRecord {
  v: 1;
  id: string;
  /** Whose medals were bet: an account's id, or null for a guest's. */
  owner: string | null;
  /** The era of the medals when it was bet: a reset since voids it. */
  era: number;
  result: number;
  bets: PlacedBet[];
  wagered: number;
  /** The medals it wins back, its bets included (0 when nothing won). */
  won: number;
  paid: boolean;
}

/** A spin as the page that holds it knows it. */
export interface Staked {
  record: SpinRecord;
  /** Whether it was written down on this device. A spin that could not be is paid from what the page knows. */
  stored: boolean;
  /** Whether it has been settled: paid, or found paid by another page. */
  paid: boolean;
  /** Whether a reset came between its stake and its end: it pays nothing. */
  void: boolean;
}

/** How one spin ended when it was settled. */
export type Settled = 'paid' | 'already' | 'void' | 'later';

/** The medals winnings of a set of bets when `result` comes up, the bets that win included. */
export function winningsOf(bets: readonly PlacedBet[], result: number): number {
  let won = 0;
  for (const { bet, amount } of bets) won += amount * payoutMultiplier(bet, result);
  return won;
}

/** How many medals one tap of `step` adds to a spot that holds `onSpot`, when `medalsLeft` are not on the felt yet. */
export const tapAmount = (step: number, onSpot: number, medalsLeft: number): number =>
  Math.max(0, Math.min(step, SPOT_MAX - onSpot, medalsLeft));

// ── Reading a spin back ─────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

/** Numbers 1–36, each once, as many as `count`. */
const isNumbers = (value: unknown, count: number): value is number[] =>
  Array.isArray(value) && value.length === count && value.every((n) => isWhole(n, 1, 36)) && new Set(value).size === count;

const EVEN_MONEY = new Set(['red', 'black', 'odd', 'even', 'low', 'high']);
const SPREADS: Record<string, number> = { split: 2, street: 3, corner: 4, line: 6 };

/** A bet as it comes back out of storage, or null when it is not one this table takes. */
export function readBet(value: unknown): Bet | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  const { kind } = value;
  if (EVEN_MONEY.has(kind)) return { kind } as Bet;
  if (kind === 'dozen' || kind === 'column') return isWhole(value.which, 1, 3) ? ({ kind, which: value.which } as Bet) : null;
  if (kind === 'straight') return isWhole(value.number, 0, 36) ? { kind, number: value.number } : null;
  const count = SPREADS[kind];
  return count !== undefined && isNumbers(value.numbers, count) ? ({ kind, numbers: [...value.numbers] } as Bet) : null;
}

/** A spin as it comes back out of storage, or null when the text is not one. Nothing in it is trusted: it is checked field by field. */
export function parseSpin(text: unknown): SpinRecord | null {
  if (typeof text !== 'string' || text.length > 64_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== 1 || typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 64) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || !isWhole(data.era, 0, 1_000_000) || !isWhole(data.result, 0, 36) || typeof data.paid !== 'boolean' || !Array.isArray(data.bets)) return null;
  const bets: PlacedBet[] = [];
  for (const placed of data.bets) {
    const bet = isRecord(placed) ? readBet(placed.bet) : null;
    if (!bet || !isRecord(placed) || !isWhole(placed.amount, MIN_BET, SPOT_MAX)) return null;
    bets.push({ bet, amount: placed.amount });
  }
  const wagered = bets.reduce((sum, { amount }) => sum + amount, 0);
  // What it bet and what it won are worked out again: a record that says otherwise is not one this table wrote.
  if (bets.length === 0 || data.wagered !== wagered || data.won !== winningsOf(bets, data.result)) return null;
  return { v: 1, id: data.id, owner, era: data.era, result: data.result, bets, wagered, won: data.won, paid: data.paid };
}

export const serializeSpin = (record: SpinRecord): string => JSON.stringify(record);

// ── The table ───────────────────────────────────────────────────────────────

/** What the table needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  take(medals: number): boolean;
  give(medals: number): boolean;
  getState(): { loaded: boolean; ledger: { era: number } | null };
  restartDue(game: string): boolean;
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
  /** A name for a spin that no other spin has. */
  newId: () => string;
}

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  const era = (): number | null => bank.getState().ledger?.era ?? null;

  /** The text under `key`, or undefined when storage cannot be read. */
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

  /** The spin on record for the player whose medals are on the table, read back; null for none, or for text that is not one. */
  const onRecord = (): SpinRecord | null => {
    const text = read(spinKey(bank.owner()));
    return typeof text === 'string' ? parseSpin(text) : null;
  };

  /** Whether a spin was bet with the medals that are on the table now: the same player's, and no reset since. */
  const current = (record: SpinRecord): boolean => record.owner === bank.owner() && record.era === era();

  return {
    /**
     * Bets the medals on the felt on a spin whose number has been drawn: the
     * spin is written down, then its medals are taken. Null, with nothing
     * taken, when they cannot be: the card is not here, the medals are not
     * enough, or a spin of this player's is still to be finished.
     */
    stake(bets: readonly PlacedBet[], result: number): Staked | null {
      const ledgerEra = era();
      if (!holding() || !bank.getState().loaded || ledgerEra === null) return null;
      const placed = bets.filter(({ amount }) => amount > 0).map(({ bet, amount }) => ({ bet, amount }));
      const wagered = placed.reduce((sum, { amount }) => sum + amount, 0);
      if (wagered <= 0 || placed.some(({ amount }) => !Number.isSafeInteger(amount) || amount > SPOT_MAX) || bank.balance() < wagered) return null;
      const waiting = onRecord();
      if (waiting && !waiting.paid && current(waiting)) return null;
      const owner = bank.owner();
      const record: SpinRecord = { v: 1, id: newId(), owner, era: ledgerEra, result, bets: placed, wagered, won: winningsOf(placed, result), paid: false };
      const stored = write(spinKey(owner), serializeSpin(record));
      if (!bank.take(wagered)) {
        if (stored) remove(spinKey(owner));
        return null;
      }
      return { record, stored, paid: false, void: false };
    },

    /**
     * Puts a spin's winnings into the medals, once. `later`: not now (the
     * card is not here, or the medals on the table are another player's),
     * and the spin stays on record to be finished. `already`: another page
     * settled it. `void`: the medals were reset since it was bet.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const key = spinKey(record.owner);
      if (record.era !== era() && era() !== null) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseSpin(there)?.id === record.id) remove(key);
        return 'void';
      }
      if (!holding() || record.owner !== bank.owner()) return 'later';
      const there = read(key);
      if (there !== undefined && staked.stored) {
        const found = there === null ? null : parseSpin(there);
        // Not on record any more, or another spin in its place: another page has settled it, or a reset cleared it.
        if (!found || found.id !== record.id || found.paid) {
          staked.paid = true;
          return 'already';
        }
      }
      // Marked paid before the medals go in: a page that dies between the two leaves a spin that is never paid twice.
      if (!write(key, serializeSpin({ ...record, paid: true }))) remove(key);
      staked.paid = true;
      if (record.won > 0) bank.give(record.won);
      return 'paid';
    },

    /**
     * A spin this device left unfinished for the player whose medals are on
     * the table, which the page that holds the card now is to finish: null
     * when there is none. One from before a reset is thrown away.
     */
    leftover(): SpinRecord | null {
      if (!holding() || !bank.getState().loaded) return null;
      const key = spinKey(bank.owner());
      const text = read(key);
      if (typeof text !== 'string') return null;
      const record = parseSpin(text);
      if (!record) {
        // Text that is not a spin this table can read: an unreadable copy, not a stake, and not one to keep.
        remove(key);
        return null;
      }
      if (record.paid) return null;
      if (!current(record) || bank.restartDue(ROULETTE_GAME)) {
        remove(key);
        return null;
      }
      return record;
    },

    /** The last spin this player's medals were settled on, for the table to show: null when there is none to show. */
    last(): SpinRecord | null {
      const record = onRecord();
      return record && record.paid && current(record) ? record : null;
    },

    /** Forgets the spin on record for the player on the table: the medals have been reset. */
    clear(): void {
      remove(spinKey(bank.owner()));
    },
  };
}

/** A name for a spin: the time and a random part, in letters and digits. */
export const spinId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
