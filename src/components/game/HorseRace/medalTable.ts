/**
 * The horse-racing machine on the medal center's floor: the player buys
 * tickets with their medals, the ones every game of the medal center plays
 * with (`MedalCenter/bank.ts`), and is paid what the tickets win back into
 * the same medals. It keeps a race the way the roulette table keeps a spin
 * (Roulette/medalTable.ts), and for the same reasons.
 *
 * ## A race, once
 *
 * Tickets lie on the board and are not paid for until the race is off (START,
 * or the betting closing). Then the result is drawn, the race is written down
 * on this device (`raceKey`) and the medals on the tickets are taken, in that
 * order: the race is on record before its stake is gone. What it wins back is
 * known from that moment (the order is drawn), and it goes into the medals
 * once, whichever comes first:
 *
 * - the race is over on this page (the horses have crossed the line, or the
 *   player skipped to the result);
 * - the page gives up the card (it is hidden, left or reloaded, or another
 *   tab needs the medals): the race is settled then, before the card goes;
 * - the page was killed before it could do either: the next page that holds
 *   the card for the same player finds the race on record, unpaid, and
 *   finishes it. The race is run again to the same result and pays.
 *
 * So a race is never refunded: its result was drawn when its tickets were
 * bought, as on a real machine once betting has closed, and a reload is no
 * way to take back tickets that are going to lose. A race on record is paid
 * exactly once, and only by the page that holds the card.
 *
 * The race's record and the medals are two writes, and the browser can die
 * between any two writes. So its stake and its winnings each go into the
 * medals under a receipt (`bank.apply`; "A machine's rounds" in bank.ts): a
 * race on record whose stake never went in never happened, and is thrown away
 * with nothing paid; a race marked paid whose winnings never went in has them
 * put in, once. A race's receipts are let go of when the next race's tickets
 * are bought.
 *
 * A race belongs to the medals it was bet from: the player's ledger on this
 * device in the era it was bet in. It is paid into those medals and no others
 * (not another player's that are on the table meanwhile, and not after the
 * medals were reset at the medal center). Where this browser's storage
 * refuses the bank's write, the race is played from memory alone.
 *
 * ## The limits
 *
 * At least one medal a ticket and at most `TICKET_MAX` (99) on any one, the
 * two digits a ticket's lamp shows. A tap adds `BET_STEPS` medals, or as many
 * as still fit on the ticket and in the player's medals.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { FIELD, ODDS_LIMITS, TICKETS, oddsOf, ticketFrom, ticketKey, ticketWins, type RaceCard } from './card';
import { horseById } from './stable';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const HORSE_GAME = 'horse-race';
/** Where a guest's race is written down on this device. An account's is under its own name (`raceKey`). */
export const RACE_KEY = 'horse-race-race-v1';
export const raceKey = (owner: string | null): string => (owner === null ? RACE_KEY : `${RACE_KEY}:${owner}`);

/** The fewest medals a ticket can carry, and the most. */
export const MIN_BET = 1;
export const TICKET_MAX = 99;
/** How many medals one tap on a ticket adds. */
export const BET_STEPS = [1, 5, 10] as const;
/** The most medals a race can take: every ticket at its most. */
export const RACE_STAKE_MOST = TICKETS.length * TICKET_MAX;

/** A ticket bought: which (its name, `win:3` or `quinella:2-5`), how many medals on it, and its odds as the board had them. */
export interface PlacedTicket {
  key: string;
  amount: number;
  odds: number;
}

/** A race on record: what was bought, by whom, the horses, the order they finished in, and whether its winnings are in. */
export interface RaceRecord {
  v: 1;
  id: string;
  /** Whose medals were bet: an account's id, or null for a guest's. It says where the race is kept (`raceKey`). */
  owner: string | null;
  /** The ledger the medals were bet from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was bet: a reset since voids it. */
  era: number;
  /** The race's number in the player's races. */
  race: number;
  /** The horses, by their names, in gate order. */
  field: string[];
  /** The result: gates, first to last. */
  order: number[];
  bets: PlacedTicket[];
  wagered: number;
  /** The medals it wins back, the medals on the winning tickets included (0 when nothing won). */
  won: number;
  paid: boolean;
}

