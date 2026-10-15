/**
 * Three Card Poker on the medal center's floor: the table plays with the
 * player's own medals, the ones every game at the Medal Game Center shares
 * (MedalCenter/bank.ts). This file is the table's side of that, and nothing
 * here draws anything.
 *
 * A hand takes and gives medals at three moments, each exactly once:
 *
 * - **The deal.** The Ante and the Pair Plus bet come out of the medals
 *   together, and the hand is written down with its six cards, so that the
 *   dealer's three are fixed from the moment they are dealt.
 * - **Play.** A Play bet as big as the Ante comes out. Folding takes nothing.
 * - **The settlement.** What the hand wins goes back in: the Ante and Play
 *   bets by the showdown, the Ante Bonus and Pair Plus on the player's own
 *   cards. A fold gives up the Ante and the Pair Plus bet, as the table's
 *   rules have always said.
 *
 * Each step writes the hand down as soon as its medals have moved, and none
 * is taken twice: a hand is dealt only when no hand is still to be paid, Play
 * is taken only from a hand that has not been decided, and a hand is paid only
 * once it has been decided and not before. The hand is read back from storage
 * before every step, so a second tab, or the page after a reload, carries on
 * from wherever the hand was left rather than from what it remembers.
 *
 * **A reload mid-hand resumes the hand; it never gives the stakes back.**
 * Giving them back would let a player look at three bad cards, reload, and
 * have the Ante again: a fold that costs nothing. So the hand comes back as it
 * was, its dealer's cards still down, and waits for Play or Fold; or, if the
 * player had decided already, it is paid as soon as the table holds the card
 * again.
 *
 * Medals move only while the table holds the member's card (see bank.ts):
 * nothing is bet on a page whose medals are being played in another tab. A
 * hand is kept for the player whose medals it was dealt from (a guest's apart
 * from an account's) and for the era it was dealt in: after the Medal Game
 * Center's reset, every medal from before it is gone, and so is any hand that
 * was on the table then.
 */

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

/** Where the hand on the table is kept on this device: a guest's under this name, an account's under it and the account. */
export const TABLE_KEY = 'three-card-poker-table';
export const tableKey = (owner: string | null): string => (owner === null ? TABLE_KEY : `${TABLE_KEY}:${owner}`);
/** Set once the player has read that the table plays with their medals now. */
export const NOTICE_KEY = 'three-card-poker-medals-notice';

export const TABLE_VERSION = 1;

