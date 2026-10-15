/**
 * Blackjack on the medal center's floor: the table plays with the player's
 * medals, which are kept by the medal center (`MedalCenter/bank.ts`), and it
 * keeps the hand on the table in this browser, so that a reload in the
 * middle of a hand carries on with it.
 *
 * ## Medals out and back, once each
 *
 * - A stake is taken from the player's medals as it is committed: the bet
 *   when the hand is dealt, and each double, split and insurance as it is
 *   made.
 * - What the hand brings back (every stake not lost, and what it won) is put
 *   back when the hand is settled, after the dealer's cards have been shown.
 * - The table and the medals are kept apart in this browser's storage, and
 *   either can fail to be written (storage full, say). So each step writes the
 *   hand down first, as it will be after the step, and only then moves the
 *   medals (`step` below). A browser that will not keep the hand moves no
 *   medal for it; a move of medals the medal center could not keep has the
 *   hand written back as it was, so that after a reload both are as they were.
 *   Either way a stake is never lost and a hand's medals never come back
 *   twice.
 *
 * ## A reload in the middle of a hand: the hand carries on
 *
 * A medal machine that loses its power picks the game up where it was when
 * it comes back on, and so does this table. The shoe and the hand are kept;
 * after a reload the same cards are on the table with the same stakes on
 * them, and the player plays on. Nothing is handed back for a hand left
 * unfinished: that would let a player deal, see a poor hand and reload it
 * away. A hand whose cards were all out, but whose medals had not been put
 * back yet, has them put back as soon as the table can.
 *
 * ## The card, other tabs, and the reset
 *
 * Only the page that holds the medal center's card writes the player's
 * medals, and so only that page writes the table. Before every step the
 * table reads what is kept: when another tab has played at the table since,
 * its hand is the one on the table, and the step is not made. After the
 * medal center's reset the table starts over: the shoe and any hand on it go
 * with the medals they were played with, and nothing comes back for them.
 * The record of hands played is kept, as the reset keeps the Medal Pusher's
 * record book.
 *
 * The chips the table had before it came onto the floor were never kept
 * anywhere (they were only in the page), so there is nothing of them to read:
 * they are retired, not turned into medals.
 */

import {
  DECKS,
  MAX_HANDS,
  PENETRATION,
  RANKS,
  SUITS,
  act as playAction,
  answerInsurance,
  cardsLeft,
  createShoe,
  hiLo,
  insuranceCost,
  legalActions,
  needsShuffle,
  settle,
  startRound,
  type Action,
  type Card,
  type Phase,
  type PlayerHand,
  type Rank,
  type Round,
  type Shoe,
} from './engine';

/** The table's name at the medal center: its seat, and its restarts after a reset. */
export const GAME = 'blackjack';

/**
 * Bets, in medals. Japanese medal blackjack machines take a medal at a time
 * with a 1 BET button, up to a small maximum a hand: 1 to 10 medals on the
 * machine remembered in OKWAVE q7622814 / Yahoo! Chiebukuro q1192622641, and
 * 10 medals in the example on the shop Bayon's guide to its single-player
 * machine (bayon-game.com/?p=5135). Here: 1 to 10, starting at 2, an even
 * bet, which a blackjack pays in full.
 */
export const MIN_BET = 1;
export const MAX_BET = 10;
export const DEFAULT_BET = 2;

/** Where a table is kept in this browser: a guest's under this name, an account's under it and the account. */
export const TABLE_KEY = 'blackjack-table';
export const tableKey = (owner: string | null): string => (owner === null ? TABLE_KEY : `${TABLE_KEY}:${owner}`);
export const TABLE_VERSION = 1;
/** Where this browser notes that the player has been told, once, that the table now plays with their medals. */
export const NOTICE_KEY = 'blackjack-medals-notice';