/** The names of a race's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

/** A race as the page that holds it knows it. */
export interface Staked {
  record: RaceRecord;
  /** Whether it was written down on this device. A race that could not be is paid from what the page knows. */
  stored: boolean;
  /** Whether it has been settled: paid, or found paid by another page. */
  paid: boolean;
  /** Whether a reset came between its stake and its end: it pays nothing. */
  void: boolean;
}

/** How one race ended when it was settled. */
export type Settled = 'paid' | 'already' | 'void' | 'later';

/** What a set of tickets wins back when the horses finish in `order`, the medals on the winning tickets included. */
export function winningsOf(bets: readonly PlacedTicket[], order: readonly number[]): number {
  let won = 0;
  for (const { key, amount, odds } of bets) {
    const ticket = ticketFrom(key);
    if (ticket && ticketWins(ticket, order)) won += amount * odds;
  }
  return won;
}

/** How many medals one tap of `step` adds to a ticket that holds `onTicket`, when `medalsLeft` are not on the board yet. */
export const tapAmount = (step: number, onTicket: number, medalsLeft: number): number => Math.max(0, Math.min(step, TICKET_MAX - onTicket, medalsLeft));

// ── Reading a race back ─────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;

/** Whether `value` is the gates 1 to 6, each once. */
const isOrder = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === FIELD && value.every((gate) => isWhole(gate, 1, FIELD)) && new Set(value).size === FIELD;

/** A ticket as it comes back out of storage, or null when it is not one this machine sells. */
export function readTicket(value: unknown): PlacedTicket | null {
  if (!isRecord(value) || typeof value.key !== 'string') return null;
  const ticket = ticketFrom(value.key);
  if (!ticket || !isWhole(value.amount, MIN_BET, TICKET_MAX)) return null;
  const limits = ODDS_LIMITS[ticket.kind];
  if (!isWhole(value.odds, limits.least, limits.most)) return null;
  return { key: value.key, amount: value.amount, odds: value.odds };
}

/** A race as it comes back out of storage, or null when the text is not one. Nothing in it is trusted: it is checked field by field. */
export function parseRace(text: unknown): RaceRecord | null {
  if (typeof text !== 'string' || text.length > 64_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== 1 || typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 64) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000) || !isWhole(data.race, 1, 1_000_000_000)) return null;
  if (typeof data.paid !== 'boolean' || !isOrder(data.order) || !Array.isArray(data.field) || !Array.isArray(data.bets)) return null;
  const field = data.field;
  if (field.length !== FIELD || !field.every((id) => typeof id === 'string' && horseById(id) !== undefined) || new Set(field).size !== FIELD) return null;
  const bets: PlacedTicket[] = [];
  for (const placed of data.bets) {
    const bet = readTicket(placed);
    if (!bet) return null;
    bets.push(bet);
  }
  const wagered = bets.reduce((sum, { amount }) => sum + amount, 0);
  // What it bet and what it won are worked out again: a record that says otherwise is not one this machine wrote.
  if (bets.length === 0 || new Set(bets.map(({ key }) => key)).size !== bets.length || data.wagered !== wagered || data.won !== winningsOf(bets, data.order)) return null;
  return { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, race: data.race, field: [...(field as string[])], order: [...data.order], bets, wagered, won: data.won as number, paid: data.paid };
}

