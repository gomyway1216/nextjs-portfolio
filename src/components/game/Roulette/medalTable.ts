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
 * back a bet that is going to lose. A spin on record is paid exactly once,
 * and only by the page that holds the card.
 *
 * The spin's record and the medals are two writes, and the browser can die
 * between any two writes. So its stake and its winnings each go into the
 * medals under a receipt (`bank.apply`; "A machine's rounds" in bank.ts): a
 * spin on record whose stake never went in never happened, and is thrown
 * away with nothing paid; a spin marked paid whose winnings never went in
 * has them put in, once. A spin's receipts are let go of when the next spin
 * is bet. A spin written down before there were receipts is taken at its
 * word: its stake was taken.
 *
 * A spin belongs to the medals it was bet from: the player's ledger on this
 * device (known by the name the ledger keeps for this device, which goes with
 * it when a guest's medals become an account's at the first sign-in) in the
 * era it was bet in. It is paid into those medals and no others: not into
 * another player's that are on the table meanwhile (it waits for its own),
 * and not after the medals were reset at the medal center (the reset threw
 * away every medal there was, its stake with them).
 *
 * Its stake is on record only if the bank could write the stake down too:
 * where this browser's storage refuses the bank's write, the spin is played
 * from memory alone, so that a page that dies then cannot come back to a
 * spin whose medals were never taken. A credit the bank could not write yet
 * is still in its medals in memory, and goes to storage with the bank's next
 * write.
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

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
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
  /** Whose medals were bet: an account's id, or null for a guest's. It says where the spin is kept (`spinKey`). */
  owner: string | null;
  /** The ledger the medals were bet from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was bet: a reset since voids it. */
  era: number;
  result: number;
  bets: PlacedBet[];
  wagered: number;
  /** The medals it wins back, its bets included (0 when nothing won). */
  won: number;
  paid: boolean;
  /**
   * Whether its stake and its winnings go in under receipts (`bank.apply`): its stake was taken only if the bank holds
   * the stake's receipt. A spin written before there were receipts has none, and its stake was taken.
   */
  receipts?: true;
}

