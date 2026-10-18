/**
 * The big wheel on the medal center's floor: the player puts their medals on
 * the betting board, the medals every game of the medal center plays with
 * (`MedalCenter/bank.ts`), and is paid what the wheel brings back into the
 * same medals. It keeps a spin the way the roulette table keeps one
 * (Roulette/medalTable.ts), and for the same reasons.
 *
 * ## A spin, once
 *
 * Medals lie on the board and are not taken until SPIN is pressed. Then the
 * spin is drawn (where the wheel stops, and for a stop on BONUS the lamp and
 * the second chance), it is written down on this device (`spinKey`) and the
 * medals on the board are taken, in that order: the spin is on record before
 * its stake is gone. What it wins back is known from that moment, and it goes
 * into the medals once, whichever comes first:
 *
 * - the wheel stops on this page (or the player skips to the end);
 * - the page gives up the card (it is hidden, left or reloaded, or another
 *   tab needs the medals): the spin is settled then, before the card goes;
 * - the page was killed before it could do either: the next page that holds
 *   the card for the same player finds the spin on record, unpaid, and
 *   finishes it. The wheel spins again to the same stop and pays.
 *
 * So a spin is never refunded: where the wheel stops was drawn when the
 * medals went down, and a reload is no way to take back medals on a number
 * that is going to lose. A spin on record is paid exactly once, and only by
 * the page that holds the card.
 *
 * The spin's record and the medals are two writes, and the browser can die
 * between any two writes. So its stake and its winnings each go into the
 * medals under a receipt (`bank.apply`; "A machine's rounds" in bank.ts): a
 * spin on record whose stake never went in never happened, and is thrown away
 * with nothing paid; a spin marked paid whose winnings never went in has them
 * put in, once. A spin's receipts are let go of when the next spin is bet.
 *
 * A spin belongs to the medals it was bet from: the player's ledger on this
 * device in the era it was bet in. It is paid into those medals and no others
 * (not another player's that are on the table meanwhile, and not after the
 * medals were reset at the medal center). Where this browser's storage
 * refuses the bank's write, the spin is played from memory alone.
 *
 * ## The limits
 *
 * At least one medal a number and at most `SPOT_MAX` (99) on any one, the two
 * digits a spot's lamp shows. A tap adds `BET_STEPS` medals, or as many as
 * still fit on the spot and in the player's medals.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { SPOTS, isSpin, isSpot, labelOf, winOf, type Bets, type Spin, type Spot } from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const BIG_WHEEL_GAME = 'big-wheel';
/** Where a guest's spin is written down on this device. An account's is under its own name (`spinKey`). */
export const SPIN_KEY = 'big-wheel-spin-v1';
export const spinKey = (owner: string | null): string => (owner === null ? SPIN_KEY : `${SPIN_KEY}:${owner}`);

/** The fewest medals a number can carry, and the most. */
export const MIN_BET = 1;
export const SPOT_MAX = 99;
/** How many medals one tap on a number adds. */
export const BET_STEPS = [1, 5, 10] as const;
/** The most medals a spin can take: every number at its most. */
export const SPIN_STAKE_MOST = SPOTS.length * SPOT_MAX;

/** Medals on one number of the board. */
export interface PlacedBet {
  spot: Spot;
  amount: number;
}

