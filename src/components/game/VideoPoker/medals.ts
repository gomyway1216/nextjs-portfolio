/**
 * Video poker at the medal center: the machine plays with the player's own
 * medals (MedalCenter/bank.ts) instead of a bankroll of its own.
 *
 * - The bet is taken out of the medals when the hand is dealt, and what the
 *   final hand wins is put back when it is drawn: once each, whatever happens
 *   to the page in between.
 * - The hand is written to this device as it is dealt, with the five cards
 *   that will replace the ones thrown away, and again as it is drawn. A page
 *   that is reloaded, or another tab that takes the medals over, finds the
 *   hand where it was left and goes on with it: **a dealt hand resumes**, it
 *   is not handed back. Handing it back would let a player look at five cards
 *   and reload to be rid of them, which is a better game than the pay table
 *   says. The draw is the one the deal fixed, so a reload changes nothing.
 * - Only the page that holds the member's card writes the hand, and it reads
 *   it back before every deal and every draw. A hand is drawn once: the hand
 *   kept on the device is written down as drawn (or, when storage will not
 *   take that, taken away) before its win goes in. When neither can be done,
 *   or the hand cannot even be read back, nothing is won yet: the hand waits,
 *   still dealt, until storage can be used again. So no reload, and no other
 *   tab, can ever find a hand still dealt whose win is in.
 * - The hand and the medals are two writes, and a browser can die between
 *   any two writes. So the bet and the win each go into the medals under a
 *   receipt (`bank.apply`; "A machine's rounds" in bank.ts), named by the
 *   hand, and the page that next holds the card looks at the hand against
 *   them: a hand written down as dealt whose bet never went in was never
 *   dealt, and is taken away; a hand written down as drawn whose win never
 *   went in is paid now. A move made already is never made again. A hand's
 *   receipts are let go of when the next hand is dealt over it. A hand dealt
 *   before there were receipts is taken at its word: its bet was taken.
 * - A hand belongs to the very medals it was bet from: the same copy of them
 *   (`ledger.device`, which a player's medals keep on each device) in the same
 *   era. A reset at the medal center begins a new era, and the hand on the
 *   machine goes with the medals that bet on it: nothing it would have won
 *   goes into the new medals. Another player's medals, or a guest's new ones
 *   after the guest's became an account's, are another copy: the hand is not
 *   theirs.
 * - A guest who signs in to an account with no medals yet brings their medals
 *   with them (bank.ts moves them, the same copy, to the account): a hand
 *   dealt from them comes along, and is kept under the account from then on.
 *
 * This file is the arithmetic and the storage. The page (PlayTab.tsx) holds
 * the seat and shows it all.
 */

import type { Bank } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { isDevice } from '../MedalCenter/ledger';
import { slotFor } from '../MedalPusher/account';
import { MAX_COINS, PAY_TABLES, PAY_TABLE_IDS, deal as dealCards, draw as drawCards, heldFromMask, payout, rankCards, type PayTableId } from './engine';

/** The game, as the medal center knows it. */
export const GAME = 'video-poker';
/** Where the hand in play is kept on this device: a guest's under this name, an account's under it and the account. */
export const HAND_KEY = 'video-poker-hand';
export const handKey = (owner: string | null): string => slotFor(HAND_KEY, owner);
/** Set once the player has been told that the machine plays with their medals now. */
export const NOTICE_KEY = 'video-poker-medals-notice';
export const HAND_VERSION = 1;

/** One hand, as it is kept. */
export interface SavedHand {
  v: typeof HAND_VERSION;
  /** A name for this hand alone, so that a page can tell its own hand from one dealt since. */
  id: string;
  /** The era of the medals the bet came out of (ledger.ts): a reset begins a new one. */
  era: number;
  /** The copy of the medals the bet came out of: the ledger's `device`, which names a player's medals on this device. */
  device: string;
  /** The five cards dealt, and the five that replace the ones thrown away, in order. */
  hand: number[];
  stub: number[];
  /** The bet, in medals: 1 to 5. */
  coins: number;
  payId: PayTableId;
  /** The cards held, as a mask (engine.ts). */
  held: number;
  /** Whether the hand has been drawn, and what it won put into the medals. */
  drawn: boolean;
  /**
   * Whether its bet and its win go in under receipts (`bank.apply`): its bet was taken only if the bank holds the
   * bet's receipt, and its win paid only if it holds the win's. A hand dealt before there were receipts has none.
   */
  receipts?: true;
}

