/**
 * Big Catch Harbor on the medal center's floor: it plays with the player's
 * medals, the ones the medal bank keeps for every machine there
 * (MedalCenter/bank.ts), and keeps no count of its own. It follows the slot
 * machine's way with the medals (SlotMachine/medals.ts), a cast being a spin.
 *
 * ## A cast is a round
 *
 * What a cast comes to is drawn the moment CAST is pressed, as a real machine
 * draws it, and its stake is taken out of the medals at that moment. The
 * round is written down then too, in the same breath: what was drawn, for
 * how many medals, in which era of the bank (a reset at the medal center
 * starts a new one), for whose medals, and by which tab. It is settled exactly
 * once, by whichever of these comes first:
 *
 * - the cast is played out on the screen (or skipped to its end);
 * - the card goes (MedalCenter/bank.ts: the page is hidden or left, a reload
 *   among them, or another tab's machine takes it): the round is paid while
 *   this page still holds the card;
 * - for a round whose page went without a word (a crash), the next time a
 *   page of this machine holds the card.
 *
 * So a cast under way at a reload is never refunded and never paid twice: it
 * resumes, and the tab that cast it is shown it again. Refunding instead
 * would let a player reload whenever a small shadow came for the float, and
 * only lose the casts that looked good.
 *
 * The round and the medals are two writes: the round's record here, and the
 * medals in the bank. The round is written down before its stake is taken,
 * and the stake and the win each go in under a receipt (`bank.apply`; see
 * "A machine's rounds" in bank.ts), so a browser that dies between any two
 * writes leaves nothing paid twice and nothing lost: a round written down
 * whose stake never went in never happened, and is struck out; a round whose
 * stake went in is paid, and a win paid already is not paid again.
 *
 * A round is void once the medals have been reset since it began: the reset
 * threw away every medal of the era before it, those on the line included.
 *
 * Nothing here draws or animates; the cabinet does. This file is only what
 * happens to the medals, so that it can be run in its tests against the real
 * bank in a fake browser.
 */

import type { Bank, Seat } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { isBet, isCast, resolveCast, type Bet, type Cast } from './engine';

/** The machine's name at the medal bank and on the floor: its page is /games/fishing. */
export const FISHING_GAME = 'fishing';

/** Where a round is written down on this device: a guest's under this name, an account's under it and the account. */
export const ROUND_KEY = 'fishing-round';
export const roundKey = (owner: string | null): string => (owner === null ? ROUND_KEY : `${ROUND_KEY}:${owner}`);
/** Where a tab keeps its own name, which lasts through its reloads (sessionStorage). */
export const TAB_KEY = 'fishing-tab';

export const ROUND_VERSION = 1;

/** One cast's round, as it is written down. */
export interface Round {
  v: typeof ROUND_VERSION;
  /** A name for the round. */
  id: string;
  /** The tab that cast it: the one that shows it again after a reload. */
  tab: string;
  /** Whose medals were bet: an account's id, or null for a guest's. */
  owner: string | null;
  /** The bank's era when the stake was taken. */
  era: number;
  bet: Bet;
  /** What was drawn. */
  cast: Cast;
  /** Whether what it won has been put into the medals. */
  paid: boolean;
}

/** The names of a round's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

/** The medals a round wins. */
export const winOf = (round: Pick<Round, 'bet' | 'cast'>): number => resolveCast(round.cast, round.bet).win;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const NAME = /^[a-z0-9]{1,24}$/;

/** Reads a round back. Anything that is not one, whole and as written, is not a round (null), and is never paid. */
export function parseRound(text: unknown): Round | null {
  if (typeof text !== 'string' || text.length > 2_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== ROUND_VERSION) return null;
  const { id, tab, owner, era, bet, cast, paid } = value;
  if (typeof id !== 'string' || !NAME.test(id) || typeof tab !== 'string' || !NAME.test(tab)) return null;
  if (owner !== null && (typeof owner !== 'string' || owner.length === 0 || owner.length > 128)) return null;
  if (typeof era !== 'number' || !Number.isInteger(era) || era < 0) return null;
  if (!isBet(bet) || !isCast(cast) || typeof paid !== 'boolean') return null;
  return { v: ROUND_VERSION, id, tab, owner, era, bet, cast: { fish: cast.fish, landed: cast.landed, prize: cast.prize }, paid };
}

