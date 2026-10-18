/**
 * Baccarat on the medal floor: the table plays with the player's medals from
 * the Medal Game Center (MedalCenter/bank.ts), not with chips of its own.
 *
 * - **Bets.** Medals are put on the felt with the BET buttons. Nothing leaves
 *   the player's medals until DEAL: then the whole stake is taken at once,
 *   and what the coup returns (winnings with their stakes, and the stakes of
 *   pushes) goes back in once its cards have all been turned over.
 * - **Whole medals.** Every payout is a whole number of medals. On the
 *   no-commission (EZ) table every bet already pays whole medals. On the 5%
 *   table the Banker is bet in twenties, the smallest stake whose 5% is a
 *   whole medal: a 20-medal Banker win pays 19. So neither table's edge
 *   changes from the exact figures on the Odds tab.
 * - **The card.** Only the page that holds the player's card takes or gives
 *   medals (bank.ts). The table sits at the bank while it is open; a table in
 *   another tab that takes the card stops this one taking bets.
 * - **A coup survives the page.** A coup's cards are decided when DEAL is
 *   pressed and turned over one by one, so it is never refunded (a player who
 *   saw a bad first card could reload for their medals back). It is finished:
 *   as the card leaves the page (hidden, closed, reloaded, or lent to the hub)
 *   the coup is paid at once, before the card goes; and should the page be
 *   killed before it can be, the coup is written down as it is dealt, and
 *   the next page of this table that holds the card pays it, once.
 *
 * The table itself (the shoe, the scoreboards, the last hand) is kept on this
 * device so that a reload carries on with the same shoe. It holds no medals.
 */

import type { BankEvent, BankState, Move, Seat, SeatHandlers } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { isDevice, rowOf } from '../MedalCenter/ledger';
import {
  BET_IDS,
  CUT_CARD_FROM_END,
  RANKS,
  SUITS,
  betAvailable,
  burnCount,
  playRound,
  roadEntry,
  settleBets,
  totalOnTable,
  type BetId,
  type BetResult,
  type Bets,
  type Card,
  type Hand,
  type Mode,
  type Rank,
  type RoadEntry,
  type Shoe,
  type Suit,
  type Winner,
} from './engine';

/** The game's name at the bank: its seat, and its restart after the Medal Game Center's reset. */
export const GAME = 'baccarat';
/** Where this device keeps the table: shoe, scoreboards and the last hand. No medals. */
export const TABLE_KEY = 'baccarat-table';
/** Where a coup dealt and not yet paid is written down, under the device name of the medals it was dealt from (`Coup.device`). */
export const coupKey = (device: string): string => `baccarat-coup:${device}`;
/** Written once the player has been told that the table now plays with their medals. */
export const NOTICE_KEY = 'baccarat-medal-notice';

// ── Bet sizes ───────────────────────────────────────────────────────────────

/** The BET buttons: the medals one press puts on a spot. */
export const BET_STEPS = [1, 5, 10, 20, 100] as const;
export const DEFAULT_STEP = 1;
/**
 * The most each spot takes, in medals: the main bets 100, the Tie and the
 * side bets 20, as casinos keep side-bet limits low. With a free refill of
 * 100 and a daily bonus of 30 to 150, a full main bet is a whole refill.
 */
export const SPOT_MAX: Readonly<Record<BetId, number>> = { player: 100, banker: 100, tie: 20, playerPair: 20, bankerPair: 20, dragon7: 20, panda8: 20 };
/** On the 5% table the Banker is bet in twenties: 5% of 20 medals is one whole medal. */
export const COMMISSION_STEP = 20;
/** The table a new player sits down at: the one where every spot takes a single medal. */
export const DEFAULT_MODE: Mode = 'ez';

/** The step a spot's stake goes in: twenties for the Banker on the 5% table, single medals everywhere else. */
export const stepFor = (id: BetId, mode: Mode): number => (id === 'banker' && mode === 'commission' ? COMMISSION_STEP : 1);