/** The names of a hand's two moves of medals at the bank. */
export const DEAL_STEP = 'deal';
export const PAY_STEP = 'pay';

const ID_SHAPE = /^[a-z0-9]{4,32}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCard = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 52;
const isMask = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 31;

/**
 * Reads a kept hand back. Whatever is wrong with it (not this version, a card
 * that is no card, a card twice, a bet the machine does not take, a table it
 * does not have, no copy of the medals it was bet from) and it is no hand:
 * nothing of it is used, and nothing is won for it.
 */
export function parseHand(text: unknown): SavedHand | null {
  if (typeof text !== 'string' || text.length > 2_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== HAND_VERSION) return null;
  const { id, era, device, hand, stub, coins, payId, held, drawn, receipts } = value;
  if (typeof id !== 'string' || !ID_SHAPE.test(id)) return null;
  if (typeof era !== 'number' || !Number.isInteger(era) || era < 0 || era > 1_000_000) return null;
  if (!isDevice(device)) return null;
  if (!Array.isArray(hand) || hand.length !== 5 || !hand.every(isCard)) return null;
  if (!Array.isArray(stub) || stub.length !== 5 || !stub.every(isCard)) return null;
  if (new Set([...hand, ...stub]).size !== 10) return null;
  if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 1 || coins > MAX_COINS) return null;
  if (typeof payId !== 'string' || !(PAY_TABLE_IDS as readonly string[]).includes(payId)) return null;
  if (!isMask(held)) return null;
  if (typeof drawn !== 'boolean') return null;
  if (receipts !== undefined && receipts !== true) return null;
  const read: SavedHand = { v: HAND_VERSION, id, era, device, hand: [...hand], stub: [...stub], coins, payId: payId as PayTableId, held, drawn };
  if (receipts) read.receipts = true;
  return read;
}

export const serializeHand = (h: SavedHand): string =>
  JSON.stringify({
    v: HAND_VERSION,
    id: h.id,
    era: h.era,
    device: h.device,
    hand: h.hand,
    stub: h.stub,
    coins: h.coins,
    payId: h.payId,
    held: h.held,
    drawn: h.drawn,
    ...(h.receipts ? { receipts: true } : {}),
  });

/** The five cards on the screen: as dealt, or as drawn. */
export const cardsOf = (h: SavedHand): number[] => (h.drawn ? drawCards({ hand: h.hand, stub: h.stub }, heldFromMask(h.held)) : h.hand);
/** What a drawn hand won, in medals; nothing before the draw. Worked out from the cards, never read from storage. */
export const wonBy = (h: SavedHand): number => (h.drawn ? payout(rankCards(cardsOf(h)), PAY_TABLES[h.payId], h.coins) : 0);
/** The hands the medal floor names when they are won. */
const FLOOR_HANDS: Partial<Record<number, string>> = { 9: 'royal', 8: 'straight-flush', 7: 'four-kind' };

/** This device's storage, as the page has it. Every call may throw: storage can be blocked, full or switched off. */
export interface HandStore {
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
}

/** This browser's own storage. Only ever called in the browser, never on the server. */
export const deviceStore: HandStore = {
  read: (key) => window.localStorage.getItem(key),
  write: (key, text) => window.localStorage.setItem(key, text),
  remove: (key) => window.localStorage.removeItem(key),
};

/** What of the medal center's bank the machine uses. */
export type MedalBank = Pick<Bank, 'owner' | 'balance' | 'apply' | 'applied' | 'forget' | 'getState' | 'restartDue' | 'restarted'>;

export interface MedalPlayEnv {
  bank: MedalBank;
  /** Whether this page holds the member's card, so that the machine may play. */
  holding: () => boolean;
  store: HandStore;
  /** Random numbers in [0, 1), for the deal. */
  random?: () => number;
  /** A new hand's name. */
  newId?: () => string;
}