/** A hand on the table, as it is kept. */
export interface SavedHand {
  v: typeof TABLE_VERSION;
  /** The medals' era when the stakes were taken (how many times they had been reset). */
  era: number;
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
  if (saved.v !== TABLE_VERSION || !isWhole(saved.era, 0, 1_000_000)) return null;
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

/** What the table needs of the medals: the medal center's bank, as one seat at it sees it. */
export interface TableMedals {
  /** Whether this table holds the member's card, so that medals may be taken and given. */
  holding: () => boolean;
  /** Whose medals are on the table: an account's id, or null for a guest's. */
  owner: () => string | null;
  /** How many times the medals have been reset, or null until they have been read. */
  era: () => number | null;
  /** The medals that can be bet now. */
  balance: () => number;
  /** Takes medals out. False when they are not there to take, or the card is not here. */
  take: (medals: number) => boolean;
  /** Puts medals won back in. */
  give: (medals: number) => boolean;
}

/** Where hands are kept: this device's storage. Any call may throw, when storage is blocked. */
export interface TableStore {
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
}

/** Why a step was not taken: the card is elsewhere, a hand is still on the table, no hand is, it was decided already, the bets will not do, or the medals are not there. */
export type Refusal = 'card' | 'busy' | 'none' | 'decided' | 'bets' | 'short';
export type Step = { ok: true; hand: SavedHand } | { ok: false; why: Refusal };

export type Table = ReturnType<typeof createTable>;

export function createTable(medals: TableMedals, store: TableStore) {
  // What was last read or written under each name, for a browser whose storage cannot be read: there the table
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
  const writeText = (key: string, text: string): void => {
    memo.set(key, text);
    try {
      store.write(key, text);
    } catch {
      // Kept in memory: the hand lasts as long as the page, as the medals do in a browser that keeps nothing.
    }
  };
  const removeText = (key: string): void => {
    memo.set(key, null);
    try {
      store.remove(key);
    } catch {
      // Nothing to do: it is gone from memory, and a hand of another era is never played.
    }
  };

  const key = (): string => tableKey(medals.owner());
  const refuse = (why: Refusal): Step => ({ ok: false, why });

  /** The hand on the table for the medals on it, or null. A hand from before the medals' last reset is no hand. */
  const current = (): SavedHand | null => {
    const era = medals.era();
    const hand = parseHand(readText(key()));
    return hand && era !== null && hand.era === era ? hand : null;
  };

  return {
    /** The hand on the table, as storage has it now. */
    open: current,

    /** The hand's text as storage has it, to tell whether another tab has written it since. */
    text: (): string | null => {
      const hand = current();
      return hand ? serializeHand(hand) : null;
    },

    /**
     * Deals a hand: the Ante and Pair Plus come out of the medals, once, and the
     * six cards are written down with them. There have to be enough medals left
     * behind for the Play bet, as at the table before.
     */
    deal(bets: Bets, cards: Deal): Step {
      if (!medals.holding()) return refuse('card');
      const era = medals.era();
      if (era === null) return refuse('card');
      const before = current();
      if (before && !before.paid) return refuse('busy');
      if (!validBets(bets)) return refuse('bets');
      const stake = bets.ante + bets.pairPlus;
      if (medals.balance() < stake + bets.ante) return refuse('short');
      if (!medals.take(stake)) return refuse('short');
      const hand: SavedHand = { v: TABLE_VERSION, era, player: [...cards.player], dealer: [...cards.dealer], bets: { ...bets }, decision: null, paid: false };
      writeText(key(), serializeHand(hand));
      return { ok: true, hand };
    },

    /** Plays the hand: a Play bet as big as the Ante comes out of the medals, once. */
    play(): Step {
      if (!medals.holding()) return refuse('card');
      const hand = current();
      if (!hand || hand.paid) return refuse('none');
      if (hand.decision !== null) return refuse('decided');
      if (!medals.take(hand.bets.ante)) return refuse('short');
      const next: SavedHand = { ...hand, decision: 'play' };
      writeText(key(), serializeHand(next));
      return { ok: true, hand: next };
    },

    /** Folds the hand. Nothing more comes out; the Ante and Pair Plus are lost when it is paid. */
    fold(): Step {
      if (!medals.holding()) return refuse('card');
      const hand = current();
      if (!hand || hand.paid) return refuse('none');
      if (hand.decision !== null) return refuse('decided');
      const next: SavedHand = { ...hand, decision: 'fold' };
      writeText(key(), serializeHand(next));
      return { ok: true, hand: next };
    },

    /**
     * Pays a decided hand: what it won goes back into the medals, once. The hand
     * is written down as paid first, so that nothing a moment later can pay it
     * again. Null when there is nothing to pay, or the card is not here.
     */
    pay(): { hand: SavedHand; settlement: Settlement } | null {
      if (!medals.holding()) return null;
      const hand = current();
      if (!hand || hand.paid || hand.decision === null) return null;
      const settlement = settle(hand.bets, hand.decision, hand.player, hand.dealer);
      const next: SavedHand = { ...hand, paid: true };
      writeText(key(), serializeHand(next));
      if (settlement.returned > 0) medals.give(settlement.returned);
      return { hand: next, settlement };
    },

    /**
     * Starts the table over after the medals have been reset: a hand left from
     * an era before is thrown away (its stakes went with the medals). A hand of
     * the medals' own era is another tab's or this one's, played since, and stays.
     */
    restart(): void {
      const era = medals.era();
      if (era === null) return;
      const name = key();
      const hand = parseHand(readText(name));
      if (hand && hand.era !== era) removeText(name);
    },
  };
}
