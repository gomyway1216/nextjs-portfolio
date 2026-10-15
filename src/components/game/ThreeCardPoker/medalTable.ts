/**
 * Three Card Poker on the medal center's floor: the table plays with the
 * player's own medals, the ones every game at the Medal Game Center shares
 * (MedalCenter/bank.ts). This file is the table's side of that, and nothing
 * here draws anything.
 *
 * A hand takes and gives medals at three moments, each exactly once:
 *
 * - **The deal.** The hand is written down with its six cards, so that the
 *   dealer's three are fixed from the moment they are dealt, and the Ante and
 *   the Pair Plus bet come out of the medals together.
 * - **Play.** A Play bet as big as the Ante comes out. Folding takes nothing.
 * - **The settlement.** What the hand wins goes back in: the Ante and Play
 *   bets by the showdown, the Ante Bonus and Pair Plus on the player's own
 *   cards. A fold gives up the Ante and the Pair Plus bet, as the table's
 *   rules have always said.
 *
 * Each step writes the hand down first and moves the medals after, and none
 * is taken twice: a hand is dealt only when no hand is still to be paid, Play
 * is taken only from a hand that has not been decided, and a hand is paid only
 * once it has been decided and not before. The hand is read back from storage
 * before every step, so a second tab, or the page after a reload, carries on
 * from wherever the hand was left rather than from what it remembers.
 *
 * A browser that can be read but will not take a write (its storage is full)
 * moves no medals at all: a step whose hand could not be written down is not
 * taken, since a reload would otherwise find the hand as it was before the
 * medals moved, and take or pay them again. A browser that keeps nothing at
 * all plays from memory, as the medals themselves then do, and a reload starts
 * both over together.
 *
 * **A reload mid-hand resumes the hand; it never gives the stakes back.**
 * Giving them back would let a player look at three bad cards, reload, and
 * have the Ante again: a fold that costs nothing. So the hand comes back as it
 * was, its dealer's cards still down, and waits for Play or Fold; or, if the
 * player had decided already, it is paid as soon as the table holds the card
 * again.
 *
 * Medals move only while the table holds the member's card (see bank.ts):
 * nothing is bet on a page whose medals are being played in another tab.
 *
 * A hand belongs to the medals it was dealt from, and to nobody else's. The
 * medals on this device are kept under a name made up for them (`Ledger.device`:
 * a guest's medals have one, an account's another), and the hand is kept under
 * that name too, with their era (`Ledger.era`):
 *
 * - A guest's medals that become an account's as the player signs in (bank.ts
 *   moves them, name and all) take their hand with them. The new guest's medals
 *   begun after signing out have a new name: they cannot play a hand the old
 *   ones paid for, and dealing with them leaves that hand where it is.
 * - After the Medal Game Center's reset every medal from before it is gone,
 *   and so is any hand that was on the table then: a hand of another era is no
 *   hand.
 */

import { isDevice } from '../MedalCenter/ledger';
import { HAND_SIZE, cardAt, cardIndex, settle, type Bets, type Card, type Decision, type Deal, type Settlement } from './engine';

/** The game's name at the medal center: its seat, and its restarts after a reset. */
export const TCP_GAME = 'three-card-poker';

/**
 * Medals one press of a betting spot puts on it. 1 is a medal cabinet's 1BET
 * button; 5 and 10 save pressing it again and again.
 */
export const BET_STEPS = [1, 5, 10] as const;
/** The most on the Ante, and on Pair Plus. The Play bet is the Ante's size, so a hand risks at most three times this. */
export const SPOT_MAX = 10;
export const HAND_MAX = 3 * SPOT_MAX;

/** Where the hand on the table is kept on this device: under this name and the name of the medals it was dealt from. */
export const TABLE_KEY = 'three-card-poker-table';
export const tableKey = (device: string): string => `${TABLE_KEY}:${device}`;
/** Set once the player has read that the table plays with their medals now. */
export const NOTICE_KEY = 'three-card-poker-medals-notice';

export const TABLE_VERSION = 1;

/** A hand on the table, as it is kept. */
export interface SavedHand {
  v: typeof TABLE_VERSION;
  /** The medals the stakes were taken from: their era (how many times they had been reset), and their device name. */
  era: number;
  device: string;
  player: Card[];
  dealer: Card[];
  bets: Bets;
  /** Null until the player plays or folds. */
  decision: Decision | null;
  /** Whether what the hand won has gone back into the medals. */
  paid: boolean;
}