export type DealOutcome =
  | { kind: 'dealt'; hand: SavedHand }
  /** A hand is in play already (dealt here, or in another tab): it is played first, and nothing more is bet. */
  | { kind: 'inPlay'; hand: SavedHand }
  /** The medals are being played in another tab, or are still being found: nothing is bet. */
  | { kind: 'away' }
  /** Not that many medals. */
  | { kind: 'short' }
  /** Storage can be read but will neither keep a new hand nor let go of the last one: nothing is bet. */
  | { kind: 'unsaved' };

export type DrawOutcome =
  | { kind: 'drawn'; hand: SavedHand; won: number }
  /** This hand has been drawn already, here or in another tab, or thrown away by a reset: nothing is won again. */
  | { kind: 'gone'; hand: SavedHand | null }
  /** The hand kept on the device cannot be marked drawn (or read back) just now: it stays dealt, and nothing is won yet. */
  | { kind: 'unsaved' }
  | { kind: 'away' };

/** What storage says of the hand in play: the hand, no hand, or nothing that can be read now. */
export type Reading = { ok: true; hand: SavedHand | null } | { ok: false };

const randomId = (): string => {
  try {
    const numbers = globalThis.crypto.getRandomValues(new Uint32Array(3));
    return Array.from(numbers, (n) => n.toString(36)).join('').slice(0, 20) || 'hand';
  } catch {
    return `${Math.floor(Math.random() * 2 ** 31).toString(36)}${Date.now().toString(36)}`;
  }
};

/**
 * The machine's play with the medals. One per page: it remembers a hand
 * that storage would not keep, so that the page can go on with it.
 */