export const serializeRound = (round: Round): string =>
  JSON.stringify({
    v: ROUND_VERSION,
    id: round.id,
    tab: round.tab,
    owner: round.owner,
    era: round.era,
    bet: round.bet,
    cast: { fish: round.cast.fish, landed: round.cast.landed, prize: round.cast.prize },
    paid: round.paid,
  });

/** Storage, as the machine needs it. Throws when storage is blocked. */
export interface PierStorage {
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
}

/** What the cabinet acts out of what happens at the bank. */
export interface PierEvents {
  /** The card is this page's: the machine may take casts. */
  granted?: () => void;
  /** The card is going, for the reason the bank gives. Any round in progress has been paid by then. */
  yielding?: (why: 'moment' | 'hidden' | 'left') => void;
  /** The medals have been reset at the medal center since this machine last started over: it starts over now. */
  restart?: () => void;
}

export interface PierDeps {
  bank: Bank;
  storage: PierStorage;
  /** This tab's name (`tabName`). */
  tab: string;
  /** A new round's name. */
  name: () => string;
  events?: PierEvents;
}

/** What a cast comes to at the bank. */
export type CastBet = { ok: true; round: Round } | { ok: false; why: 'card' | 'medals' | 'unpaid' | 'bet' };

/**
 * The machine's place at the bank: it sits down, takes stakes, pays wins,
 * and starts over after a reset. One per page.
 */