/** The medals one press of a BET button puts on a spot: the button's, rounded up to the spot's step. */
export const pressAmount = (id: BetId, mode: Mode, chip: number): number => {
  const step = stepFor(id, mode);
  return Math.ceil(chip / step) * step;
};

export type Refusal = 'closed' | 'step' | 'max' | 'medals';

/** Why `amount` more medals cannot go on spot `id`, or null when they can. `medals` is what the player holds. */
export function refusal(bets: Bets, id: BetId, amount: number, mode: Mode, medals: number): Refusal | null {
  if (!betAvailable(id, mode)) return 'closed';
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount % stepFor(id, mode) !== 0) return 'step';
  if ((bets[id] ?? 0) + amount > SPOT_MAX[id]) return 'max';
  if (totalOnTable(bets) + amount > medals) return 'medals';
  return null;
}

/** Whether every bet on the felt is one the table takes: whole medals, in its step, within its spot's limit. */
export function tableTakes(bets: Bets, mode: Mode): boolean {
  return BET_IDS.every((id) => {
    const amount = bets[id];
    if (amount === undefined || amount === 0) return true;
    return betAvailable(id, mode) && Number.isSafeInteger(amount) && amount > 0 && amount % stepFor(id, mode) === 0 && amount <= SPOT_MAX[id];
  });
}

/**
 * What each bet does and what comes back, in whole medals. The engine keeps
 * 0.95 as a fraction; for bets the table takes it is a whole number to well
 * within a rounding, which is all `Math.round` removes.
 */
export function medalsBack(bets: Bets, hand: Hand, mode: Mode): { results: BetResult[]; returned: number } {
  const { results } = settleBets(bets, hand, mode);
  const whole = results.map((r) => ({ ...r, profit: Math.round(r.profit), returned: Math.round(r.returned) }));
  return { results: whole, returned: whole.reduce((sum, r) => sum + r.returned, 0) };
}

// ── The table, as this device keeps it ──────────────────────────────────────

export interface Stats {
  hands: number;
  banker: number;
  player: number;
  tie: number;
  playerPairs: number;
  bankerPairs: number;
  naturals: number;
}

export const EMPTY_STATS: Stats = { hands: 0, banker: 0, player: 0, tie: 0, playerPairs: 0, bankerPairs: 0, naturals: 0 };

/** The last hand dealt, as the table shows it: its cards, the bets on it and the table it was dealt at. */
export interface LastCoup {
  hand: Hand;
  bets: Bets;
  mode: Mode;
}

export interface TableState {
  mode: Mode;
  chip: number;
  /** The shoe being dealt, or null before the first deal. */
  shoe: Shoe | null;
  /** How many shoes this table has shuffled. */
  shoeNumber: number;
  /** Hands dealt from this shoe. */
  hand: number;
  roads: RoadEntry[];
  stats: Stats;
  lastBets: Bets;
  last: LastCoup | null;
}

export const NEW_TABLE: TableState = { mode: DEFAULT_MODE, chip: DEFAULT_STEP, shoe: null, shoeNumber: 0, hand: 0, roads: [], stats: EMPTY_STATS, lastBets: {}, last: null };

export const TABLE_VERSION = 1;

const cardText = (card: Card): string => `${card.rank}${card.suit}`;
const cardsText = (cards: readonly Card[]): string => cards.map(cardText).join('');

function readCards(text: unknown): Card[] | null {
  if (typeof text !== 'string' || text.length % 2 !== 0) return null;
  const cards: Card[] = [];
  for (let i = 0; i < text.length; i += 2) {
    const rank = text[i] as Rank;
    const suit = text[i + 1] as Suit;
    if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
    cards.push({ rank, suit });
  }
  return cards;
}