export const serializeRace = (record: RaceRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  /** `kept`: whether the bank's last write to this device's storage took. */
  getState(): { loaded: boolean; kept: boolean; ledger: { era: number; device: string } | null };
  restartDue(game: string): boolean;
  /** A move of a race's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every race but those in `keep` has no medals out any more: no refill is given while one does. */
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
  /** A name for a race that no other race has. */
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

  /** The race kept for a player, read back; null for none, or for text that is not one. */
  const keptFor = (owner: string | null): RaceRecord | null => {
    const text = read(raceKey(owner));
    return typeof text === 'string' ? parseRace(text) : null;
  };

  /** A move of a race's medals, under its receipt. */
  const move = (record: RaceRecord, step: string, medals: number) => bank.apply({ game: HORSE_GAME, round: record.id, step, medals, era: record.era });
  /** A race's winnings, in under their receipt; the medal floor hears of them once, as they go in. */
  const payWinnings = (record: RaceRecord) => {
    if (move(record, PAY_STEP, record.won) === 'applied') floorReport(HORSE_GAME, { won: record.won, prize: { medals: record.won } });
  };
  /** Whether a race's stake went in: the bank holds its receipt until the race is let go of. */
  const stakeIn = (record: RaceRecord): boolean => bank.applied({ game: HORSE_GAME, round: record.id, step: STAKE_STEP });

  /** Whether a race was bet from the medals on the table now: the same ledger, in the same era. */
  const current = (record: RaceRecord): boolean => {
    const medals = onTable();
    return medals !== null && record.ledger === medals.device && record.era === medals.era;
  };

  /**
   * A race of the medals on the table that is still to be finished, wherever
   * it is kept: under the player's name, or, for an account whose medals were
   * a guest's on this device until the first sign-in moved them in, under the
   * guest's, where it was bet. Such a race is moved to the account's place.
   * One bet from these medals before a reset, or whose stake never went in,
   * is thrown away. Races of other medals are left as they are.
   */
  /**
   * The race this table is staking at this moment: from its record being written until its stake is in and the races
   * before it are let go of. The bank tells the page of every one of those moves as it makes it, and a page that looks
   * for a race to finish then is looking at its own press, not at a race left unfinished (`leftover`).
   */
  let staking: string | null = null;

  const unfinished = (): RaceRecord | null => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const record = keptFor(place);
      if (!record || record.paid || record.ledger !== medals.device) continue;
      if (record.era !== medals.era || bank.restartDue(HORSE_GAME) || !stakeIn(record)) {
        remove(raceKey(place));
        continue;
      }
      if (place === owner) return record;
      const moved: RaceRecord = { ...record, owner };
      if (!write(raceKey(owner), serializeRace(moved))) return record;
      remove(raceKey(place));
      return moved;
    }
    return null;
  };

  return {
    /**
     * Buys the tickets on the board for a race whose result has been drawn
     * (`order`): the race is written down, then its medals are taken. Null,
     * with nothing taken, when they cannot be: the card is not here, the
     * medals are not enough, a ticket is not one the board sells at those
     * odds, or a race of these medals is still to be finished.
     */
    stake(card: RaceCard, bets: readonly PlacedTicket[], order: readonly number[]): Staked | null {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null || !isOrder([...order])) return null;
      const placed = bets.filter(({ amount }) => amount > 0).map(({ key, amount, odds }) => ({ key, amount, odds }));
      const wagered = placed.reduce((sum, { amount }) => sum + amount, 0);
      const sold = (bet: PlacedTicket): boolean => {
        const ticket = ticketFrom(bet.key);
        return ticket !== null && Number.isSafeInteger(bet.amount) && bet.amount <= TICKET_MAX && oddsOf(card, ticket) === bet.odds;
      };
      if (wagered <= 0 || !placed.every(sold) || new Set(placed.map(({ key }) => key)).size !== placed.length || bank.balance() < wagered) return null;
      if (unfinished()) return null;
      const owner = bank.owner();
      const key = raceKey(owner);
      const record: RaceRecord = {
        v: 1,
        id: newId(),
        owner,
        ledger: medals.device,
        era: medals.era,
        race: card.race,
        field: card.field.map((horse) => horse.id),
        order: [...order],
        bets: placed,
        wagered,
        won: winningsOf(placed, order),
        paid: false,
      };
      let stored = write(key, serializeRace(record));
      staking = record.id;
      try {
        if (move(record, STAKE_STEP, -wagered) !== 'applied') {
          if (stored) remove(key);
          return null;
        }
        // The medals played feed the floor jackpot, once, as the stake goes in.
        floorReport(HORSE_GAME, { played: wagered });
        // The race before this one is no longer on record: nothing will look at its receipts again.
        bank.forget(HORSE_GAME, [record.id]);
      } finally {
        staking = null;
      }
      // The bank could not write the stake down: the race is not left on record either, or a page that dies now would
      // come back to a race whose medals were never taken. It is played from memory, as the bank's medals are.
      if (stored && !bank.getState().kept) stored = !remove(key);
      return { record, stored, paid: false, void: false };
    },

    /**
     * Puts a race's winnings into the medals, once. `later`: not now (the
     * card is not here, or the medals on the table are not the ones it was
     * bet from), and the race stays on record to be finished. `already`:
     * another page settled it. `void`: the medals were reset since it was bet.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = raceKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseRace(there)?.id === record.id) remove(key);
        return 'void';
      }
      if (!holding()) return 'later';
      const there = read(key);
      if (there !== undefined && staked.stored) {
        const found = there === null ? null : parseRace(there);
        // Not on record any more, or another race in its place: another page has settled it, or a reset cleared it.
        if (!found || found.id !== record.id || found.paid) {
          staked.paid = true;
          return 'already';
        }
      }
      // Its stake never went in (the page that bet it died first): it never was, and pays nothing.
      if (!stakeIn(record)) {
        staked.void = true;
        staked.paid = true;
        if (typeof there === 'string' && parseRace(there)?.id === record.id) remove(key);
        return 'void';
      }
      // Marked paid first, so that nothing that hears of the medals moving finds the race still to finish; then its
      // winnings go in under their receipt. A page that dies between the two leaves a race marked paid whose winnings
      // the next page that holds the card puts in, once (`leftover`).
      if (!write(key, serializeRace({ ...record, paid: true }))) remove(key);
      staked.paid = true;
      if (record.won > 0) payWinnings(record);
      // The race is over: none of its medals are out any more, a losing race included, which pays nothing.
      bank.settle(HORSE_GAME);
      return 'paid';
    },

    /** A race this device left unfinished with the medals on the table, which the page that holds the card now is to finish: null when there is none. */
    leftover(): RaceRecord | null {
      // While START stakes, the race on record is that press's own: nothing is left unfinished, and nothing is settled.
      if (!holding() || !bank.getState().loaded || staking !== null) return null;
      const key = raceKey(bank.owner());
      const text = read(key);
      // Text that is not a race this machine can read: an unreadable copy, not a stake, and not one to keep.
      if (typeof text === 'string' && !parseRace(text)) remove(key);
      // Marked paid, and the page died before its winnings went in: they go in now, once.
      const kept = typeof text === 'string' ? parseRace(text) : null;
      if (kept && kept.paid && kept.won > 0 && current(kept) && !bank.applied({ game: HORSE_GAME, round: kept.id, step: PAY_STEP })) payWinnings(kept);
      const left = unfinished();
      // Only a race still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(HORSE_GAME, left ? [left.id] : []);
      return left;
    },

    /** The last race these medals were settled on, for the machine to show: null when there is none to show. */
    last(): RaceRecord | null {
      const record = keptFor(bank.owner());
      return record && record.paid && current(record) ? record : null;
    },

    /** The number of the next race these medals run: the one after the last on record, or the first. */
    nextRace(): number {
      const record = keptFor(bank.owner());
      return record && current(record) ? record.race + (record.paid ? 1 : 0) : 1;
    },

    /** Forgets the race on record for the player on the table: the medals have been reset. */
    clear(): void {
      remove(raceKey(bank.owner()));
    },
  };
}

/**
 * A name for a race: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the draw's alone.
 */
export const raceId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;

/** The placed tickets of a race, each with what it would win back if it came in: its odds times its medals. */
export const ticketsOf = (bets: readonly PlacedTicket[]) => bets.map((bet) => ({ ...bet, ticket: ticketFrom(bet.key)!, back: bet.amount * bet.odds }));

/** The keys of every ticket the board sells, in the board's order. */
export const TICKET_KEYS: readonly string[] = TICKETS.map(ticketKey);