/** The player's record at this table. Not medals: how the hands went. */
export interface Stats {
  hands: number;
  wins: number;
  pushes: number;
  losses: number;
  blackjacks: number;
  /** Plays made, and how many of them were the chart's. */
  decisions: number;
  agreed: number;
  /** Medals won less medals lost, over every hand settled here. */
  net: number;
}

export const EMPTY_STATS: Stats = { hands: 0, wins: 0, pushes: 0, losses: 0, blackjacks: 0, decisions: 0, agreed: 0, net: 0 };

export interface TableSave {
  v: typeof TABLE_VERSION;
  /** The era of the player's medals (how many times the medal center has been reset) the table was last played in. */
  era: number;
  /** How many hands have been dealt here. */
  hand: number;
  /** The bet that stays up for the next hand. */
  bet: number;
  /** The shoe, as it is after the hand on the table. */
  shoe: Shoe | null;
  /** The hand on the table: being played, or played out. Its shoe is `shoe`. */
  round: Round | null;
  /** Whether the hand's medals have been put back. A hand still being played has not been settled. */
  paid: boolean;
  /** The Hi-Lo count of the cards of this shoe's settled hands. */
  count: number;
  /** Cards in the shoe when the hand on the table was dealt. */
  left: number | null;
  stats: Stats;
}

export const freshTable = (era: number, stats: Stats = EMPTY_STATS, bet: number = DEFAULT_BET): TableSave => ({
  v: TABLE_VERSION,
  era,
  hand: 0,
  bet,
  shoe: null,
  round: null,
  paid: true,
  count: 0,
  left: null,
  stats,
});

/** Whether there is a hand on the table not yet finished with: still being played, or played out with its medals not yet put back. */
export const unsettled = (save: Pick<TableSave, 'round' | 'paid'>): boolean => save.round !== null && !(save.round.phase === 'done' && save.paid);

// ── Text ────────────────────────────────────────────────────────────────────

/** A card as two letters: its rank, and its suit as s, h, d or c (♠ ♥ ♦ ♣). */
const SUIT_LETTERS = ['s', 'h', 'd', 'c'] as const;
const cardText = (card: Card): string => `${card.rank}${SUIT_LETTERS[SUITS.indexOf(card.suit)]}`;
const cardsText = (cards: readonly Card[]): string => cards.map(cardText).join('');

function readCards(text: unknown, fewest: number, most: number): Card[] | null {
  if (typeof text !== 'string' || text.length % 2 !== 0 || text.length < fewest * 2 || text.length > most * 2) return null;
  const cards: Card[] = [];
  for (let i = 0; i < text.length; i += 2) {
    const rank = text[i] as Rank;
    const suit = SUITS[SUIT_LETTERS.indexOf(text[i + 1] as (typeof SUIT_LETTERS)[number])];
    if (!RANKS.includes(rank) || suit === undefined) return null;
    cards.push({ rank, suit });
  }
  return cards;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown, most: number): number | null => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= most ? value : null);
const BIG = 1_000_000_000;
/** The most cards a hand or the dealer can hold: a hand of 21 aces, which a shoe of six decks has. */
const MOST_CARDS = 21;

function readShoe(value: unknown): Shoe | null {
  if (!isRecord(value) || value.decks !== DECKS) return null;
  const size = DECKS * 52;
  const cards = readCards(value.cards, size, size);
  const next = count(value.next, size);
  if (!cards || next === null || value.cutIndex !== Math.floor(size * PENETRATION)) return null;
  // Six of every card, as a shoe of six decks has.
  const seen = new Map<string, number>();
  for (const card of cards) seen.set(cardText(card), (seen.get(cardText(card)) ?? 0) + 1);
  if (seen.size !== 52 || [...seen.values()].some((n) => n !== DECKS)) return null;
  return { decks: DECKS, cards, next, cutIndex: value.cutIndex };
}

const PHASES: readonly Phase[] = ['insurance', 'player', 'done'];