export function createPier({ bank, storage, tab, name, events = {} }: PierDeps) {
  let seat: Seat | null = null;
  let unlisten: (() => void) | null = null;
  /** Rounds written down while storage would not keep them: the page keeps them itself, for as long as it is open. */
  const memory = new Map<string, string>();

  const load = (owner: string | null): Round | null => {
    const key = roundKey(owner);
    if (memory.has(key)) return parseRound(memory.get(key));
    try {
      return parseRound(storage.read(key));
    } catch {
      return null;
    }
  };
  const save = (round: Round): void => {
    const key = roundKey(round.owner);
    try {
      storage.write(key, serializeRound(round));
      memory.delete(key);
    } catch {
      memory.set(key, serializeRound(round));
    }
  };
  /** What is written down for a player, as text (null for nothing), to put back if a cast is not taken after all. */
  const textOf = (owner: string | null): { memory: boolean; text: string | null } => {
    const key = roundKey(owner);
    if (memory.has(key)) return { memory: true, text: memory.get(key) ?? null };
    try {
      return { memory: false, text: storage.read(key) };
    } catch {
      return { memory: false, text: null };
    }
  };
  const putBack = (owner: string | null, was: { memory: boolean; text: string | null }): void => {
    const key = roundKey(owner);
    if (was.memory && was.text !== null) {
      memory.set(key, was.text);
      return;
    }
    memory.delete(key);
    try {
      if (was.text === null) storage.remove(key);
      else storage.write(key, was.text);
    } catch {
      // What is there is a round whose stake was never taken: it is struck out when it is next looked at.
    }
  };
  /** A move of the round's medals at the bank, under its receipt. */
  const move = (round: Round, step: string, medals: number): 'applied' | 'already' | null =>
    bank.apply({ game: FISHING_GAME, round: round.id, step, medals, era: round.era });
  /** Whether an unpaid round's stake went in: the bank holds its receipt until the round is paid and let go of. */
  const staked = (round: Round): boolean => bank.applied({ game: FISHING_GAME, round: round.id, step: STAKE_STEP });
  /** The era of the bank on the table, once it has been read. */
  const era = (): number | null => bank.getState().ledger?.era ?? null;
  const holding = (): boolean => seat?.holding() ?? false;
  /** The rounds whose cast this page has played out in front of the player: never shown again, and no longer written down once paid. */
  const seen = new Set<string>();

  /**
   * Stops writing a round down. Only the page that holds the card does: a page
   * without it may not yet have heard of a round another tab has written since
   * under the same name, and would remove that one.
   */
  const clear = (owner: string | null, id: string): void => {
    if (!holding()) return;
    const key = roundKey(owner);
    if (load(owner)?.id !== id) return;
    memory.delete(key);
    try {
      storage.remove(key);
    } catch {
      // It stays, paid: nothing more is paid for it.
    }
  };

  /**
   * Pays the round written down for the medals on the table, if one is still to
   * be paid and this page holds the card. The win goes in under its receipt
   * before the round is written down as paid, so that it is paid once whoever
   * pays it. A round from before the last reset is void and is dropped.
   * Returns the round paid.
   */
  const payDue = (): Round | null => {
    if (!holding()) return null;
    const owner = bank.owner();
    const round = load(owner);
    const now = era();
    if (!round || round.paid || round.owner !== owner || now === null) return null;
    if (round.era < now) {
      clear(owner, round.id);
      return null;
    }
    // A round from an era this page has not heard of yet waits until it has.
    if (round.era > now) return null;
    // Written down, and the browser died before its stake went in: it never happened. Nothing is paid for it.
    if (!staked(round)) {
      clear(owner, round.id);
      return null;
    }
    const result = resolveCast(round.cast, round.bet);
    const moved = result.win > 0 ? move(round, PAY_STEP, result.win) : null;
    if (result.win > 0 && !moved) return null;
    // The medal floor hears of a win once, as it goes in (not when a later page finds it in already).
    if (moved === 'applied') floorReport(FISHING_GAME, { won: result.win, prize: { medals: result.win, label: result.label ?? undefined } });
    // Shown already (its cast played out while it could not be paid): nothing more is to be done with it.
    if (seen.has(round.id)) clear(owner, round.id);
    else save({ ...round, paid: true });
    // Over, and written down as over: nothing will try its moves again.
    bank.forget(FISHING_GAME);
    return round;
  };

  /** Settles what can be settled with the card: a round still to be paid, and a round shown and paid that is still written down. */
  const settle = (): Round | null => {
    const paid = payDue();
    if (!holding()) return paid;
    const owner = bank.owner();
    const round = load(owner);
    if (round && round.paid && seen.has(round.id)) clear(owner, round.id);
    // Only a round still to be paid has medals out: one paid, or lost, has none, even if the page that paid it died
    // before it could say so.
    const left = load(owner);
    bank.settle(FISHING_GAME, left && !left.paid ? [left.id] : []);
    return paid;
  };

  /** Starts the machine over after a reset: the round written down from before it is void. */
  const startOver = (): void => {
    const owner = bank.owner();
    const round = load(owner);
    const now = era();
    if (round && now !== null && round.era < now) clear(owner, round.id);
    if (bank.restartDue(FISHING_GAME)) bank.restarted(FISHING_GAME);
    events.restart?.();
  };

  return {
    /**
     * Sits down at the bank: the card is asked for at once. Returns what gets
     * up again. What the bank says is acted on a moment later, once the bank
     * has shown it (its state is published after its handlers have run).
     */
    sit(): () => void {
      const mine = bank.sit(FISHING_GAME, {
        granted: () =>
          queueMicrotask(() => {
            if (seat !== mine) return;
            if (bank.restartDue(FISHING_GAME)) startOver();
            settle();
            events.granted?.();
          }),
        yielding: (why) => {
          // Paid while the card is still here: whichever page has it next finds the round settled.
          settle();
          events.yielding?.(why);
        },
      });
      seat = mine;
      unlisten = bank.listen((event) => {
        if (event.type === 'reset') queueMicrotask(() => seat === mine && startOver());
      });
      return () => {
        unlisten?.();
        unlisten = null;
        // Got up from with the card still in hand (as when the player goes to another page of the site mid-cast), so
        // that the round under way is paid as it goes.
        mine.leave();
        if (seat === mine) seat = null;
      };
    },

    /** Whether this page holds the card, so that the machine may take a cast. */
    holding,

    /** The player plays here: the card is asked back from the machine in another tab that has it. */
    play(): void {
      seat?.play();
    },

    /**
     * Takes the stake for a cast whose outcome has been drawn, and writes the
     * round down: or neither. A round of the same player's still to be paid is
     * paid first, and while it cannot be, nothing more is cast.
     */
    cast(medals: number, drawn: Cast): CastBet {
      if (!isBet(medals) || !isCast(drawn)) return { ok: false, why: 'bet' };
      if (!holding()) return { ok: false, why: 'card' };
      settle();
      const owner = bank.owner();
      const before = load(owner);
      const now = era();
      if (before && !before.paid) return { ok: false, why: 'unpaid' };
      if (now === null) return { ok: false, why: 'card' };
      if (bank.balance() < medals) return { ok: false, why: 'medals' };
      // Written down first, then the stake taken under its receipt: a page that dies between the two leaves a round
      // whose stake the bank never took, which is struck out unpaid (`payDue`).
      const round: Round = { v: ROUND_VERSION, id: name(), tab, owner, era: now, bet: medals, cast: { fish: drawn.fish, landed: drawn.landed, prize: drawn.prize }, paid: false };
      const was = textOf(owner);
      save(round);
      if (move(round, STAKE_STEP, -medals) !== 'applied') {
        putBack(owner, was);
        return { ok: false, why: 'medals' };
      }
      // The medals played feed the floor jackpot, once, as the stake goes in.
      floorReport(FISHING_GAME, { played: medals });
      return { ok: true, round };
    },

    /**
     * A round's cast has been played out in front of the player: it is paid if
     * it has not been, and is no longer written down, now if this page holds
     * the card and otherwise the next time it does; it is never shown again.
     * Returns false only for a round that is still to be paid and cannot be yet
     * (no card, or another player's medals on the table): it is paid when it
     * can be. A round paid before, or made void by a reset since, is done with.
     */
    finish(round: Pick<Round, 'id' | 'owner'>): boolean {
      seen.add(round.id);
      settle();
      const stored = load(round.owner);
      return !(stored && stored.id === round.id && !stored.paid);
    },

    /** Settles, with the card, what can be settled now: a round still to be paid, and one shown and paid. Returns the round paid. */
    payDue: settle,

    /** The round this tab left in progress or unseen when it was last reloaded, to be shown again; or null. */
    leftover(): Round | null {
      const round = load(bank.owner());
      const now = era();
      return round && round.tab === tab && !seen.has(round.id) && now !== null && round.era === now && (round.paid || staked(round)) ? round : null;
    },

    /** The round written down for the medals on the table, whoever's tab it is. */
    current: (): Round | null => load(bank.owner()),
  };
}

export type Pier = ReturnType<typeof createPier>;

// ── The browser ─────────────────────────────────────────────────────────────

const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A name of twelve letters and digits, from the browser's random numbers (never `Math.random`, which draws the casts). */
export function randomName(): string {
  try {
    return Array.from(window.crypto.getRandomValues(new Uint32Array(12)), (n) => LETTERS[n % LETTERS.length]).join('');
  } catch {
    return Array.from({ length: 12 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  }
}

/** This tab's name: kept in the tab's own storage, so that it is the same after a reload, and made up when there is none. */
export function tabName(): string {
  try {
    const kept = window.sessionStorage.getItem(TAB_KEY);
    if (kept && NAME.test(kept)) return kept;
    const made = randomName();
    window.sessionStorage.setItem(TAB_KEY, made);
    return made;
  } catch {
    return randomName();
  }
}

/** The page's storage, as the machine needs it. */
export const browserStorage = (): PierStorage => ({
  read: (key) => window.localStorage.getItem(key),
  write: (key, text) => window.localStorage.setItem(key, text),
  remove: (key) => window.localStorage.removeItem(key),
});