const WINNERS: readonly Winner[] = ['banker', 'player', 'tie'];
const ROAD_LETTERS = 'abcdefghijklmnopqrstuvwx';
const roadCode = (entry: RoadEntry): string =>
  ROAD_LETTERS[WINNERS.indexOf(entry.winner) * 8 + (entry.playerPair ? 4 : 0) + (entry.bankerPair ? 2 : 0) + (entry.natural ? 1 : 0)];
function readRoads(text: unknown): RoadEntry[] | null {
  if (typeof text !== 'string' || text.length > 200) return null;
  const roads: RoadEntry[] = [];
  for (const letter of text) {
    const code = ROAD_LETTERS.indexOf(letter);
    if (code < 0) return null;
    roads.push({ winner: WINNERS[Math.floor(code / 8)], playerPair: (code & 4) !== 0, bankerPair: (code & 2) !== 0, natural: (code & 1) !== 0 });
  }
  return roads;
}

/** The cards of a hand in the order they came out of the shoe: player, banker, player, banker, then the thirds. */
export function dealtInOrder(hand: Hand): Card[] {
  const order = [hand.player[0], hand.banker[0], hand.player[1], hand.banker[1]];
  if (hand.player[2]) order.push(hand.player[2]);
  if (hand.banker[2]) order.push(hand.banker[2]);
  return order;
}

/** A hand played again from its cards in dealing order; null unless the drawing rules use exactly those cards. */
export function replayHand(cards: readonly Card[]): Hand | null {
  if (cards.length < 4 || cards.length > 6) return null;
  let next = 0;
  try {
    const hand = playRound(() => {
      if (next >= cards.length) throw new Error('short');
      return cards[next++];
    });
    return next === cards.length ? hand : null;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown, most = 1_000_000_000): number | null => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= most ? value : null);
const readMode = (value: unknown): Mode | null => (value === 'commission' || value === 'ez' ? value : null);

/** Bets read back: whole medals on spots the table has, within their limits; and, given the table they were dealt at, in its steps. */
function readBets(value: unknown, mode: Mode | null): Bets | null {
  if (!isRecord(value)) return null;
  const bets: Bets = {};
  for (const [id, amount] of Object.entries(value)) {
    if (!(BET_IDS as readonly string[]).includes(id)) return null;
    const medals = count(amount, SPOT_MAX[id as BetId]);
    if (medals === null) return null;
    if (medals > 0) bets[id as BetId] = medals;
  }
  return mode === null || tableTakes(bets, mode) ? bets : null;
}

function readShoe(value: unknown): Shoe | null {
  if (!isRecord(value)) return null;
  const decks = count(value.decks, 8);
  if (decks === null || decks < 1) return null;
  const cards = readCards(value.cards);
  if (!cards || cards.length !== decks * 52) return null;
  // A whole shoe: every card of every deck, once a deck.
  const seen = new Map<string, number>();
  for (const card of cards) seen.set(cardText(card), (seen.get(cardText(card)) ?? 0) + 1);
  if (seen.size !== 52 || [...seen.values()].some((n) => n !== decks)) return null;
  const burnCard = cards[0];
  const burned = burnCount(burnCard);
  const next = count(value.next, cards.length);
  if (next === null || next < 1 + burned) return null;
  return { decks, cards, next, cutIndex: cards.length - CUT_CARD_FROM_END, burnCard, burned };
}

function readStats(value: unknown): Stats | null {
  if (!isRecord(value)) return null;
  const stats = { ...EMPTY_STATS };
  for (const key of Object.keys(EMPTY_STATS) as (keyof Stats)[]) {
    const n = count(value[key]);
    if (n === null) return null;
    stats[key] = n;
  }
  return stats;
}

function readLast(value: unknown): LastCoup | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const mode = readMode(value.mode);
  const cards = readCards(value.cards);
  const hand = cards ? replayHand(cards) : null;
  const bets = mode ? readBets(value.bets, mode) : null;
  return mode && hand && bets ? { hand, bets, mode } : undefined;
}