/** A spin on record: what was bet, by whom, how the wheel was drawn to stop, and whether its winnings are in. */
export interface SpinRecord {
  v: 1;
  id: string;
  /** Whose medals were bet: an account's id, or null for a guest's. It says where the spin is kept (`spinKey`). */
  owner: string | null;
  /** The ledger the medals were bet from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was bet: a reset since voids it. */
  era: number;
  spin: Spin;
  bets: PlacedBet[];
  wagered: number;
  /** The medals it wins back, the medals on the winning number included (0 when nothing won). */
  won: number;
  paid: boolean;
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

/** The board's medals, number by number. */
export const betsOf = (placed: readonly PlacedBet[]): Bets => Object.fromEntries(placed.map(({ spot, amount }) => [spot, amount])) as Bets;

/** What a set of bets wins back on a spin, the medals on the winning number included. */
export const winningsOf = (placed: readonly PlacedBet[], spin: Spin): number => winOf(betsOf(placed), spin);

/** How many medals one tap of `step` adds to a number that holds `onSpot`, when `medalsLeft` are not on the board yet. */
export const tapAmount = (step: number, onSpot: number, medalsLeft: number): number => Math.max(0, Math.min(step, SPOT_MAX - onSpot, medalsLeft));

// ── Reading a spin back ─────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;

/** A bet as it comes back out of storage, or null when it is not one this board takes. */
export function readBet(value: unknown): PlacedBet | null {
  if (!isRecord(value) || !isSpot(value.spot) || !isWhole(value.amount, MIN_BET, SPOT_MAX)) return null;
  return { spot: value.spot, amount: value.amount };
}

/** A spin as it comes back out of storage, or null when the text is not one. Nothing in it is trusted: it is checked field by field. */
export function parseSpinRecord(text: unknown): SpinRecord | null {
  if (typeof text !== 'string' || text.length > 8_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== 1 || typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 64) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (typeof data.paid !== 'boolean' || !isSpin(data.spin) || !Array.isArray(data.bets)) return null;
  const bets: PlacedBet[] = [];
  for (const placed of data.bets) {
    const bet = readBet(placed);
    if (!bet) return null;
    bets.push(bet);
  }
  const spin: Spin = { stop: data.spin.stop, lamp: data.spin.lamp, second: data.spin.second };
  const wagered = bets.reduce((sum, { amount }) => sum + amount, 0);
  // What it bet and what it won are worked out again: a record that says otherwise is not one this machine wrote.
  if (bets.length === 0 || new Set(bets.map(({ spot }) => spot)).size !== bets.length || data.wagered !== wagered || data.won !== winningsOf(bets, spin)) return null;
  return { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, spin, bets, wagered, won: data.won as number, paid: data.paid };
}

export const serializeSpinRecord = (record: SpinRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
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
    return typeof text === 'string' ? parseSpinRecord(text) : null;
  };