function readRound(value: unknown, shoe: Shoe): Round | null {
  if (!isRecord(value) || !PHASES.includes(value.phase as Phase) || !Array.isArray(value.hands)) return null;
  const bet = count(value.bet, MAX_BET);
  const dealer = readCards(value.dealer, 2, MOST_CARDS);
  if (bet === null || bet < MIN_BET || !dealer || value.hands.length < 1 || value.hands.length > MAX_HANDS) return null;
  const hands: PlayerHand[] = [];
  for (const stored of value.hands) {
    if (!isRecord(stored)) return null;
    const cards = readCards(stored.cards, 1, MOST_CARDS);
    const { doubled, split, splitAce, done } = stored;
    if (!cards || typeof doubled !== 'boolean' || typeof split !== 'boolean' || typeof splitAce !== 'boolean' || typeof done !== 'boolean') return null;
    if (stored.bet !== (doubled ? 2 * bet : bet)) return null;
    hands.push({ cards, bet: stored.bet, doubled, split, splitAce, done });
  }
  const active = count(value.active, hands.length - 1);
  const phase = value.phase as Phase;
  const base = { shoe, bet, dealer, hands, active: active ?? 0, phase, insurance: 0, result: null, whole: true };
  const insurance = value.insurance === 0 ? 0 : value.insurance === insuranceCost(base) && insuranceCost(base) > 0 ? insuranceCost(base) : null;
  if (active === null || insurance === null) return null;
  const round: Round = { ...base, insurance };
  if (phase === 'insurance') {
    // Asked before anything else is done: one hand of two cards, nothing insured yet, an ace showing.
    return hands.length === 1 && hands[0].cards.length === 2 && insurance === 0 && dealer.length === 2 && dealer[0].rank === 'A' && insuranceCost(round) > 0 ? round : null;
  }
  if (phase === 'player') return legalActions(round).stand ? round : null;
  // Played out: scored again from its cards, so what it brings back is what they say.
  return hands.every((hand) => hand.done && hand.cards.length >= 2) ? settle(round) : null;
}

function readStats(value: unknown): Stats | null {
  if (!isRecord(value)) return null;
  const stats = { ...EMPTY_STATS };
  for (const key of Object.keys(EMPTY_STATS) as (keyof Stats)[]) {
    const stored = value[key];
    if (key === 'net') {
      if (typeof stored !== 'number' || !Number.isSafeInteger(stored) || Math.abs(stored) > BIG) return null;
      stats.net = stored;
    } else {
      const n = count(stored, BIG);
      if (n === null) return null;
      stats[key] = n;
    }
  }
  return stats;
}

/** The table as text: the cards two letters each, so a shoe is a short line. */
export function serializeTable(save: TableSave): string {
  const round = save.round;
  return JSON.stringify({
    v: TABLE_VERSION,
    era: save.era,
    hand: save.hand,
    bet: save.bet,
    shoe: save.shoe ? { decks: save.shoe.decks, cards: cardsText(save.shoe.cards), next: save.shoe.next, cutIndex: save.shoe.cutIndex } : null,
    round: round
      ? {
          bet: round.bet,
          dealer: cardsText(round.dealer),
          hands: round.hands.map((hand) => ({ cards: cardsText(hand.cards), bet: hand.bet, doubled: hand.doubled, split: hand.split, splitAce: hand.splitAce, done: hand.done })),
          active: round.active,
          phase: round.phase,
          insurance: round.insurance,
        }
      : null,
    paid: save.paid,
    count: save.count,
    left: save.left,
    stats: save.stats,
  });
}

/**
 * Reads a table back, or null when the text is not one this version wrote.
 * Like the medal center's ledger, a table damaged anywhere is not read at
 * all: a hand read wrongly could bring back medals it never won.
 */