export function serializeTable(table: TableState): string {
  return JSON.stringify({
    v: TABLE_VERSION,
    mode: table.mode,
    chip: table.chip,
    shoe: table.shoe ? { decks: table.shoe.decks, cards: cardsText(table.shoe.cards), next: table.shoe.next } : null,
    shoeNumber: table.shoeNumber,
    hand: table.hand,
    roads: table.roads.map(roadCode).join(''),
    stats: table.stats,
    lastBets: table.lastBets,
    last: table.last ? { cards: cardsText(dealtInOrder(table.last.hand)), bets: table.last.bets, mode: table.last.mode } : null,
  });
}

/**
 * Reads the table back. Anything that is not a table this version wrote (a
 * newer version's, a damaged one, something else under the name) gives null,
 * and the page opens a new table: nothing on it holds medals, so nothing is
 * lost by that but the scoreboards.
 */
export function parseTable(text: unknown): TableState | null {
  if (typeof text !== 'string' || text.length > 20_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== TABLE_VERSION) return null;
  const mode = readMode(value.mode);
  const chip = (BET_STEPS as readonly unknown[]).includes(value.chip) ? (value.chip as number) : null;
  const shoe = value.shoe === null ? null : readShoe(value.shoe);
  const shoeNumber = count(value.shoeNumber);
  const hand = count(value.hand);
  const roads = readRoads(value.roads);
  const stats = readStats(value.stats);
  // The bets of the last hand with any on it, put back by Rebet: at whichever table they were made.
  const lastBets = readBets(value.lastBets, null);
  const last = readLast(value.last);
  if (!mode || chip === null || (value.shoe !== null && !shoe) || shoeNumber === null || hand === null || !roads || !stats || !lastBets || last === undefined) return null;
  return { mode, chip, shoe, shoeNumber, hand, roads, stats, lastBets, last };
}

/** The table after `hand` has been dealt from `shoe` (already moved on), with `bets` on it at `mode`. */
export function afterCoup(table: TableState, hand: Hand, shoe: Shoe, fresh: boolean, bets: Bets, mode: Mode): TableState {
  const entry = roadEntry(hand);
  const s = table.stats;
  return {
    ...table,
    mode,
    shoe,
    shoeNumber: fresh ? table.shoeNumber + 1 : table.shoeNumber,
    hand: fresh ? 1 : table.hand + 1,
    roads: [...(fresh ? [] : table.roads), entry],
    stats: {
      hands: s.hands + 1,
      banker: s.banker + (hand.winner === 'banker' ? 1 : 0),
      player: s.player + (hand.winner === 'player' ? 1 : 0),
      tie: s.tie + (hand.winner === 'tie' ? 1 : 0),
      playerPairs: s.playerPairs + (entry.playerPair ? 1 : 0),
      bankerPairs: s.bankerPairs + (entry.bankerPair ? 1 : 0),
      naturals: s.naturals + (hand.natural ? 1 : 0),
    },
    lastBets: totalOnTable(bets) > 0 ? { ...bets } : table.lastBets,
    last: { hand, bets: { ...bets }, mode },
  };
}

// ── A coup dealt and not yet paid ───────────────────────────────────────────

export interface Coup {
  id: string;
  /** Whose medals it was dealt from: an account's id, or null for a guest's. */
  owner: string | null;
  /**
   * The device name of the medals it was dealt from (`Ledger.device`). Medals keep it wherever they go: a guest's
   * medals that become a new account's carry it there, and a new guest's medals have a new one. So a coup is paid
   * into the medals it was dealt from, whoever's they are now, and into no others.
   */
  device: string;
  /** The era of those medals it was dealt in. A reset at the Medal Game Center since then throws it away unpaid. */
  era: number;
  /** Medals taken when it was dealt. */
  stake: number;
  /** Medals it gives back: winnings with their stakes, and the stakes of pushes. */
  returned: number;
  /** What this device had taken out of those medals before the stake: had the stake been taken when the page went. */
  spentBefore: number;
  /** Dealt; or paid, its medals back already, the record not yet struck off (a coup written before receipts). */
  state: 'dealt' | 'paid';
  /**
   * Whether its stake and its return go in under receipts (`bank.apply`): its stake was taken only if the bank holds
   * the stake's receipt. A coup written before there were receipts has none, and is known by `spentBefore`.
   */
  receipts?: true;
}