  /** A move of a spin's medals, under its receipt. */
  const move = (record: SpinRecord, step: string, medals: number) => bank.apply({ game: BIG_WHEEL_GAME, round: record.id, step, medals, era: record.era });
  /** A spin's winnings, in under their receipt; the medal floor hears of them once, as they go in, a second chance's by name. */
  const payWinnings = (record: SpinRecord) => {
    if (move(record, PAY_STEP, record.won) !== 'applied') return;
    const label = labelOf(record.spin, record.won);
    floorReport(BIG_WHEEL_GAME, { won: record.won, prize: label ? { medals: record.won, label } : { medals: record.won } });
  };
  /** Whether a spin's stake went in: the bank holds its receipt until the spin is let go of. */
  const stakeIn = (record: SpinRecord): boolean => bank.applied({ game: BIG_WHEEL_GAME, round: record.id, step: STAKE_STEP });

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
   * One bet from these medals before a reset, or whose stake never went in,
   * is thrown away. Spins of other medals are left as they are.
   */
  const unfinished = (): SpinRecord | null => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const record = keptFor(place);
      if (!record || record.paid || record.ledger !== medals.device) continue;
      if (record.era !== medals.era || bank.restartDue(BIG_WHEEL_GAME) || !stakeIn(record)) {
        remove(spinKey(place));
        continue;
      }
      if (place === owner) return record;
      const moved: SpinRecord = { ...record, owner };
      if (!write(spinKey(owner), serializeSpinRecord(moved))) return record;
      remove(spinKey(place));
      return moved;
    }
    return null;
  };

  return {
    /**
     * Takes the medals on the board for a spin that has been drawn: the spin
     * is written down, then its medals are taken. Null, with nothing taken,
     * when they cannot be: the card is not here, the medals are not enough, a
     * bet is not one the board takes, or a spin of these medals is still to be
     * finished.
     */
    stake(bets: readonly PlacedBet[], spin: Spin): Staked | null {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null || !isSpin(spin)) return null;
      const placed = bets.filter(({ amount }) => amount > 0).map(({ spot, amount }) => ({ spot, amount }));
      const wagered = placed.reduce((sum, { amount }) => sum + amount, 0);
      const takes = (bet: PlacedBet): boolean => isSpot(bet.spot) && Number.isSafeInteger(bet.amount) && bet.amount <= SPOT_MAX;
      if (wagered <= 0 || !placed.every(takes) || new Set(placed.map(({ spot }) => spot)).size !== placed.length || bank.balance() < wagered) return null;
      if (unfinished()) return null;
      const owner = bank.owner();
      const key = spinKey(owner);
      const drawn: Spin = { stop: spin.stop, lamp: spin.lamp, second: spin.second };
      const record: SpinRecord = { v: 1, id: newId(), owner, ledger: medals.device, era: medals.era, spin: drawn, bets: placed, wagered, won: winningsOf(placed, drawn), paid: false };
      let stored = write(key, serializeSpinRecord(record));
      if (move(record, STAKE_STEP, -wagered) !== 'applied') {
        if (stored) remove(key);
        return null;
      }
      // The medals played feed the floor jackpot, once, as the stake goes in.
      floorReport(BIG_WHEEL_GAME, { played: wagered });
      // The spin before this one is no longer on record: nothing will look at its receipts again.
      bank.forget(BIG_WHEEL_GAME, [record.id]);
      // The bank could not write the stake down: the spin is not left on record either, or a page that dies now would
      // come back to a spin whose medals were never taken. It is played from memory, as the bank's medals are.
      if (stored && !bank.getState().kept) stored = !remove(key);
      return { record, stored, paid: false, void: false };
    },

    /**
     * Puts a spin's winnings into the medals, once. `later`: not now (the card
     * is not here, or the medals on the table are not the ones it was bet
     * from), and the spin stays on record to be finished. `already`: another
     * page settled it. `void`: the medals were reset since it was bet.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = spinKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseSpinRecord(there)?.id === record.id) remove(key);
        return 'void';
      }
      if (!holding()) return 'later';
      const there = read(key);
      if (there !== undefined && staked.stored) {
        const found = there === null ? null : parseSpinRecord(there);
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
        if (typeof there === 'string' && parseSpinRecord(there)?.id === record.id) remove(key);
        return 'void';
      }
      // Marked paid first, so that nothing that hears of the medals moving finds the spin still to finish; then its
      // winnings go in under their receipt. A page that dies between the two leaves a spin marked paid whose winnings
      // the next page that holds the card puts in, once (`leftover`).
      if (!write(key, serializeSpinRecord({ ...record, paid: true }))) remove(key);
      staked.paid = true;
      if (record.won > 0) payWinnings(record);
      // The wheel has stopped: none of the spin's medals are out any more, a losing spin included, which pays nothing.
      bank.settle(BIG_WHEEL_GAME);
      return 'paid';
    },

    /** A spin this device left unfinished with the medals on the table, which the page that holds the card now is to finish: null when there is none. */
    leftover(): SpinRecord | null {
      if (!holding() || !bank.getState().loaded) return null;
      const key = spinKey(bank.owner());
      const text = read(key);
      // Text that is not a spin this machine can read: an unreadable copy, not a stake, and not one to keep.
      if (typeof text === 'string' && !parseSpinRecord(text)) remove(key);
      // Marked paid, and the page died before its winnings went in: they go in now, once.
      const kept = typeof text === 'string' ? parseSpinRecord(text) : null;
      if (kept && kept.paid && kept.won > 0 && current(kept) && !bank.applied({ game: BIG_WHEEL_GAME, round: kept.id, step: PAY_STEP })) payWinnings(kept);
      const left = unfinished();
      // Only a spin still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(BIG_WHEEL_GAME, left ? [left.id] : []);
      return left;
    },

    /** The last spin these medals were settled on, for the machine to show: null when there is none to show. */
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

/**
 * A name for a spin: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the draw's alone.
 */
export const spinId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