export function parseTable(text: unknown): TableSave | null {
  if (typeof text !== 'string' || text.length > 16_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== TABLE_VERSION) return null;
  const era = count(value.era, BIG);
  const hand = count(value.hand, BIG);
  const bet = count(value.bet, MAX_BET);
  const stats = readStats(value.stats);
  const runningCount = typeof value.count === 'number' && Number.isSafeInteger(value.count) && Math.abs(value.count) <= DECKS * 52 ? value.count : null;
  const left = value.left === null ? null : count(value.left, DECKS * 52);
  if (era === null || hand === null || bet === null || bet < MIN_BET || !stats || runningCount === null || typeof value.paid !== 'boolean') return null;
  if (value.left !== null && left === null) return null;
  const shoe = value.shoe === null ? null : readShoe(value.shoe);
  if (value.shoe !== null && !shoe) return null;
  let round: Round | null = null;
  if (value.round !== null) {
    if (!shoe) return null;
    round = readRound(value.round, shoe);
    if (!round) return null;
  }
  // Only a hand played out can have had its medals put back.
  if (value.paid && round && round.phase !== 'done') return null;
  return { v: TABLE_VERSION, era, hand, bet, shoe, round, paid: round ? value.paid : true, count: runningCount, left, stats };
}

// ── The table at the medal center ───────────────────────────────────────────

/** What the table needs of the medal center's bank (`bank()` in MedalCenter/bank.ts). */
export interface TableBank {
  take: (medals: number) => boolean;
  give: (medals: number) => boolean;
  /** The medals that can be played now. */
  balance: () => number;
  owner: () => string | null;
  restartDue: (game: string) => boolean;
  restarted: (game: string) => void;
  /** `kept`: whether the bank's last write to this browser's storage took. */
  getState: () => { ledger: { era: number } | null; kept: boolean };
}

/** Where the table is kept: this browser's storage. Either may throw, when storage is blocked or full. */
export interface Shelf {
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
}

/**
 * Why a step was not made:
 * - `closed`: no player's table is open, or the medals on the table are not that player's;
 * - `away`: this page does not hold the card;
 * - `moved`: the table was played in another tab, or started over after a reset, since this page last looked: what
 *   is on it now comes back, to be shown, and nothing was done;
 * - `short`: the player has not that many medals;
 * - `unsaved`: this browser would not keep the table (its storage for the site is full, say), so no medal was moved;
 * - `not-now`: the step is not one the hand on the table can take.
 */
export type Refusal = 'closed' | 'away' | 'moved' | 'short' | 'unsaved' | 'not-now';
export type Step = { ok: true; save: TableSave } | { ok: false; why: Refusal; save: TableSave };

export type MedalTable = ReturnType<typeof createMedalTable>;