export const COUP_VERSION = 1;

/** The names of a coup's two moves of medals at the bank. */
export const DEAL_STEP = 'deal';
export const PAY_STEP = 'pay';

export const serializeCoup = (coup: Coup): string => JSON.stringify({ v: COUP_VERSION, ...coup });

export function parseCoup(text: unknown): Coup | null {
  if (typeof text !== 'string' || text.length > 2_000) return null;
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value) || value.v !== COUP_VERSION) return null;
    const { id, owner, device, era, stake, returned, spentBefore, state, receipts } = value;
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
    if (owner !== null && (typeof owner !== 'string' || owner.length === 0 || owner.length > 128)) return null;
    if (!isDevice(device) || (state !== 'dealt' && state !== 'paid')) return null;
    if (receipts !== undefined && receipts !== true) return null;
    const [e, s, r, b] = [count(era), count(stake), count(returned), count(spentBefore, Number.MAX_SAFE_INTEGER)];
    if (e === null || s === null || r === null || b === null) return null;
    const coup: Coup = { id, owner, device, era: e, stake: s, returned: r, spentBefore: b, state };
    if (receipts) coup.receipts = true;
    return coup;
  } catch {
    return null;
  }
}

// ── The table at the bank ───────────────────────────────────────────────────

/** Storage as the table uses it. Every call is safe: a browser that keeps nothing reads nothing and writes nothing. */
export interface TableStore {
  read: (key: string) => string | null;
  write: (key: string, text: string) => boolean;
  remove: (key: string) => void;
}

export const browserStore = (): TableStore => ({
  read: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write: (key, text) => {
    try {
      window.localStorage.setItem(key, text);
      return true;
    } catch {
      return false;
    }
  },
  remove: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // It stays, and is read as what it is next time.
    }
  },
});

/** What of the medal bank the table uses (MedalCenter/bank.ts). */
export interface Purse {
  sit: (game: string, handlers: SeatHandlers) => Seat;
  listen: (hearer: (event: BankEvent) => void) => () => void;
  balance: () => number;
  take: (medals: number) => boolean;
  give: (medals: number) => boolean;
  owner: () => string | null;
  getState: () => BankState;
  restartDue: (game: string) => boolean;
  restarted: (game: string) => void;
  /** A move of a coup's medals under its receipt, once (bank.ts). */
  apply: (move: Move) => 'applied' | 'already' | null;
  applied: (move: Pick<Move, 'game' | 'round' | 'step'>) => boolean;
  forget: (game: string, keep?: readonly string[]) => boolean;
  /** Says that every coup but those in `keep` has no medals out any more: no refill is given while one does. */
  settle: (game: string, keep?: readonly string[]) => boolean;
}

export interface TableHooks {
  /** The card is this page's: the table may be played. `moved`: a table of this game in another tab has played since this page last held it. */
  granted: (moved: boolean) => void;
  /** The card is about to go. Any coup in flight has been paid by now. */
  yielding: (why: 'moment' | 'hidden' | 'left') => void;
  /** A coup dealt here has been paid. `early`: before its cards were all turned over, because the card was leaving. */
  paid: (coup: Coup, early: boolean) => void;
  /** A coup dealt by a page that was closed before it could pay it has been settled here: paid, or thrown away (a reset since, or a stake never taken). */
  resumed: (coup: Coup, paid: boolean) => void;
}

export type MedalTable = ReturnType<typeof createMedalTable>;