export function createMedalPlay(env: MedalPlayEnv) {
  const { bank, holding, store } = env;
  const random = env.random ?? (() => Math.random());
  const newId = env.newId ?? randomId;
  /**
   * A hand that only this page holds, because storage would not keep it, and
   * the name it would have been kept under (whose it is). Such a hand is in no
   * storage for a reload or another tab to find, so this page alone settles it.
   */
  let memory: { key: string; hand: SavedHand } | null = null;

  const key = (): string => handKey(bank.owner());
  /** Whether a hand was bet from the medals on the table now: the same copy of them, in the same era. */
  const belongs = (h: SavedHand): boolean => {
    const ledger = bank.getState().ledger;
    return ledger !== null && h.era === ledger.era && h.device === ledger.device;
  };
  /** The hand this page holds in memory, if it is of the medals on the table. */
  const remembered = (): SavedHand | null => (memory && memory.key === key() && belongs(memory.hand) ? memory.hand : null);

  const removeKey = (name: string): boolean => {
    try {
      store.remove(name);
      return true;
    } catch {
      return false;
    }
  };

  /** A move of a hand's medals, under its receipt. */
  const move = (h: SavedHand, step: string, medals: number) => bank.apply({ game: GAME, round: h.id, step, medals, era: h.era });
  const moved = (h: SavedHand, step: string): boolean => bank.applied({ game: GAME, round: h.id, step });

  /**
   * Squares a hand found kept with its receipts, with the card: a hand dealt whose bet never went in (the browser died
   * between the hand and the medals) was never dealt, and is taken away; a hand drawn whose win never went in is paid
   * now, once. Returns the hand as it stands, or null for none.
   */
  const square = (h: SavedHand, from: string | null): SavedHand | null => {
    if (!h.receipts || !holding()) return h;
    if (!h.drawn && !moved(h, DEAL_STEP)) {
      if (from !== null) removeKey(from);
      else memory = null;
      return null;
    }
    if (h.drawn) {
      const won = wonBy(h);
      if (won > 0 && !moved(h, PAY_STEP)) move(h, PAY_STEP, won);
    }
    return h;
  };

  /**
   * The hand in play, and where it was read from: under the player's own
   * name, under the guest's (the guest's medals having become this
   * account's), or from this page's memory (null). Squared with its
   * receipts when this page holds the card.
   */
  const look = (): { ok: true; hand: SavedHand | null; from: string | null } | { ok: false } => {
    const found = lookUp();
    if (!found.ok || !found.hand) return found;
    return { ok: true, hand: square(found.hand, found.from), from: found.from };
  };

  const lookUp = (): { ok: true; hand: SavedHand | null; from: string | null } | { ok: false } => {
    const own = key();
    let text: string | null;
    try {
      text = store.read(own);
    } catch {
      return { ok: false };
    }
    const found = parseHand(text);
    if (found && belongs(found)) return { ok: true, hand: found, from: own };
    const kept = remembered();
    if (kept) return { ok: true, hand: kept, from: null };
    // A guest who signed in to an account with no medals brought the guest's medals with them, the same copy: a hand
    // bet from them is the account's hand now.
    const guest = handKey(null);
    if (own !== guest) {
      let guestText: string | null;
      try {
        guestText = store.read(guest);
      } catch {
        return { ok: false };
      }
      const theirs = parseHand(guestText);
      if (theirs && belongs(theirs)) return { ok: true, hand: theirs, from: guest };
    }
    return { ok: true, hand: null, from: null };
  };

  /**
   * Writes a hand down under the player's own name (taking away the guest's
   * copy it came from, if it did). When storage will not take it (it is
   * full), what storage holds of the hand is taken away instead, so that a
   * reload finds no hand rather than one that has moved on since, and this
   * page plays it from memory. `failed`: storage would do neither.
   */
  const write = (h: SavedHand, from: string | null): 'stored' | 'cleared' | 'failed' => {
    const own = key();
    try {
      store.write(own, serializeHand(h));
      memory = null;
      if (from !== null && from !== own) removeKey(from);
      return 'stored';
    } catch {
      const names = from !== null && from !== own ? [own, from] : [own];
      if (!names.map(removeKey).every(Boolean)) return 'failed';
      memory = { key: own, hand: h };
      return 'cleared';
    }
  };
  const forget = (): void => {
    memory = null;
    removeKey(key());
  };

  return {
    /** The hand of the player whose medals are on the table, as storage (or, for a hand storage would not keep, this page) has it now. */
    read(): Reading {
      const now = look();
      return now.ok ? { ok: true, hand: now.hand } : { ok: false };
    },

    /**
     * After a reset at the medal center the machine starts over: the hand in
     * play is thrown away, with the medals it was bet from, and the medal
     * center is told that this device's machine has started over. Only with
     * the card: a page that does not hold it reads whatever the page that does
     * has written since. Returns whether it started over.
     */
    restartIfDue(): boolean {
      if (!holding() || !bank.restartDue(GAME)) return false;
      forget();
      bank.restarted(GAME);
      return true;
    },

    /** Throws the hand in play away, as a reset does, if this page holds the card. */
    discard(): boolean {
      if (!holding()) return false;
      forget();
      return true;
    },

    /**
     * Deals a hand for a bet of `coins` medals on the pay table `payId`. The
     * hand is written down first and the medals taken after, in one go, so a
     * hand is never kept that was not bet for. A hand already in play is not
     * dealt over: it is handed back to be played first.
     */
    deal(coins: number, payId: PayTableId): DealOutcome {
      if (!holding()) return { kind: 'away' };
      const ledger = bank.getState().ledger;
      if (!ledger || !Number.isInteger(coins) || coins < 1 || coins > MAX_COINS) return { kind: 'away' };
      const before = look();
      if (before.ok && before.hand && !before.hand.drawn) return { kind: 'inPlay', hand: before.hand };
      if (bank.balance() < coins) return { kind: 'short' };
      const { hand, stub } = dealCards(random);
      const dealt: SavedHand = { v: HAND_VERSION, id: newId(), era: ledger.era, device: ledger.device, hand, stub, coins, payId, held: 0, drawn: false, receipts: true };
      const kept = write(dealt, null);
      if (kept === 'failed') {
        // Storage that can be read, but will neither take this hand nor let go of the last one, would show that one in
        // its place: nothing is bet. Storage that cannot even be read keeps nothing at all, and the hand is played from
        // memory here.
        if (before.ok) return { kind: 'unsaved' };
        memory = { key: key(), hand: dealt };
      }
      // The bet goes in under its receipt after the hand is written down: a browser that dies between the two leaves a
      // hand whose bet the medals do not hold, which is taken away unplayed (`square`).
      if (move(dealt, DEAL_STEP, -coins) !== 'applied') {
        // Nothing was bet, so nothing is dealt: the hand before (if it could be read) is put back as it was.
        memory = null;
        if (before.ok && before.hand) write(before.hand, null);
        else removeKey(key());
        return { kind: 'short' };
      }
      // The hand before this one is no longer kept: nothing will look at its receipts again.
      bank.forget(GAME, [dealt.id]);
      return { kind: 'dealt', hand: dealt };
    },

    /**
     * Notes which cards of the hand in play are held, so that a reload finds
     * them held. Returns the hand as it is now, or null when it is not the
     * hand in play here, or storage cannot be read just now (and the hand is
     * one storage keeps). The held cards are the page's to show either way:
     * the draw is told which they are.
     */
    hold(id: string, held: number): SavedHand | null {
      if (!holding() || !isMask(held)) return null;
      const now = look();
      const current = now.ok ? now.hand : remembered();
      if (!current || current.id !== id || current.drawn) return null;
      const next = { ...current, held };
      if (!now.ok || now.from === null) {
        // A hand only this page holds.
        memory = { key: key(), hand: next };
        return next;
      }
      // Holding cards bets and wins nothing: a write that does not take leaves the hand kept as it was, still dealt.
      try {
        store.write(key(), serializeHand(next));
        if (now.from !== key()) removeKey(now.from);
      } catch {
        // The draw is told the held cards.
      }
      return next;
    },

    /**
     * Draws the hand `id` holding `held`, and puts what it wins into the
     * medals. A hand that is kept on the device is written down as drawn (or,
     * when storage will not take that, taken away) before its win goes in;
     * when neither can be done, or it cannot be read back at all, nothing is
     * won yet and it stays dealt (`unsaved`), to be drawn once storage works.
     */
    draw(id: string, held: number): DrawOutcome {
      if (!holding()) return { kind: 'away' };
      const now = look();
      let current: SavedHand | null;
      let from: string | null;
      if (now.ok) {
        current = now.hand;
        from = now.from;
      } else {
        // Storage cannot be read: only a hand this page alone holds can be settled. One that storage keeps waits.
        current = remembered();
        from = null;
        if (!current || current.id !== id) return { kind: 'unsaved' };
      }
      if (!current || current.id !== id || current.drawn) return { kind: 'gone', hand: current };
      // Drawn under receipts whichever way it was dealt: a hand dealt before receipts has its win checked for too.
      const drawn: SavedHand = { ...current, held: isMask(held) ? held : current.held, drawn: true, receipts: true };
      if (from !== null) {
        if (write(drawn, from) === 'failed') return { kind: 'unsaved' };
      } else {
        // A hand no storage holds: drawn here, it can never be drawn again. It is written down if storage will take it.
        memory = { key: key(), hand: drawn };
        try {
          store.write(key(), serializeHand(drawn));
          memory = null;
        } catch {
          // Shown from memory.
        }
      }
      // Written down as drawn first, then the win in under its receipt: a browser that dies between the two leaves a hand
      // drawn whose win the next page holding the card pays (`square`), once.
      const won = wonBy(drawn);
      // The medal floor hears of a win once, as it goes in.
      if (won > 0 && move(drawn, PAY_STEP, won) === 'applied') floorReport(GAME, { won, prize: { medals: won, label: FLOOR_HANDS[rankCards(cardsOf(drawn))] } });
      return { kind: 'drawn', hand: drawn, won };
    },
  };
}

export type MedalPlay = ReturnType<typeof createMedalPlay>;

/** Whether the player has been told that the machine plays with their medals now. Storage that cannot be read tells them again. */
export function noticeSeen(store: HandStore): boolean {
  try {
    return store.read(NOTICE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Notes that the player has been told. */
export function markNoticeSeen(store: HandStore): void {
  try {
    store.write(NOTICE_KEY, '1');
  } catch {
    // They are told again next time.
  }
}