export function createMedalTable({ bank, shelf, holding, random = Math.random }: { bank: TableBank; shelf: Shelf; holding: () => boolean; random?: () => number }) {
  /** Whose table is open: an account's id, null for a guest's, undefined before one is. */
  let owner: string | null | undefined;
  let save: TableSave = freshTable(0);
  /** The table's text as this page last read or wrote it. Different text in storage was written by another tab. Undefined when storage cannot be read. */
  let seen: string | null | undefined;
  /** A text found where the table is kept that is not a table: put aside, not written over. */
  let unread: string | null = null;
  /**
   * Whether the table on this page is ahead of the one kept: steps whose medals the medal center could not keep
   * (`step`). Kept is then the table as it was before them, which goes with the medals the medal center kept.
   */
  let ahead = false;

  const era = (): number => bank.getState().ledger?.era ?? 0;
  const key = (): string => tableKey(owner ?? null);

  const read = (): string | null | undefined => {
    try {
      return shelf.read(key());
    } catch {
      return undefined;
    }
  };

  const load = (text: string | null | undefined): TableSave => {
    const parsed = typeof text === 'string' ? parseTable(text) : null;
    unread = typeof text === 'string' && !parsed ? text : null;
    return parsed ?? freshTable(era());
  };

  /**
   * Writes a table to storage (not to the page): `kept` when storage has it; `failed` when storage works but would
   * not take it (full, say); `nowhere` when this browser keeps nothing at all (its storage cannot even be read), so
   * that the table, like the medals, lives on this page alone and is consistent there.
   */
  const put = (next: TableSave): 'kept' | 'failed' | 'nowhere' => {
    const text = serializeTable(next);
    try {
      if (unread !== null) {
        shelf.write(`${key()}#unread`, unread);
        unread = null;
      }
      shelf.write(key(), text);
      seen = text;
      return 'kept';
    } catch {
      return read() === undefined ? 'nowhere' : 'failed';
    }
  };

  /** Writes back the text that was kept before a step (nothing kept is a fresh table). */
  const putBack = (text: string | null | undefined): void => {
    if (text === undefined) return;
    const back = text ?? serializeTable(freshTable(era()));
    try {
      shelf.write(key(), back);
      seen = back;
    } catch {
      // Storage took the step a moment ago and will not take this back: what is kept is the step.
    }
  };

  /**
   * Makes a step, and moves the medals it moves (`move`), so that neither is ever kept without the other. The table
   * and the medals are kept apart in this browser's storage, and either write can fail (storage full, say):
   *
   * 1. The table as it is after the step is written down first. If this browser will not keep it, nothing is moved
   *    and the step is not made (`unsaved`): a medal never moves for a hand that is not kept.
   * 2. Then the medals are moved, by the medal center.
   * 3. If the medal center could not keep that move, what is kept of the table is written back as it was before the
   *    step. The page plays on, and after a reload, or when the card comes back to the page (when the medal center
   *    reads its medals again: `refresh(true)`), the table and the medals are both as they were before it. So a
   *    stake is never lost and a hand's medals never come back twice.
   *
   * A step that moves no medals while the medal center is not keeping its medals is not written either: the kept
   * table stays with the kept medals.
   */
  const step = (next: TableSave, move: (() => boolean) | null): Step => {
    const kept = seen;
    if (!move && !bank.getState().kept) {
      save = next;
      ahead = true;
      return done();
    }
    const wrote = put(next);
    if (wrote === 'failed') return no('unsaved');
    if (move && !move()) {
      if (wrote === 'kept') putBack(kept);
      return no('short');
    }
    save = next;
    if (wrote !== 'kept') return done();
    if (move && !bank.getState().kept) {
      putBack(kept);
      ahead = true;
    } else {
      ahead = false;
    }
    return done();
  };

  /**
   * Looks at what is kept: another tab's table, if it has been played since
   * this page last looked, and, with the card, a table started over after the
   * medal center's reset. `regranted`: the card has just come back to this
   * page, and the medal center has read its medals again from what is kept, so
   * a table ahead of what is kept goes back to it too. Returns whether the
   * table changed.
   */
  const refresh = (regranted = false): boolean => {
    if (owner === undefined) return false;
    let changed = false;
    const text = read();
    if (text !== undefined && (text !== seen || (regranted && ahead))) {
      ahead = false;
      save = load(text);
      seen = text;
      changed = true;
    }
    if (holding() && bank.owner() === owner && bank.getState().ledger && (bank.restartDue(GAME) || save.era !== era())) {
      // The medals the shoe and the hand were played with are gone, and nothing comes back for them.
      if (save.round !== null || save.shoe !== null || save.era !== era()) changed = true;
      save = freshTable(era(), save.stats, save.bet);
      ahead = put(save) !== 'kept';
      bank.restarted(GAME);
    }
    return changed;
  };

  /** Why nothing can be done now, or null when a step can be made. */
  const refusal = (): Refusal | null => {
    if (owner === undefined || bank.owner() !== owner || !bank.getState().ledger) return 'closed';
    if (!holding()) return 'away';
    return refresh() ? 'moved' : null;
  };

  const no = (why: Refusal): Step => ({ ok: false, why, save });
  const done = (): Step => ({ ok: true, save });
  /** Takes `medals` from the player's medals, if they have that many. */
  const taking = (medals: number) => (medals > 0 ? () => bank.take(medals) : null);

  return {
    /** Opens `player`'s table (an account's id, or null for a guest's), as it is kept here. */
    open(player: string | null): TableSave {
      owner = player;
      const text = read();
      save = load(text);
      seen = text;
      return save;
    },

    /** Whose table is open: undefined before one is. */
    owner: (): string | null | undefined => owner,

    /** The table as this page has it. */
    current: (): TableSave => save,

    refresh,

    /** Deals a hand of `bet` medals, which are taken from the player's medals. */
    deal(bet: number): Step {
      const why = refusal();
      if (why) return no(why);
      if (unsettled(save) || !Number.isSafeInteger(bet) || bet < MIN_BET || bet > MAX_BET) return no('not-now');
      if (bank.balance() < bet) return no('short');
      const fresh = save.shoe === null || needsShuffle(save.shoe);
      const shoe = fresh ? createShoe(DECKS, random) : save.shoe!;
      const round = startRound(shoe, bet, { whole: true });
      const next = { ...save, era: era(), hand: save.hand + 1, bet, shoe: round.shoe, round, paid: false, count: fresh ? 0 : save.count, left: cardsLeft(shoe) };
      return step(next, taking(bet));
    },

    /** Answers the insurance offer. Insurance taken is half the bet, rounded down, taken from the player's medals. */
    insure(take: boolean): Step {
      const why = refusal();
      if (why) return no(why);
      const round = save.round;
      if (!round || round.phase !== 'insurance') return no('not-now');
      const cost = take ? insuranceCost(round) : 0;
      if (bank.balance() < cost) return no('short');
      const next = answerInsurance(round, take);
      return step({ ...save, shoe: next.shoe, round: next }, taking(cost));
    },

    /** Plays the hand: a double or a split takes another stake from the player's medals. `chart` is whether it was the chart's play. */
    act(action: Action, chart = false): Step {
      const why = refusal();
      if (why) return no(why);
      const round = save.round;
      if (!round || round.phase !== 'player' || !legalActions(round)[action]) return no('not-now');
      const extra = action === 'double' ? round.hands[round.active].bet : action === 'split' ? round.bet : 0;
      if (bank.balance() < extra) return no('short');
      const next = playAction(round, action);
      const stats = { ...save.stats, decisions: save.stats.decisions + 1, agreed: save.stats.agreed + (chart ? 1 : 0) };
      return step({ ...save, shoe: next.shoe, round: next, stats }, taking(extra));
    },

    /** Puts back what a played-out hand brings back, once, and counts it in the record. */
    settle(): Step {
      const why = refusal();
      if (why) return no(why);
      const round = save.round;
      const result = round?.phase === 'done' ? round.result : null;
      if (!round || !result || save.paid) return no('not-now');
      const outcomes = result.hands.map((hand) => hand.outcome);
      const tally = (...kinds: string[]) => outcomes.filter((outcome) => kinds.includes(outcome)).length;
      const seenCards = [...round.dealer, ...round.hands.flatMap((hand) => hand.cards)];
      const next: TableSave = {
        ...save,
        paid: true,
        count: save.count + seenCards.reduce((n, card) => n + hiLo(card), 0),
        stats: {
          ...save.stats,
          hands: save.stats.hands + outcomes.length,
          wins: save.stats.wins + tally('win', 'blackjack'),
          pushes: save.stats.pushes + tally('push'),
          losses: save.stats.losses + tally('lose', 'bust'),
          blackjacks: save.stats.blackjacks + tally('blackjack'),
          net: save.stats.net + result.net,
        },
      };
      const given = step(next, result.returned > 0 ? () => bank.give(result.returned) : null);
      // The medal center takes nothing back only when this page no longer holds the card.
      return !given.ok && given.why === 'short' ? no('away') : given;
    },

    /** Clears the record of hands played here: only the record, never the medals or a hand on the table. */
    clearRecord(): Step {
      const why = refusal();
      if (why) return no(why);
      return step({ ...save, stats: EMPTY_STATS }, null);
    },
  };
}