/** A coup's name: the time and a random part, letters and digits, short enough to name its receipts. */
const randomId = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 6).toString(36)}`;

/**
 * The table's place at the bank: the one way it takes and gives medals.
 * `sit` asks for the card; a coup is dealt (`deal`) and paid (`settle`)
 * only while it is held.
 *
 * Every step that moves medals is written down so that a page that goes at
 * any point between two of them leaves nothing paid twice, nothing lost and
 * no medals made. The coup and the medals are two writes, so the stake and
 * the return each go in under a receipt (`bank.apply`; "A machine's rounds"
 * in bank.ts):
 *
 * - **Dealing:** the coup is written down first; then the stake is taken
 *   under its receipt. A coup that cannot be written down is not dealt, and
 *   nothing is taken. A coup found written down whose stake's receipt the
 *   medals do not hold was never dealt, and is struck off unpaid.
 * - **Paying:** its medals go back under their receipt; then it is struck
 *   off. A coup found still written down whose return went in already is
 *   struck off and not paid again.
 *
 * A coup written down before there were receipts is known as it was then:
 * by what this device had taken out of the medals before its stake
 * (`spentBefore`), and by being marked paid before its medals went back.
 */
export function createMedalTable(purse: Purse, store: TableStore, hooks: TableHooks, makeId: () => string = randomId) {
  let seat: Seat | null = null;
  let unlisten: (() => void) | null = null;
  /** The coup dealt on this page whose medals have not gone back yet. */
  let open: Coup | null = null;

  const holding = (): boolean => seat?.holding() ?? false;
  /** The medals on the table, as the bank last published them. */
  const ledgerNow = () => purse.getState().ledger;

  type Settled = { settled: boolean; paid: boolean; again: boolean };
  const NOT_YET: Settled = { settled: false, paid: false, again: false };

  /**
   * Gives a coup's medals back and strikes it off, while the card is here and
   * the medals on the table are the ones it was dealt from. A coup from
   * before a reset is struck off with nothing given: the medals it was dealt
   * from were thrown away. Returns whether it is settled.
   */
  const pay = (coup: Coup): Settled => {
    // A coup dealt with nothing on the felt took nothing, owes nothing and was never written down.
    if (coup.stake === 0) return { settled: true, paid: true, again: false };
    const ledger = ledgerNow();
    if (!holding() || !ledger || ledger.device !== coup.device || coup.era > ledger.era) return NOT_YET;
    const key = coupKey(coup.device);
    const struck = (paid: boolean, again = false): Settled => {
      store.remove(key);
      return { settled: true, paid, again };
    };
    if (coup.era < ledger.era) return struck(false);
    if (coup.state === 'paid') return struck(false, true);
    // Its stake never went in (the page that dealt it died first): it was never dealt.
    const dealt = coup.receipts ? purse.applied({ game: GAME, round: coup.id, step: DEAL_STEP }) : rowOf(ledger, ledger.device).spent >= coup.spentBefore + coup.stake;
    if (!dealt) return struck(false);
    let again = false;
    if (coup.returned > 0) {
      // Under its receipt, before it is struck off: a page that dies between the two leaves a coup whose return is in
      // already, and the next page strikes it off without paying it again.
      const paid = purse.apply({ game: GAME, round: coup.id, step: PAY_STEP, medals: coup.returned, era: coup.era });
      if (!paid) return NOT_YET;
      again = paid === 'already';
      // The medal floor hears of what the coup paid once, as it goes in.
      if (paid === 'applied') floorReport(GAME, { won: coup.returned, prize: { medals: coup.returned } });
    }
    const settled = struck(true, again);
    // Over, and struck off: nothing will try its moves again.
    purse.forget(GAME);
    return settled;
  };

  /** A coup left written down by a page that could not pay it: paid now, once, into the medals it was dealt from. */
  const resume = (): void => {
    const ledger = ledgerNow();
    if (!ledger) return;
    const coup = parseCoup(store.read(coupKey(ledger.device)));
    // Only a coup still to be paid has medals out: with none written down, none are, even if the page that struck the
    // last one off died before it could say so.
    if (!coup && holding()) purse.settle(GAME, open ? [open.id] : []);
    if (!coup || coup.id === open?.id) return;
    const { settled, paid, again } = pay(coup);
    if (settled && !again) hooks.resumed(coup, paid);
  };

  const settle = (id: string, early = false): 'paid' | 'waiting' | 'gone' => {
    const coup = open;
    if (!coup || coup.id !== id) return 'gone';
    const { settled } = pay(coup);
    // Not now (other medals are on the table): it stays written down, and is paid when they are back.
    open = null;
    if (!settled) return 'waiting';
    hooks.paid(coup, early);
    return 'paid';
  };

  /** A reset at the Medal Game Center threw away the medals a coup in flight was dealt from: it is dropped, unpaid. */
  const discard = (): void => {
    const coup = open;
    if (!coup) return;
    open = null;
    if (coup.stake > 0) store.remove(coupKey(coup.device));
  };

  return {
    /** Sits down at the bank: the card is asked for. */
    sit(): void {
      if (seat) return;
      seat = purse.sit(GAME, {
        granted: (moved) => {
          // The bank publishes what it read with the card (a reset among it) only after this returns: what is owed is
          // looked at once it has, and only if the card is still here.
          queueMicrotask(() => {
            if (!holding()) return;
            resume();
            hooks.granted(moved);
          });
        },
        yielding: (why) => {
          // The cards are decided already: the coup in flight is paid before the card goes.
          if (open) settle(open.id, true);
          hooks.yielding(why);
        },
      });
      // A reset can reach a page that holds the card (from the account, made on another device) without the card
      // leaving it: the coup in flight was dealt from medals that are gone.
      unlisten = purse.listen((event) => {
        if (event.type === 'reset') discard();
      });
    },
    /** Gets up: a coup in flight is paid first (the bank lets the card go through `yielding`). */
    leave(): void {
      seat?.leave();
      seat = null;
      unlisten?.();
      unlisten = null;
    },
    /** The player plays here again: the card is asked back from the other tab. */
    play(): void {
      seat?.play();
    },
    holding,
    /** A coup whose medals have not gone back yet, dealt on this page. */
    open: (): Coup | null => open,
    /** Settles a coup left by a page that was closed, if one is waiting for the medals on the table now. */
    resume,
    /**
     * Deals a coup: writes it down, then takes `stake` medals. Returns null
     * when it cannot: the card is elsewhere, the medals are not there, or
     * this browser will not keep the coup written down (then nothing is
     * taken).
     */
    deal(stake: number, returned: number): Coup | null {
      if (!holding() || open) return null;
      if (!Number.isSafeInteger(stake) || stake < 0 || !Number.isSafeInteger(returned) || returned < 0) return null;
      const ledger = ledgerNow();
      if (!ledger || stake > purse.balance()) return null;
      const coup: Coup = {
        id: makeId(),
        owner: purse.owner(),
        device: ledger.device,
        era: ledger.era,
        stake,
        returned,
        spentBefore: rowOf(ledger, ledger.device).spent,
        state: 'dealt',
        receipts: true,
      };
      if (stake > 0) {
        const key = coupKey(coup.device);
        if (!store.write(key, serializeCoup(coup))) return null;
        if (purse.apply({ game: GAME, round: coup.id, step: DEAL_STEP, medals: -stake, era: coup.era }) !== 'applied') {
          store.remove(key);
          return null;
        }
        // The medals played feed the floor jackpot, once, as the stake goes in.
        floorReport(GAME, { played: stake });
      }
      open = coup;
      return coup;
    },
    /** Gives back what a coup dealt here returns, once its cards are all turned over. */
    settle,
    /** Drops the coup in flight unpaid: its medals were thrown away by a reset. */
    discard,
    /** Whether the Medal Game Center has been reset since this table last started over; if so, it is noted that it has now. */
    restartIfDue(): boolean {
      if (!holding() || !purse.restartDue(GAME)) return false;
      purse.restarted(GAME);
      return true;
    },
  };
}