const isWhole = (value: unknown, low: number, high: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;

/** Whether bets can be dealt: an Ante of 1 to `SPOT_MAX` medals, and Pair Plus of none up to as many. */
export const validBets = (bets: Bets): boolean => isWhole(bets.ante, 1, SPOT_MAX) && isWhole(bets.pairPlus, 0, SPOT_MAX);

/** The hand as text: its six cards as numbers, the player's three first. */
export function serializeHand(hand: SavedHand): string {
  return JSON.stringify({
    v: TABLE_VERSION,
    era: hand.era,
    device: hand.device,
    cards: [...hand.player, ...hand.dealer].map(cardIndex),
    ante: hand.bets.ante,
    pairPlus: hand.bets.pairPlus,
    decision: hand.decision,
    paid: hand.paid,
  });
}

/**
 * Reads a hand back, or null when the text is not one. Whatever storage holds
 * is checked field by field, and anything out of shape is no hand at all: a
 * card dealt twice, a bet over the table's limit, a hand paid before it was
 * decided, a text from another version of the table. Nothing in it throws.
 */
export function parseHand(text: unknown): SavedHand | null {
  if (typeof text !== 'string' || text.length > 1000) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  if (saved.v !== TABLE_VERSION || !isWhole(saved.era, 0, 1_000_000) || !isDevice(saved.device)) return null;
  const { cards } = saved;
  if (!Array.isArray(cards) || cards.length !== 2 * HAND_SIZE || !cards.every((card) => isWhole(card, 0, 51)) || new Set(cards).size !== cards.length) return null;
  const bets = { ante: saved.ante, pairPlus: saved.pairPlus };
  if (!isWhole(bets.ante, 1, SPOT_MAX) || !isWhole(bets.pairPlus, 0, SPOT_MAX)) return null;
  const decision = saved.decision;
  if (decision !== null && decision !== 'play' && decision !== 'fold') return null;
  if (typeof saved.paid !== 'boolean' || (saved.paid && decision === null)) return null;
  const dealt = (cards as number[]).map(cardAt);
  return {
    v: TABLE_VERSION,
    era: saved.era,
    device: saved.device,
    player: dealt.slice(0, HAND_SIZE),
    dealer: dealt.slice(HAND_SIZE),
    bets: { ante: bets.ante, pairPlus: bets.pairPlus },
    decision,
    paid: saved.paid,
  };
}

/** How a hand stands: still to be decided, decided and still to be paid, or over. */
export const handStage = (hand: SavedHand | null): 'none' | 'deciding' | 'unpaid' | 'over' =>
  !hand ? 'none' : hand.paid ? 'over' : hand.decision === null ? 'deciding' : 'unpaid';

/** The medals on the table as their ledger names them: how many times they have been reset, and the device name they are kept under. */
export interface MedalsOnTable {
  era: number;
  device: string;
}

/** What the table needs of the medals: the medal center's bank, as one seat at it sees it. */
export interface TableMedals {
  /** Whether this table holds the member's card, so that medals may be taken and given. */
  holding: () => boolean;
  /** Which medals are on the table, or null until they have been read. */
  ledger: () => MedalsOnTable | null;
  /** The medals that can be bet now. */
  balance: () => number;
  /** Takes medals out. False when they are not there to take, or the card is not here. */
  take: (medals: number) => boolean;
  /** Puts medals won back in. */
  give: (medals: number) => boolean;
}

/** Where hands are kept: this device's storage. Any call may throw, when storage is blocked or full. */
export interface TableStore {
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
}

/**
 * Why a step was not taken: the card is elsewhere, a hand is still on the table, no hand is, it was decided already,
 * the bets will not do, the medals are not there, or the browser would not keep the hand (so no medal moved).
 */
export type Refusal = 'card' | 'busy' | 'none' | 'decided' | 'bets' | 'short' | 'kept';
export type Step = { ok: true; hand: SavedHand } | { ok: false; why: Refusal };

export type Table = ReturnType<typeof createTable>;

export function createTable(medals: TableMedals, store: TableStore) {
  // What was last read or written under each name, for a browser whose storage cannot be used at all: there the table
  // plays on from memory, as the medals themselves do.
  const memo = new Map<string, string | null>();
  const readText = (key: string): string | null => {
    try {
      const text = store.read(key);
      memo.set(key, text);
      return text;
    } catch {
      return memo.get(key) ?? null;
    }
  };
  /** Whether storage can be read at all. Storage that can be read and will not take a write is full, not missing. */
  const readable = (key: string): boolean => {
    try {
      store.read(key);
      return true;
    } catch {
      return false;
    }
  };
  /**
   * Writes text under a name, or takes it away (null). False when storage can be read but would not take it: the
   * step is not taken then. Where storage cannot be used at all, what is written is kept in memory.
   */
  const writeText = (key: string, text: string | null): boolean => {
    try {
      if (text === null) store.remove(key);
      else store.write(key, text);
    } catch {
      if (readable(key)) return false;
    }
    memo.set(key, text);
    return true;
  };

  const refuse = (why: Refusal): Step => ({ ok: false, why });

  /**
   * The hand on the table for the medals on it: the one kept under their name, if it is of their era. A hand from
   * before the medals' last reset is no hand.
   */
  const find = (): SavedHand | null => {
    const ledger = medals.ledger();
    if (!ledger) return null;
    const hand = parseHand(readText(tableKey(ledger.device)));
    return hand && hand.device === ledger.device && hand.era === ledger.era ? hand : null;
  };

  /** Writes the hand down under the name of the medals it was dealt from. False when it could not be written. */
  const keep = (hand: SavedHand): boolean => writeText(tableKey(hand.device), serializeHand(hand));

  return {
    /** The hand on the table, as storage has it now. */
    open: (): SavedHand | null => find(),

    /**
     * Deals a hand: the six cards are written down, and then the Ante and Pair Plus come out of the medals, once.
     * There have to be enough medals left behind for the Play bet, as at the table before.
     */
    deal(bets: Bets, cards: Deal): Step {
      if (!medals.holding()) return refuse('card');
      const ledger = medals.ledger();
      if (!ledger) return refuse('card');
      const before = find();
      if (before && !before.paid) return refuse('busy');
      if (!validBets(bets)) return refuse('bets');
      const stake = bets.ante + bets.pairPlus;
      if (medals.balance() < stake + bets.ante) return refuse('short');
      const key = tableKey(ledger.device);
      const was = readText(key);
      const hand: SavedHand = {
        v: TABLE_VERSION,
        era: ledger.era,
        device: ledger.device,
        player: [...cards.player],
        dealer: [...cards.dealer],
        bets: { ...bets },
        decision: null,
        paid: false,
      };
      if (!keep(hand)) return refuse('kept');
      if (!medals.take(stake)) {
        writeText(key, was);
        return refuse('short');
      }
      return { ok: true, hand };
    },

    /** Plays the hand: it is written down as played, and then a Play bet as big as the Ante comes out of the medals, once. */
    play(): Step {
      if (!medals.holding()) return refuse('card');
      const hand = find();
      if (!hand || hand.paid) return refuse('none');
      if (hand.decision !== null) return refuse('decided');
      if (medals.balance() < hand.bets.ante) return refuse('short');
      const next: SavedHand = { ...hand, decision: 'play' };
      if (!keep(next)) return refuse('kept');
      if (!medals.take(hand.bets.ante)) {
        keep(hand);
        return refuse('short');
      }
      return { ok: true, hand: next };
    },

    /** Folds the hand. Nothing more comes out; the Ante and Pair Plus are lost when it is paid. */
    fold(): Step {
      if (!medals.holding()) return refuse('card');
      const hand = find();
      if (!hand || hand.paid) return refuse('none');
      if (hand.decision !== null) return refuse('decided');
      const next: SavedHand = { ...hand, decision: 'fold' };
      if (!keep(next)) return refuse('kept');
      return { ok: true, hand: next };
    },

    /**
     * Pays a decided hand: it is written down as paid, and then what it won goes back into the medals, once. Null when
     * there is nothing to pay, the card is not here, or the hand could not be written down as paid (it is paid later).
     */
    pay(): { hand: SavedHand; settlement: Settlement } | null {
      if (!medals.holding()) return null;
      const hand = find();
      if (!hand || hand.paid || hand.decision === null) return null;
      const settlement = settle(hand.bets, hand.decision, hand.player, hand.dealer);
      const next: SavedHand = { ...hand, paid: true };
      if (!keep(next)) return null;
      if (settlement.returned > 0) medals.give(settlement.returned);
      return { hand: next, settlement };
    },

    /**
     * Starts the table over after the medals have been reset: a hand kept under the medals' name from an era before
     * (its stakes went with the medals) is thrown away. A hand of the medals' own era is another tab's or this one's,
     * played since, and stays.
     */
    restart(): void {
      const ledger = medals.ledger();
      if (!ledger || !medals.holding()) return;
      const key = tableKey(ledger.device);
      const hand = parseHand(readText(key));
      if (hand && hand.era !== ledger.era) writeText(key, null);
    },
  };
}