/** The names of a spin's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

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

/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;

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
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000) || !isWhole(data.result, 0, 36) || typeof data.paid !== 'boolean' || !Array.isArray(data.bets)) return null;
  const bets: PlacedBet[] = [];
  for (const placed of data.bets) {
    const bet = isRecord(placed) ? readBet(placed.bet) : null;
    if (!bet || !isRecord(placed) || !isWhole(placed.amount, MIN_BET, SPOT_MAX)) return null;
    bets.push({ bet, amount: placed.amount });
  }
  const wagered = bets.reduce((sum, { amount }) => sum + amount, 0);
  // What it bet and what it won are worked out again: a record that says otherwise is not one this table wrote.
  if (bets.length === 0 || data.wagered !== wagered || data.won !== winningsOf(bets, data.result)) return null;
  if (data.receipts !== undefined && data.receipts !== true) return null;
  const spin: SpinRecord = { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, result: data.result, bets, wagered, won: data.won, paid: data.paid };
  if (data.receipts) spin.receipts = true;
  return spin;
}

export const serializeSpin = (record: SpinRecord): string => JSON.stringify(record);

// ── The table ───────────────────────────────────────────────────────────────

/** What the table needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  take(medals: number): boolean;
  give(medals: number): boolean;
  /** `kept`: whether the bank's last write to this device's storage took. */
  getState(): { loaded: boolean; kept: boolean; ledger: { era: number; device: string } | null };
  restartDue(game: string): boolean;
  /** A move of a spin's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every spin but those in `keep` has no medals out any more: no refill is given while one does. */
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
  /** A name for a spin that no other spin has. */
  newId: () => string;
}

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /** The medals on the table: which ledger, in which era. */
  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };

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

  /** The spin kept for a player, read back; null for none, or for text that is not one. */
  const keptFor = (owner: string | null): SpinRecord | null => {
    const text = read(spinKey(owner));
    return typeof text === 'string' ? parseSpin(text) : null;
  };

  /** A move of a spin's medals, under its receipt. */
  const move = (record: SpinRecord, step: string, medals: number) => bank.apply({ game: ROULETTE_GAME, round: record.id, step, medals, era: record.era });
  /** A spin's winnings, in under their receipt; the medal floor hears of them once, as they go in. */
  const payWinnings = (record: SpinRecord) => {
    if (move(record, PAY_STEP, record.won) === 'applied') floorReport(ROULETTE_GAME, { won: record.won, prize: { medals: record.won } });
  };
  /** Whether a spin's stake went in: the bank holds its receipt until the spin is paid. A spin from before receipts is taken at its word. */
  const stakeIn = (record: SpinRecord): boolean => !record.receipts || bank.applied({ game: ROULETTE_GAME, round: record.id, step: STAKE_STEP });

  /** Whether a spin was bet from the medals on the table now: the same ledger, in the same era. */
  const current = (record: SpinRecord): boolean => {
    const medals = onTable();
    return medals !== null && record.ledger === medals.device && record.era === medals.era;
  };

  /**
   * A spin of the medals on the table that is still to be finished, wherever
   * it is kept: under the player's name, or, for an account whose medals were
   * a guest's on this device until the first sign-in moved them in, under the
   * guest's, where it was bet. Such a spin is moved to the account's place.
   * One bet from these medals before a reset is thrown away. Spins of other
   * medals are left as they are.
   */
  const unfinished = (): SpinRecord | null => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const record = keptFor(place);
      if (!record || record.paid || record.ledger !== medals.device) continue;
      // From before a reset, or written down by a page that died before its stake went in: it never was, and is thrown away.
      if (record.era !== medals.era || bank.restartDue(ROULETTE_GAME) || !stakeIn(record)) {
        remove(spinKey(place));
        continue;
      }
      if (place === owner) return record;
      const moved: SpinRecord = { ...record, owner };
      if (!write(spinKey(owner), serializeSpin(moved))) return record;
      remove(spinKey(place));
      return moved;
    }
    return null;
  };

  return {
    /**
     * Bets the medals on the felt on a spin whose number has been drawn: the
     * spin is written down, then its medals are taken. Null, with nothing
     * taken, when they cannot be: the card is not here, the medals are not
     * enough, or a spin of these medals is still to be finished.
     */
    stake(bets: readonly PlacedBet[], result: number): Staked | null {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null) return null;
      const placed = bets.filter(({ amount }) => amount > 0).map(({ bet, amount }) => ({ bet, amount }));
      const wagered = placed.reduce((sum, { amount }) => sum + amount, 0);
      if (wagered <= 0 || placed.some(({ amount }) => !Number.isSafeInteger(amount) || amount > SPOT_MAX) || bank.balance() < wagered) return null;
      if (unfinished()) return null;
      const owner = bank.owner();
      const key = spinKey(owner);
      const record: SpinRecord = { v: 1, id: newId(), owner, ledger: medals.device, era: medals.era, result, bets: placed, wagered, won: winningsOf(placed, result), paid: false, receipts: true };
      let stored = write(key, serializeSpin(record));
      if (move(record, STAKE_STEP, -wagered) !== 'applied') {
        if (stored) remove(key);
        return null;
      }
      // The spin before this one is no longer on record: nothing will look at its receipts again.
      bank.forget(ROULETTE_GAME, [record.id]);
      // The bank could not write the stake down: the spin is not left on record either, or a page that dies now would
      // come back to a spin whose medals were never taken. It is played from memory, as the bank's medals are.
      if (stored && !bank.getState().kept) stored = !remove(key);
      return { record, stored, paid: false, void: false };
    },

    /**
     * Puts a spin's winnings into the medals, once. `later`: not now (the
     * card is not here, or the medals on the table are not the ones it was
     * bet from), and the spin stays on record to be finished. `already`:
     * another page settled it. `void`: the medals were reset since it was
     * bet.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      // Another player's medals, or none yet: the spin waits for its own, untouched.
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = spinKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseSpin(there)?.id === record.id) remove(key);
        return 'void';
      }
      if (!holding()) return 'later';
      const there = read(key);
      if (there !== undefined && staked.stored) {
        const found = there === null ? null : parseSpin(there);
        // Not on record any more, or another spin in its place: another page has settled it, or a reset cleared it.
        if (!found || found.id !== record.id || found.paid) {
          staked.paid = true;
          return 'already';
        }
      }
      // Its stake never went in (the page that bet it died first): it never was, and pays nothing.
      if (!stakeIn(record)) {
        staked.void = true;
        staked.paid = true;
        if (typeof there === 'string' && parseSpin(there)?.id === record.id) remove(key);
        return 'void';
      }
      // Marked paid first, so that nothing that hears of the medals moving (the page looks at the table whenever they
      // do) finds the spin still to finish; then its winnings go in under their receipt. A page that dies between the
      // two leaves a spin marked paid whose winnings the next page that holds the card puts in, once (`leftover`).
      // Marked paid under receipts whichever way it was bet: a spin bet before receipts has its winnings checked for too.
      if (!write(key, serializeSpin({ ...record, paid: true, receipts: true }))) remove(key);
      staked.paid = true;
      if (record.won > 0) payWinnings(record);
      // The ball has stopped: none of the spin's medals are out any more, a spin lost included, which pays nothing.
      bank.settle(ROULETTE_GAME);
      return 'paid';
    },

    /**
     * A spin this device left unfinished with the medals on the table, which
     * the page that holds the card now is to finish: null when there is none.
     */
    leftover(): SpinRecord | null {
      if (!holding() || !bank.getState().loaded) return null;
      const key = spinKey(bank.owner());
      const text = read(key);
      // Text that is not a spin this table can read: an unreadable copy, not a stake, and not one to keep.
      if (typeof text === 'string' && !parseSpin(text)) remove(key);
      // Marked paid, and the page died before its winnings went in: they go in now, once.
      const kept = typeof text === 'string' ? parseSpin(text) : null;
      if (kept && kept.paid && kept.receipts && kept.won > 0 && current(kept) && !bank.applied({ game: ROULETTE_GAME, round: kept.id, step: PAY_STEP })) {
        payWinnings(kept);
      }
      const left = unfinished();
      // Only a spin still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(ROULETTE_GAME, left ? [left.id] : []);
      return left;
    },

    /** The last spin these medals were settled on, for the table to show: null when there is none to show. */
    last(): SpinRecord | null {
      const record = keptFor(bank.owner());
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
