'use client';

/**
 * The medal bank in the browser: one balance of medals per player, shared by
 * every machine of the medal center, where `ledger.ts` (which is only
 * arithmetic) meets storage, the other tabs, and the player's account.
 *
 * ## The card
 *
 * In an arcade whose bank is linked to the member's IC card, the card is put
 * into a machine and the machine plays straight from the bank; a card is in
 * one machine at a time. So it is here. Every page of the site that uses the
 * bank in this browser shares one card, and only the page that holds it
 * writes the bank. The card is a lock that the whole browser shares (the Web
 * Locks API), and a page asks the one holding it to give it up by a message
 * to the others (a BroadcastChannel).
 *
 * - A machine that is being played holds the card while its page is shown.
 *   It gives it up when its page is hidden or left, when another page needs
 *   it for a moment (the hub taking the day's bonus, say), after which it
 *   asks for it straight back, and when the player starts to play another
 *   machine in another tab, after which it stands paused, with a button to
 *   play it here, until the player presses it.
 * - Everything else that writes the bank (the hub's buttons, the account's
 *   copy being joined in, an old purse being moved in) asks for the card,
 *   does its one thing and gives it back.
 * - Whoever holds the card reads the bank out of storage first, and writes
 *   each change as it is made: a medal fed, a medal won. Nobody else writes
 *   it, so no tab's write is ever lost under another's, and a medal is never
 *   spent that the bank does not hold. Every other page reads what was
 *   written when storage tells it something changed.
 * - A machine does not run while its page does not hold the card. Its field
 *   pays medals at any moment, and they would have nowhere to go.
 *
 * ## A machine's rounds
 *
 * The Medal Pusher feeds and wins a medal at a time (`take`, `give`). A
 * machine that plays in rounds (a spin, a hand, a coup, a bet on the craps
 * table) keeps each round in a record of its own, beside the medals, and
 * moves the round's medals with `apply`: each move under a receipt that goes
 * into the ledger in the same write as the medals (see "Receipts" in
 * ledger.ts). The record and the medals are two writes, and a browser that
 * dies between them leaves one without the other; with the receipt, the
 * machine finds out which, and a move tried again is made only if it was not
 * made before. The rule every machine keeps:
 *
 * - **Its record first.** The record says what the next move is before the
 *   move is made: a stake about to be taken, a win about to be paid. A
 *   record that names a stake whose receipt is not there is a stake that was
 *   never taken, and the step it was for never happened (the round, or the
 *   double or the bet, is taken back off the record). A record that names a
 *   win whose receipt is not there is a win still to be paid: it is paid.
 * - **Receipts let go of last.** A machine lets go of a round's receipts
 *   (`forget`) only once its record no longer needs them: the round is over
 *   and written down as over, or gone.
 *
 * A record written before there were receipts is taken at its word: its
 * stakes were taken.
 *
 * A browser without Web Locks (Safari before 15.4) has nothing that keeps two
 * tabs apart. There every page writes as though it held the card, and two
 * tabs of the bank open at once can lose a medal to each other. Nothing is
 * lost with one tab open.
 *
 * ## The account
 *
 * A player who is signed in has the bank on their account too, kept in step
 * by `account.ts` as the machine and the record book are. The rule for which
 * copy wins is `settleLedgers`: neither, when this device has a copy of its
 * own; the two are joined (`mergeLedgers`), so what each device has put in
 * and taken out is all there, once. On the first sign-in, when the account
 * has no bank yet, the guest's bank on this device becomes the account's: it
 * is moved, not copied, so it cannot become a second account's as well. When
 * the account has one already, the account's is the one played, and the
 * guest's stays on this device for the guest, as the guest's machine does.
 *
 * The account keeps one copy and takes whatever it is sent, so the bank never
 * sends blind: every write reads the account first and sends the two joined.
 * So nothing is sent in the way that outlives the page, which cannot read
 * first; what was not sent goes the next time the bank is opened here.
 *
 * What cannot be stopped without a server that decides: two devices that
 * spend the same medals before either has heard of the other. Joined, the
 * balance can be below nothing. Nothing can be taken out then, and the next
 * medals won pay it back.
 *
 * ## The history
 *
 * What the bank does with the medals is told, as it does it, to the
 * medals' history (history.ts, historyStore.ts): every move of a round's
 * medals, the daily bonus, a refill, a reset. A machine tells it what its
 * medals alone do not say (`played`). The history is a document of its own,
 * beside the medals and on the account beside theirs; nothing in it is read
 * to decide a medal, and a write of it that does not take loses no medal.
 *
 * ## Purses from before the bank
 *
 * A Medal Pusher played before the bank kept its medals in its own purse.
 * That purse is moved into the bank once: a guest's when this device's guest
 * bank is first opened, and an account's from the account's machine,
 * wherever that is first read. A machine saved since then keeps no purse, so
 * there is nothing to move again, and each move is kept under where it came
 * from (`importPurse`), so two devices that both move the account's purse in
 * count it once.
 */

import { useSyncExternalStore } from 'react';
import { GUEST, createSync, fromCloud, slotFor, toCloud, type AccountStore, type Kept, type Player, type Slots, type Standing, type Status, type Sync, type Verdict } from '../MedalPusher/account';
import { dayFrom, readDays, unionDays, type Day, type DaySet } from '../MedalPusher/records';
import { FLOOR_JACKPOT, type Observation } from './history';
import { HISTORY_GAME_KEY, HISTORY_WAITING, createHistoryStore, type HistoryState } from './historyStore';
import {
  REFILL,
  WELCOME,
  applyMove,
  balanceOf,
  cardOf,
  claimBonus,
  createLedger,
  forgetReceipts,
  give,
  hasImported,
  hasReceipt,
  importPurse,
  markChecked,
  medalsOutAt,
  mergeLedgers,
  parseLedger,
  printOf,
  receiptOf,
  receiptsOf,
  refill,
  refillDue,
  resetLedger,
  restartDue,
  restarted,
  serializeLedger,
  settleRounds,
  spendable,
  take,
  withClaimed,
  type Ledger,
} from './ledger';

// ── Names ───────────────────────────────────────────────────────────────────

/** Where a guest's bank is kept on this device. */
export const BANK_KEY = 'medal-center-bank';
/** Where an account's bank is kept on this device. (`medal-center-bank:` and the account is the keeper's own slot: see `slots`.) */
export const ledgerKey = (uid: string | null): string => (uid === null ? BANK_KEY : `medal-center-ledger:${uid}`);
/** The key the bank has among a player's saves on the account. */
export const BANK_GAME_KEY = 'medal-center';
/** The lock the card is, which the whole browser shares. */
export const CARD_LOCK = 'medal-center-card';
/** Where the card's holders are written down: for each game, the page that last played one of its machines here. */
export const CARD_KEY = 'medal-center-card';
/** The channel the pages of the medal center talk on. */
export const CHANNEL = 'medal-center';
/** The old purses of this device's guest that have been moved into a guest's bank, so that none is moved in twice. */
export const BANKED_KEY = 'medal-center-banked';

/** The Medal Pusher, as the bank knows it: its name, and where its machines were kept before the bank. */
export const PUSHER = {
  game: 'medal-pusher',
  /** The machine's save on this device: a guest's under this name, and an account's copy under it and the account. */
  machineKey: 'medal-pusher-machine',
  /** Where a purse moved in came from: a guest's machine, or an account's. */
  guestPurse: 'medal-pusher@guest',
  accountPurse: 'medal-pusher@account',
  /** The account's record book, read once for the days it took the bonus on before the bank paid it. */
  booksGameKey: 'medal-pusher-records',
  accountDays: 'medal-pusher-days@account',
  /** The record book, whose days the bonus was taken on are the bank's now. */
  bookKey: (uid: string | null): string => (uid === null ? 'medal-pusher-records' : `medal-pusher-book:${uid}`),
} as const;

/** How often the bank goes to the account when it has changed, in seconds, and how often the keeper is shown it. */
export const SEND_EVERY = 60;
export const LOOK_EVERY = 10;
/** How long a press on the bonus waits to hear from the account, in seconds, before the day is paid from what this device knows. */
export const ASK_SECONDS = 4;
/** How long what the account has just said is taken to be what it holds, in milliseconds: a write made within it does not ask again first. */
export const HEARD_FOR = 2000;
/** How long after a write to the account it is read again, to see that no other device's write went over it, in milliseconds; and how long after a check that failed. */
export const CHECK_AFTER = 20_000;
export const CHECK_AGAIN = 60_000;

// ── Old purses ──────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The purse in a Medal Pusher's save, or null when the text is not a save
 * with one. Only the purse is read, not the machine, so a hub that never
 * runs a machine has none of the machine's code to load.
 */
export function purseIn(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  try {
    const save = JSON.parse(text) as unknown;
    if (!isRecord(save) || typeof save.version !== 'number' || !isRecord(save.session)) return null;
    const { credits } = save.session;
    return typeof credits === 'number' && Number.isSafeInteger(credits) && credits >= 0 && credits <= 1_000_000 ? credits : null;
  } catch {
    return null;
  }
}

/** The purse in the copy of an account's machine that this device keeps (account.ts writes it with what is known of the account's). */
export function purseInCopy(written: unknown): number | null {
  if (typeof written !== 'string') return null;
  try {
    const copy = JSON.parse(written) as unknown;
    return isRecord(copy) ? purseIn(copy.text) : null;
  } catch {
    return null;
  }
}

// ── Which copy wins ─────────────────────────────────────────────────────────

/**
 * Which copy of the bank wins when the account's has been read: neither, when
 * this device has one of its own for the account; they are joined.
 *
 * - The account's copy cannot be read here: hold. It is left as it is.
 * - The account has none: this device's copy for the account is sent, and
 *   with none of those, what is on the table, the guest's bank, becomes the
 *   account's (`fromGuest`).
 * - The account has one, and this device has one for the account: the two
 *   are joined, as this device's, and sent if the account lacks any of it.
 * - The account has one, and this device has none for it: the account's is
 *   taken, under this device's own name. The guest's bank stays the guest's.
 */
export function settleLedgers({ account, device, guest }: Standing, name: () => string): { verdict: Verdict; fromGuest: boolean } {
  if (account.kind === 'unreadable') return { verdict: { kind: 'hold' }, fromGuest: false };
  if (account.kind === 'none') {
    const mine = device ? parseLedger(device.text) : guest === null ? null : parseLedger(guest);
    if (!mine) return { verdict: { kind: 'adopt' }, fromGuest: false };
    return { verdict: { kind: 'take', text: serializeLedger(mine), send: true }, fromGuest: !device };
  }
  const theirs = parseLedger(account.text);
  if (!theirs) return { verdict: { kind: 'hold' }, fromGuest: false };
  const here = device ? parseLedger(device.text) : null;
  // A copy is never taken under another device's name: two devices writing one row would each undo the other's.
  const merged = serializeLedger(mergeLedgers(here ?? createLedger(name(), 0), theirs));
  return { verdict: { kind: 'take', text: merged, send: printOf(merged) !== printOf(account.text) }, fromGuest: false };
}

// ── What the bank needs of the world ────────────────────────────────────────

/** What the pages say to each other. */
export type BankMessage = { kind: 'want'; page: string; play: boolean };

export interface Watchers {
  /** Once a second. */
  tick: () => void;
  /** Another tab has written storage, under this name when it is known. */
  changed: (key: string | null) => void;
  /** Another page of the site has said something. */
  heard: (message: BankMessage) => void;
  /** The page has been hidden, or is being left. */
  hidden: (why: 'hidden' | 'left') => void;
  /** The page is shown again. */
  shown: () => void;
}

/** The card: one page at a time holds it. */
export interface CardLock {
  /** Whether this browser can keep its pages apart at all. */
  apart: boolean;
  /** Asks for the card. `granted` runs once this page holds it, with what gives it back. Returns what withdraws the request while it waits. */
  ask: (granted: (release: () => void) => void) => () => void;
  /**
   * Resolves once the lock manager has every request this page has made so far (it handles a page's calls in the
   * order they are made, so a question asked after them is answered after them). Without it, a request is taken to be
   * in at once.
   */
  queued?: () => Promise<void>;
}

export interface BankEnv {
  /** What storage holds under a name. Throws when storage is blocked. */
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
  /** Today on the player's own calendar. */
  today: () => Day;
  /** A name for a device, made up at random. */
  device: () => string;
  now: () => number;
  /** A mark for a copy sent to the account: any text no other copy will carry. */
  mark: () => string;
  /** Whether the page is being shown. */
  visible: () => boolean;
  watch: (watchers: Watchers) => () => void;
  /** Says something to the other pages. */
  post: (message: BankMessage) => void;
  card: CardLock;
  /** This page's own name among the pages. */
  page: string;
  /**
   * The account's store for the medals' history, a document of its own beside
   * the bank's, wherever the bank has an account's store. The same store every
   * time it is asked. None: the history is this device's alone.
   */
  historyStore?: () => AccountStore | null;
}

// ── What the page is shown ──────────────────────────────────────────────────

export interface BankState {
  /** Whether the bank has been read. Until then, and on the server, nothing is known and nothing is shown. */
  loaded: boolean;
  /** The medals that can be played: never below nothing. */
  balance: number;
  /** Medals the bank is short, when two devices spent the same medals: shown so that a balance of nothing is understood. */
  owed: number;
  /** Whose bank it is: an account's id, or null for a guest's. */
  owner: string | null;
  /** Where else it is kept, as account.ts says. */
  where: Status['where'];
  /** Whether the last write to this device took. */
  kept: boolean;
  /** Whether this browser keeps its pages apart. Where it cannot, no daily bonus is paid: two tabs could each pay a day. */
  apart: boolean;
  /** Today on the player's calendar, and the days the bonus was taken. Null until read. */
  day: Day | null;
  ledger: Ledger | null;
  /** Whether a press on the bonus is waiting to hear from the account. */
  asking: boolean;
  /** How many days' bonuses have been taken on this page: the stamp for the one just taken is struck fresh. */
  claims: number;
  /**
   * The card, for a page with a machine: held here, being asked for, held by a
   * machine in another tab (`away`, the machine here paused until the player
   * plays it here), or nobody's.
   */
  card: 'here' | 'asking' | 'away' | 'none';
  /**
   * The games with medals out on a round on this device, still to come back
   * when it is settled ("Medals out" in ledger.ts): no free refill is given
   * while there are any.
   */
  out: readonly string[];
}

const NONE_OUT: readonly string[] = [];

export const WAITING: BankState = { loaded: false, balance: 0, owed: 0, owner: null, where: 'device', kept: true, apart: true, day: null, ledger: null, asking: false, claims: 0, card: 'none', out: NONE_OUT };

/** Something that happened to the bank that a machine on the page acts out. */
export type BankEvent =
  /** The day's bonus or a refill was paid in by this page. */
  | { type: 'bonus' | 'refill'; medals: number }
  /** The bank has been reset, here or elsewhere: every machine starts over. */
  | { type: 'reset' };

/**
 * A move of medals that is one step of a machine's round (`apply`): made once,
 * under a receipt named by the game, the round and the step.
 */
export interface Move {
  /** The game's name at the bank. */
  game: string;
  /** The round's name: letters, digits and hyphens, up to 24, that no other round of the game on this device has. */
  round: string;
  /** The step's name within the round: letters, digits and hyphens, up to 16 (`stake`, `pay`…). */
  step: string;
  /** Medals given, or taken when below nothing. None moves for 0, and the step is written down all the same. */
  medals: number;
  /** The era of the medals the round was played in, when the machine knows it: a move for another era is not made. */
  era?: number;
  /**
   * Whether the round has medals out after the move ("Medals out" in
   * ledger.ts). Left out, a move that takes medals puts them out and the
   * round's pay (`pay`) settles it; any other move leaves it as it was.
   */
  out?: boolean;
}

/**
 * What a machine tells the medals' history that its moves of medals do not
 * say (`played`). Nothing in it moves a medal.
 */
export type Played =
  /** A round played whole, as its machine counts it: what it took, and what came back. (The craps table's: see `REPORTS_ROUNDS` in history.ts.) */
  | { game: string; round: string; bet: number; won: number }
  /** A machine that is fed and pays as it goes (the Medal Pusher): medals fed and won since it last said, the largest prize among them, and its jackpots. */
  | { game: string; fed: number; won: number; prize?: number; jackpots?: readonly number[] };

/** Something that happened to the medals, as the bank tells the history: when, on what day and with what left are the bank's to add. */
type Told = Observation extends infer O ? (O extends unknown ? Omit<O, 'at' | 'day' | 'left'> : never) : never;

/** A machine's place at the bank. */
export interface Seat {
  /** Whether this page holds the card, so that the machine may run. */
  holding: () => boolean;
  /** The player plays here: the card is asked for from wherever it is. */
  play: () => void;
  /** The machine is put away. */
  leave: () => void;
}

export interface SeatHandlers {
  /** The card is this page's. `moved`: a machine of the same game on another page has played since this page last held it, and saved over this one's. */
  granted: (moved: boolean) => void;
  /** The card is about to go: the machine writes down what it has to, now. `why` says whether the page is being hidden or left. */
  yielding: (why: 'moment' | 'hidden' | 'left') => void;
}

/** Today on the player's own calendar. */
export const localDay = (moment: Date): Day => dayFrom(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());

const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A device's or a page's name: ten letters and digits, from random numbers in [0, 1). */
export const randomName = (random: () => number): string =>
  Array.from({ length: 10 }, () => LETTERS[Math.min(LETTERS.length - 1, Math.floor(random() * LETTERS.length))]).join('');

/** One player's bank on the table. */
interface Desk {
  owner: string | null;
  key: string;
  /** The bank as this page knows it: as storage had it when last read or written, with whatever is still to go in. */
  ledger: Ledger;
  /** Whether storage holds something this page has not written yet: a new bank, one moved, or something joined in. */
  unsaved: boolean;
  /** Copies of the bank from the account, still to be joined in in storage. */
  joins: Ledger[];
  /** Old purses still to be moved in in storage. */
  imports: { source: string; medals: number; machine: boolean }[];
  /** Days the record book took the bonus on, still to be put in. */
  days: DaySet | null;
  /** Sources looked at, still to be written down as such. */
  checks: string[];
  /** Whether this is a guest's bank that has become the account's, and has still to leave the guest's place. */
  moved: boolean;
  /** The guest purse this bank was opened with, to be written down as moved in once it is stored. */
  banked: string | null;
}

export type Bank = ReturnType<typeof createBank>;

export function createBank(env: BankEnv) {
  let state: BankState = WAITING;
  let started = false;
  let desk: Desk | null = null;
  const listeners = new Set<() => void>();
  const hearers = new Set<(event: BankEvent) => void>();
  let unwatch: (() => void) | null = null;
  let ticks = 0;

  let wanted: Player = GUEST;
  let accounts: AccountStore | null = null;
  /** The store of the Medal Pusher's machine on the account, read once for a purse from before the bank. */
  let machines: AccountStore | null = null;
  /** The store of the Medal Pusher's record book on the account, read once for the days it took the bonus on. */
  let books: AccountStore | null = null;
  /** The accounts whose record book has been looked at on this page, and the reading of it while it is under way. */
  const lookedBooks = new Set<string>();
  let bookReading: Promise<void> | null = null;
  let sync: Sync | null = null;
  let where: Status['where'] = 'device';
  let kept = true;
  let moving = false;
  let heardAt = Number.NEGATIVE_INFINITY;
  /** When the account is to be read again, to see that the last write was not written over. */
  let checkAt: number | null = null;
  let asking: { at: Desk; until: number } | null = null;
  /** How many days' bonuses this page has paid. */
  let claims = 0;
  /** The accounts whose machine has been looked at for a purse from before the bank, on this page. */
  const looked = new Set<string>();

  // The card.
  let held: { release: () => void } | null = null;
  let waiting: (() => void) | null = null;
  /** Things to do once this page holds the card, each in a moment of it. */
  const jobs: (() => void)[] = [];
  let seat: { game: string; handlers: SeatHandlers; paused: boolean; held: boolean } | null = null;
  /** The era of the bank last heard of, to tell when it has been reset. */
  let era: number | null = null;

  /** The medals' history, told what the bank does as it does it, and written with the card as the medals are. */
  const history = createHistoryStore({
    read: env.read,
    write: env.write,
    remove: env.remove,
    now: env.now,
    mark: env.mark,
    holding: () => holding(),
    withCard: (job) => withCard(job),
  });
  /** Tells the history what has just happened to the medals on the table. */
  const noted = (told: Told): void => {
    const at = desk;
    if (at) history.observe({ ...told, at: env.now(), day: env.today(), left: spendable(at.ledger) } as Observation);
  };

  // ── Showing ──

  const publish = (): void => {
    const ledger = desk?.ledger ?? null;
    const balance = ledger ? balanceOf(ledger) : 0;
    const card: BankState['card'] = !seat ? 'none' : seat.held || !env.card.apart ? 'here' : seat.paused ? 'away' : waiting ? 'asking' : 'none';
    const out = ledger ? medalsOutAt(ledger) : NONE_OUT;
    state = {
      loaded: started && desk !== null,
      balance: Math.max(0, balance),
      owed: Math.max(0, -balance),
      owner: desk?.owner ?? null,
      where,
      kept,
      apart: env.card.apart,
      day: started ? env.today() : null,
      ledger,
      asking: asking !== null,
      claims,
      card,
      // The same list while it says the same, so that a page that shows it is not told it changed.
      out: out.length === state.out.length && out.every((game, index) => game === state.out[index]) ? state.out : out,
    };
    for (const listener of [...listeners]) listener();
  };

  const tell = (event: BankEvent): void => {
    for (const hearer of [...hearers]) hearer(event);
  };

  /** Notes the era of the bank on the table: a later one than was known is a reset, and every machine on the page hears of it. */
  const watchEra = (): void => {
    const now = desk?.ledger.era ?? null;
    const before = era;
    era = now;
    if (before !== null && now !== null && now > before) tell({ type: 'reset' });
  };

  // ── Storage ──

  const read = (key: string): string | null | undefined => {
    try {
      return env.read(key);
    } catch {
      return undefined;
    }
  };
  const put = (key: string, text: string): boolean => {
    try {
      env.write(key, text);
      return true;
    } catch {
      return false;
    }
  };
  const drop = (key: string): void => {
    try {
      env.remove(key);
    } catch {
      // It stays.
    }
  };

  /** The guest purses moved in on this device. */
  const banked = (): string[] => {
    try {
      const list = JSON.parse(read(BANKED_KEY) ?? '[]') as unknown;
      return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };

  /**
   * A new bank for a player who has none on this device. A guest whose Medal
   * Pusher kept a purse before the bank has that purse moved in and is given
   * nothing more; anyone else is given a new member's medals.
   */
  const newLedger = (owner: string | null): { ledger: Ledger; banked: string | null } => {
    if (owner === null) {
      // An empty purse is no purse: a machine saved since the bank keeps one, and a player whose machine had run out
      // would have been given a refill of as many as a new member is.
      const purse = banked().includes(PUSHER.guestPurse) ? null : purseIn(read(PUSHER.machineKey));
      if (purse !== null && purse > 0) return { ledger: importPurse(createLedger(env.device(), 0), PUSHER.guestPurse, purse), banked: PUSHER.guestPurse };
    }
    // An account's bank is never begun out of nothing on a device: it comes from the account, or from the guest's.
    return { ledger: createLedger(env.device(), owner === null ? undefined : 0), banked: null };
  };

  /** What this page knows to put into a desk's bank, beside what storage holds: copies joined, purses moved in, the book's days. */
  const withPending = (at: Desk, ledger: Ledger): Ledger => {
    let next = ledger;
    for (const theirs of at.joins) next = mergeLedgers(next, theirs);
    for (const { source, medals, machine } of at.imports) next = importPurse(next, source, medals, machine);
    if (at.days) next = withClaimed(next, at.days);
    for (const source of at.checks) next = markChecked(next, source);
    return next;
  };

  /** The days the record book took the bonus on before the bank paid it, so that none of them is paid twice. */
  const bookDays = (owner: string | null): DaySet | null => {
    const book = read(PUSHER.bookKey(owner));
    if (typeof book !== 'string') return null;
    try {
      const parsed = JSON.parse(book) as unknown;
      return isRecord(parsed) ? readDays(parsed.claimed) : null;
    } catch {
      return null;
    }
  };

  /**
   * Reads a desk's bank out of storage, with whatever this page has still to
   * put in. Returns whether storage could be read. A bank stored there that
   * cannot be read is put aside under a name of its own by the page that
   * holds the card, not written over, and a new one is begun.
   */
  const refresh = (at: Desk): boolean => {
    const text = read(at.key);
    if (text === undefined) return false;
    const stored = text === null ? null : parseLedger(text);
    if (text !== null && !stored && holding()) {
      put(`${at.key}#unread`, text);
      at.unsaved = true;
    }
    const base = stored ?? at.ledger;
    if (!stored) at.unsaved = true;
    const next = withPending(at, base);
    if (stored && serializeLedger(next) !== serializeLedger(stored)) at.unsaved = true;
    at.ledger = next;
    return true;
  };

  /** Writes the desk's bank. Only the page that holds the card does. */
  const store = (at: Desk): boolean => {
    const ok = put(at.key, serializeLedger(at.ledger));
    if (at === desk) kept = ok;
    if (!ok) return false;
    at.unsaved = false;
    at.joins = [];
    at.imports = [];
    at.days = null;
    at.checks = [];
    if (at.banked) {
      // The guest's machine's purse is in the bank now, and is never moved in again on this device.
      const list = banked();
      if (!list.includes(at.banked)) put(BANKED_KEY, JSON.stringify([...list, at.banked]));
      at.banked = null;
    }
    // A guest's bank that has become this account's is safely in the account's place now: it leaves the guest's.
    if (at.moved && at.owner !== null) {
      drop(BANK_KEY);
      at.moved = false;
    }
    return true;
  };

  /**
   * In a browser that cannot keep its pages apart, every page writes as though it held the card, and another tab's
   * write may have come since this page last read: a round's move reads what storage holds first, so that a move
   * another tab has made is known as made. (A page that holds the card is the only one that writes, and what it
   * has is newer than storage when a write of its own did not take: it does not read.)
   */
  const fresh = (at: Desk): void => {
    if (!env.card.apart && started) refresh(at);
  };

  // ── The card ──

  const holding = (): boolean => held !== null || !env.card.apart;

  /** Whether this page wants the card: something to do with it, or a machine that is to be played and is not paused. */
  const needs = (): boolean => jobs.length > 0 || (seat !== null && !seat.paused && env.visible());

  /** Lets the card go, the machine first writing down what it has to. */
  const letGo = (why: 'moment' | 'hidden' | 'left'): void => {
    if (!held) return;
    if (seat?.held) {
      // The machine writes down what it has while it still holds the card, and is told it has not afterwards.
      try {
        seat.handlers.yielding(why);
      } catch {
        // The card goes all the same.
      }
      seat.held = false;
    }
    // The history is written while the card is still here, as the machine's last medals were.
    history.yielding();
    const { release } = held;
    held = null;
    release();
  };

  /** The games whose machines this page has held the card for. */
  const everHeld = new Set<string>();

  /**
   * Writes down that a machine of `game` is played on this page now, and says
   * whether a machine of that game on another page has been played since this
   * page last held the card: that page's machine is the one saved then.
   */
  const takeTurn = (game: string): boolean => {
    let record: Record<string, unknown> = {};
    try {
      const stored = JSON.parse(read(CARD_KEY) ?? '{}') as unknown;
      if (isRecord(stored)) record = stored;
    } catch {
      // Nothing written down that can be read: nobody else is known to have played.
    }
    const last = record[game];
    const moved = everHeld.has(game) && typeof last === 'string' && last !== env.page;
    put(CARD_KEY, JSON.stringify({ ...record, [game]: env.page }));
    everHeld.add(game);
    return moved;
  };

  /** What happens when the card is this page's. */
  const granted = (release: () => void): void => {
    waiting = null;
    held = { release };
    // What another page wrote while it held the card is the truth now.
    if (desk && started) {
      refresh(desk);
      if (desk.unsaved) store(desk);
      watchEra();
    }
    while (jobs.length > 0) {
      const job = jobs.shift()!;
      try {
        job();
      } catch {
        // One job that fails does not keep the card from the next.
      }
    }
    if (seat && !seat.paused && env.visible()) {
      // The machine is played here now. If another page has played one of its game's machines since this page last
      // did, that page's machine is the one saved, and this one has to be opened again.
      const moved = takeTurn(seat.game);
      seat.held = true;
      seat.handlers.granted(moved);
    } else if (held) {
      letGo('moment');
    }
    publish();
  };

  /**
   * Asks for the card, telling the page that holds it why: for a machine to be played, for a moment, or not at all.
   *
   * The holder is told only once the request is in the browser's lock manager (`card.queued`). A holder that lets the
   * card go asks for it again at once, when its machine is still to be played; told while this page's request was still
   * on its way (a browser handles it apart from the page, and can be slow to), it could ask again first and take the
   * card straight back, and this page would wait behind it for as long as the machine played. A page that waits with a
   * job to do also says so again with every tick (`tick`): a browser whose lock manager cannot be asked, or a page
   * whose word went astray, is next in a turn or two all the same.
   */
  const ask = (because: 'play' | 'moment' | null): void => {
    let asked = false;
    if (!held && !waiting) {
      let answered = false;
      const withdraw = env.card.ask((release) => {
        answered = true;
        granted(release);
      });
      if (!answered) {
        waiting = withdraw;
        asked = true;
      }
    }
    if (because) {
      const say = (): void => env.post({ kind: 'want', page: env.page, play: because === 'play' });
      if (asked && env.card.queued) {
        // Said once the request is in, and only if this page is still waiting then: a card it was given meanwhile, or
        // one it no longer wants, needs no word, and the word would only send the card round again.
        const waits = waiting;
        env.card.queued().then(
          () => {
            if (!held && waiting === waits) say();
          },
          () => {
            if (!held && waiting === waits) say();
          },
        );
      } else say();
    }
    publish();
  };

  /** Does `job` with the card: at once if this page holds it, and otherwise as soon as it is given. */
  const withCard = (job: () => void): void => {
    if (held || !env.card.apart) {
      job();
      publish();
      return;
    }
    jobs.push(job);
    ask('moment');
  };

  /** Writes a desk's bank with the card, joining in what storage has by then. */
  const commit = (at: Desk): void => {
    withCard(() => {
      if (at !== desk) return;
      refresh(at);
      store(at);
      watchEra();
    });
  };

  // ── The account ──

  const keptBank: Kept = {
    slot: BANK_KEY,
    current: () => (desk ? serializeLedger(desk.ledger) : null),
    reads: (text) => parseLedger(text) !== null,
    print: printOf,
    settle(standing) {
      const { verdict, fromGuest } = settleLedgers(standing, env.device);
      moving = fromGuest;
      if (verdict.kind !== 'hold') heardAt = env.now();
      return verdict;
    },
    reopen: () => reopen(),
  };

  /** Storage as the keeper is given it: the guest's bank has one home, which only the holder of the card writes. */
  const slots: Slots = {
    getItem: (key) => env.read(key),
    setItem: (key, value) => {
      if (key !== BANK_KEY) env.write(key, value);
    },
    removeItem: (key) => {
      if (key !== BANK_KEY) env.remove(key);
    },
  };

  /** The account has said what it holds, in answer to a write: it is joined into that player's bank here. */
  const hears = (uid: string, theirs: Ledger): void => {
    const at = desk;
    if (!at || at.owner !== uid) return;
    const joined = mergeLedgers(at.ledger, theirs);
    if (serializeLedger(joined) === serializeLedger(at.ledger)) return;
    at.joins.push(theirs);
    at.ledger = joined;
    watchEra();
    commit(at);
    publish();
  };

  /**
   * The account's store as the keeper is given it: one that never writes
   * blind. A write reads what the account holds first, and sends the two
   * joined; when the account holds all of it already, nothing is written.
   */
  const joining = (base: AccountStore): AccountStore => ({
    load: (uid) => base.load(uid),
    async store(uid, cloud) {
      // Another device can read and write between this one's read and its write, and its write then goes over this
      // one's. So the account is read again a little after each write, and what it lacks is sent again (`check`).
      const written = (going: Promise<void>): Promise<void> =>
        going.then(() => {
          checkAt = env.now() + CHECK_AFTER;
        });
      const sending = fromCloud(cloud);
      const mine = sending ? parseLedger(sending.text) : null;
      if (!sending || !mine || env.now() - heardAt < HEARD_FOR) return written(base.store(uid, cloud));
      const found = await base.load(uid);
      if (!found) return written(base.store(uid, cloud));
      const got = fromCloud(found.state);
      const theirs = got ? parseLedger(got.text) : null;
      if (!got || !theirs) throw new Error('The account holds a copy this page cannot read');
      heardAt = env.now();
      const merged = serializeLedger(mergeLedgers(mine, theirs));
      const news = printOf(merged) !== printOf(sending.text);
      if (news) hears(uid, theirs);
      if (printOf(merged) === printOf(got.text)) return undefined;
      const changedAt = (cloud as { changedAt?: unknown }).changedAt;
      const joined = news ? toCloud(merged, sending.mark ?? env.mark(), typeof changedAt === 'number' ? changedAt : env.now()) : null;
      return written(base.store(uid, joined ?? cloud));
    },
    prepare: () => Promise.resolve(),
    storeNow: () => null,
    forget: (uid) => base.forget(uid),
  });

  /**
   * Reads the account again after a write, and sends what it lacks of this
   * device's bank: what another device wrote over it, having read the account
   * before this device's write landed. It is what keeps a medal played here
   * from being missing on the account for good.
   */
  const check = (): void => {
    const at = desk;
    const uid = wanted.uid;
    const base = accounts;
    if (!base || !at || uid === null || at.owner !== uid || where !== 'account') return;
    const later = (): void => {
      checkAt = env.now() + CHECK_AGAIN;
    };
    base.load(uid).then((found) => {
      if (!started || desk !== at || wanted.uid !== uid) return;
      const got = found ? fromCloud(found.state) : null;
      const theirs = got ? parseLedger(got.text) : null;
      // A copy that cannot be read is left exactly as it is.
      if (found && (!got || !theirs)) return;
      if (theirs) {
        heardAt = env.now();
        hears(uid, theirs);
      }
      const merged = serializeLedger(theirs ? mergeLedgers(at.ledger, theirs) : at.ledger);
      if (got && printOf(merged) === printOf(got.text)) return;
      const cloud = toCloud(merged, env.mark(), env.now());
      if (cloud) joining(base).store(uid, cloud).catch(later);
    }, later);
  };

  const keeper = (base: AccountStore): Sync =>
    createSync({
      kept: keptBank,
      store: joining(base),
      slots: () => slots,
      now: env.now,
      mark: env.mark,
      every: SEND_EVERY,
      onStatus: (status) => {
        where = status.where;
        if (started) {
          lookForPurse();
          lookForBookDays();
          publish();
        }
      },
    });

  /**
   * An account's machine from before the bank may have had a purse that has
   * not been moved in yet: the copy of it this device keeps is looked at when
   * the bank is opened, and once the account has been reached, the account's
   * own machine, once.
   */
  const lookForPurse = (): void => {
    const at = desk;
    const uid = at?.owner ?? null;
    if (!at || uid === null || where !== 'account' || !machines || looked.has(uid) || hasImported(at.ledger, PUSHER.accountPurse)) return;
    looked.add(uid);
    machines.load(uid).then(
      (found) => {
        if (!started || desk !== at || hasImported(at.ledger, PUSHER.accountPurse)) return;
        const text = found ? (fromCloud(found.state)?.text ?? null) : null;
        // An account with no machine had no purse, and its player is a new member: that is written down too, so that
        // nobody asks again.
        const purse = found ? purseIn(text) : 0;
        if (purse === null) return;
        // An empty purse is no purse, and takes nothing back (see `newLedger`): only a purse with medals in it says
        // that the player was not a new member.
        const move = { source: PUSHER.accountPurse, medals: purse, machine: purse > 0 };
        at.imports.push(move);
        at.ledger = importPurse(at.ledger, move.source, move.medals, move.machine);
        commit(at);
        sync?.save('moment');
        publish();
      },
      () => {
        // Not now: the next time the bank is opened.
        looked.delete(uid);
      },
    );
  };

  /**
   * The days the account's record book took the bonus on before the bank
   * paid it, read once, so that a day taken on another device before the
   * bank is not paid again here. The copy of the book this device keeps is
   * read whenever the bank is opened (`bookDays`); this is for a device that
   * keeps none.
   */
  const lookForBookDays = (): void => {
    const at = desk;
    const uid = at?.owner ?? null;
    if (!at || uid === null || where !== 'account' || !books || lookedBooks.has(uid) || hasImported(at.ledger, PUSHER.accountDays)) return;
    lookedBooks.add(uid);
    bookReading = books.load(uid).then(
      (found) => {
        bookReading = null;
        if (!started || desk !== at || hasImported(at.ledger, PUSHER.accountDays)) return;
        const text = found ? (fromCloud(found.state)?.text ?? null) : null;
        let days: DaySet = {};
        try {
          const parsed = text === null ? null : (JSON.parse(text) as unknown);
          if (isRecord(parsed)) days = readDays(parsed.claimed);
        } catch {
          // A book this page cannot read has no days to give.
        }
        // A book that is there and cannot be read here is asked for again the next time; one that is not there is not.
        if (found && text === null) return;
        at.days = unionDays(at.days ?? {}, days);
        at.checks.push(PUSHER.accountDays);
        at.ledger = markChecked(withClaimed(at.ledger, days), PUSHER.accountDays);
        commit(at);
        sync?.save('moment');
        publish();
      },
      () => {
        bookReading = null;
        lookedBooks.delete(uid);
      },
    );
  };

  /**
   * Puts a player's bank on the table: what this device keeps for them, with
   * the copy the keeper has handed over joined in. Nothing is written here;
   * whatever storage lacks is written with the card.
   */
  const seatDesk = (text: string | null, owner: string | null, moved: boolean): void => {
    const key = ledgerKey(owner);
    const stored = read(key);
    kept = stored !== undefined;
    const fromStorage = typeof stored === 'string' ? parseLedger(stored) : null;
    const given = text === null ? null : parseLedger(text);
    const had = desk && desk.owner === owner ? desk : null;
    let ledger: Ledger;
    let bankedNow: string | null = null;
    if (fromStorage && given) ledger = mergeLedgers(fromStorage, given);
    else if (fromStorage || given) ledger = (fromStorage ?? given)!;
    else if (had) ledger = had.ledger;
    else ({ ledger, banked: bankedNow } = newLedger(owner));
    const at: Desk = had ?? { owner, key, ledger, unsaved: false, joins: [], imports: [], days: null, checks: [], moved: false, banked: null };
    at.ledger = ledger;
    // The copy handed over is joined into what storage holds when the bank is next written, as a copy heard from the
    // account is (`hears`): writing reads storage first, and would otherwise leave out what only the handed copy has
    // (another device's play, and the receipts of its moves) until the next copy came from the account.
    if (fromStorage && given) at.joins.push(given);
    at.moved ||= moved && owner !== null;
    at.banked ??= bankedNow;
    // An account's machine kept on this device from before the bank may hold a purse: it is moved in.
    if (owner !== null && !hasImported(ledger, PUSHER.accountPurse)) {
      const purse = purseInCopy(read(slotFor(PUSHER.machineKey, owner)));
      if (purse !== null && purse > 0) at.imports.push({ source: PUSHER.accountPurse, medals: purse, machine: true });
    }
    at.days = bookDays(owner);
    at.ledger = withPending(at, at.ledger);
    at.unsaved = !fromStorage || at.moved || serializeLedger(at.ledger) !== serializeLedger(fromStorage);
    // Another player's bank is not a reset of the one before it: its era is the one heard of from here on.
    if (!had) era = null;
    desk = at;
    // The history of these medals is put beside them; a guest's that have become the account's take the guest's history with them.
    history.seat(owner, at.ledger.device, at.moved);
    watchEra();
    if (at.unsaved) commit(at);
  };

  function reopen(): void {
    if (!sync) return;
    const carried = moving;
    moving = false;
    const text = sync.open();
    const owner = sync.owner();
    if (!started) return;
    if (desk && desk.owner !== owner) asking = null;
    seatDesk(text, owner, carried);
    lookForPurse();
    lookForBookDays();
    publish();
    sync.save('tick');
  }

  // ── Running ──

  const tick = (): void => {
    if (!started || !desk) return;
    ticks += 1;
    history.tick();
    // A job still waiting for the card says so again: the holder may have taken the card back before this page's request
    // reached the lock manager (see `ask`), and it lets the card go once more when it hears.
    if (waiting && jobs.length > 0) env.post({ kind: 'want', page: env.page, play: false });
    if (state.day !== env.today()) publish();
    if (ticks % LOOK_EVERY === 0) sync?.save(where === 'offline' ? 'moment' : 'tick');
    if (checkAt !== null && env.now() >= checkAt) {
      checkAt = null;
      check();
    }
    if (asking && ticks >= asking.until) {
      asking = null;
      pays();
    }
  };

  const start = (): void => {
    if (started) return;
    started = true;
    ticks = 0;
    history.start();
    sync = accounts ? keeper(accounts) : null;
    sync?.player(wanted);
    era = null;
    seatDesk(sync ? sync.open() : null, sync ? sync.owner() : null, false);
    lookForBookDays();
    unwatch = env.watch({
      tick,
      changed: (key) => {
        history.changed(key);
        const at = desk;
        if (!started || !at || (typeof key === 'string' && key !== at.key) || held) return;
        refresh(at);
        watchEra();
        publish();
      },
      heard: (message) => {
        if (message.kind !== 'want' || message.page === env.page || !held) return;
        // Another page needs the card. A player starting another machine pauses this one; a moment's need is waited out.
        if (message.play && seat) seat.paused = true;
        letGo('moment');
        if (needs()) ask(null);
        publish();
      },
      hidden: (why) => {
        letGo(why);
        // A machine that is not shown does not run, and a page that is not shown asks for nothing.
        if (waiting && jobs.length === 0) {
          waiting();
          waiting = null;
        }
        if (desk?.unsaved) commit(desk);
        sync?.save('moment');
        history.hidden();
        publish();
      },
      shown: () => {
        if (needs()) ask(null);
        tick();
        publish();
      },
    });
    lookForPurse();
    publish();
    sync?.save('tick');
  };

  const end = (): void => {
    if (!started) return;
    letGo('left');
    if (waiting) {
      waiting();
      waiting = null;
    }
    history.end();
    sync?.save('moment');
    sync?.close();
    sync = null;
    where = 'device';
    moving = false;
    asking = null;
    unwatch?.();
    unwatch = null;
    started = false;
    desk = null;
    state = WAITING;
  };

  const maybeEnd = (): void => {
    if (listeners.size === 0 && hearers.size === 0 && !seat && jobs.length === 0 && !history.listening()) end();
  };

  /** Pays today's bonus, with the card, from the bank as storage has it then: a day another tab took is not paid again. */
  function pays(): void {
    const at = desk;
    if (!at) return;
    withCard(() => {
      if (at !== desk || !env.card.apart) return;
      refresh(at);
      const { ledger, medals } = claimBonus(at.ledger, env.today());
      if (medals === 0) {
        if (at.unsaved) store(at);
        return;
      }
      at.ledger = ledger;
      if (!store(at)) return;
      claims += 1;
      noted({ type: 'bonus', medals });
      tell({ type: 'bonus', medals });
      sync?.save('moment');
    });
  }

  return {
    getState: (): BankState => state,

    /** Listens for changes. The bank is read when the first listener arrives and put away when the last one leaves. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
        maybeEnd();
      };
    },

    /** Hears what happened to the bank that a machine acts out. */
    listen(hearer: (event: BankEvent) => void): () => void {
      hearers.add(hearer);
      start();
      return () => {
        hearers.delete(hearer);
        maybeEnd();
      };
    },

    /**
     * Says who is playing, and where their account keeps the bank; and,
     * for what the Medal Pusher kept before the bank, where the account keeps
     * its machine (for its purse) and its record book (for the days it took
     * the bonus on).
     */
    attend(player: Player, store: AccountStore | null = null, legacy: { machines?: AccountStore | null; books?: AccountStore | null } = {}): void {
      wanted = store ? player : GUEST;
      machines = legacy.machines ?? null;
      books = legacy.books ?? null;
      // The history is kept on the account beside the medals, wherever they are.
      history.attend(wanted, store ? (env.historyStore?.() ?? null) : null);
      if (store === accounts) {
        sync?.player(wanted);
        return;
      }
      accounts = store;
      if (!started) return;
      sync?.close();
      sync = store ? keeper(store) : null;
      sync?.player(wanted);
      if (sync) reopen();
    },

    /** The medals that can be played now. */
    balance: (): number => (desk ? spendable(desk.ledger) : 0),

    /** Whose bank is on the table: an account's id, or null for a guest's. */
    owner: (): string | null => desk?.owner ?? null,

    /** Takes medals out to be played, by the page that holds the card. Returns whether it did: the bank holds that many. */
    take(medals: number): boolean {
      const at = desk;
      if (!at || !holding()) return false;
      const next = take(at.ledger, medals);
      if (!next) return false;
      at.ledger = next;
      store(at);
      noted({ type: 'medals' });
      publish();
      return true;
    },

    /** Puts medals won back in, by the page that holds the card. Returns whether it did. */
    give(medals: number): boolean {
      const at = desk;
      if (!at || !holding() || !Number.isSafeInteger(medals) || medals <= 0) return false;
      at.ledger = give(at.ledger, medals);
      store(at);
      noted({ type: 'medals' });
      publish();
      return true;
    },

    /**
     * Makes one move of a round's medals, once, by the page that holds the
     * card: the medals and the move's receipt go into the ledger in one write
     * (see "Receipts" in ledger.ts). `applied`: made now. `already`: made
     * before, here or by any page or device, and not made again. Null: not
     * made, because this page does not hold the card, the move will not do,
     * the medals are not there to take, it is for another era of the medals
     * than the one on the table, or this device holds as many receipts as it
     * may. Like `take` and `give`, a move this browser's storage would not
     * keep stays in the medals on the page (`kept` says so), and goes to
     * storage with the next write that takes.
     */
    apply(move: Move): 'applied' | 'already' | null {
      const at = desk;
      if (!at || !holding()) return null;
      fresh(at);
      if (move.era !== undefined && move.era !== at.ledger.era) return null;
      const receipt = receiptOf(move.game, move.round, move.step);
      const moved = receipt === null ? null : applyMove(at.ledger, receipt, move.medals, move.out);
      if (!moved) return null;
      if (!moved.applied) return 'already';
      at.ledger = moved.ledger;
      store(at);
      noted({ type: 'move', game: move.game, round: move.round, step: move.step, medals: move.medals });
      publish();
      return 'applied';
    },

    /**
     * Pays medals in from outside the machines (a floor jackpot won on the
     * server: MedalCenter/floor/jackpotPayer.ts) under a receipt, once, as
     * `apply` makes a round's move, but with the card: at once on a page that
     * holds it, and otherwise as soon as it is given, as the hub's buttons do.
     * The same write lets go of the game's other receipts on this device but
     * those `keep` says are still needed. Resolves to `applied`, `already`
     * (made before, here or on any device whose medals have been joined in),
     * or null: not made, because the medals were not read yet, another
     * player's medals came onto the table meanwhile, or the move will not do.
     */
    credit(move: Move, keep: (round: string) => boolean): Promise<'applied' | 'already' | null> {
      return new Promise((resolve) => {
        const at = desk;
        if (!at || !started || !Number.isSafeInteger(move.medals) || move.medals <= 0) {
          resolve(null);
          return;
        }
        withCard(() => {
          if (at !== desk) {
            resolve(null);
            return;
          }
          fresh(at);
          if (move.era !== undefined && move.era !== at.ledger.era) {
            resolve(null);
            return;
          }
          const receipt = receiptOf(move.game, move.round, move.step);
          const moved = receipt === null ? null : applyMove(at.ledger, receipt, move.medals, false);
          if (!moved) {
            resolve(null);
            return;
          }
          const prefix = `${move.game}:`;
          const rounds = receiptsOf(moved.ledger, moved.ledger.device)
            .ids.filter((id) => id.startsWith(prefix))
            .map((id) => id.slice(prefix.length, id.indexOf(':', prefix.length)));
          const ledger = forgetReceipts(moved.ledger, move.game, [move.round, ...rounds.filter(keep)]);
          let kept = true;
          if (ledger !== at.ledger) {
            at.ledger = ledger;
            kept = store(at);
            // A floor jackpot is an entry of its own in the history; anything else from outside the machines, only what is left.
            if (moved.applied) noted(move.game === FLOOR_JACKPOT ? { type: 'floor', id: move.round, medals: move.medals } : { type: 'medals' });
            sync?.save('moment');
          }
          // Made, but not kept by this browser's storage: it is in the medals on the page, and goes to the account with
          // them. Said as not made yet, so that whoever asked waits a while before saying it is paid.
          resolve(!kept ? null : moved.applied ? 'applied' : 'already');
        });
      });
    },

    /** Whether a move of a round's medals has been made in the medals on the table: its receipt is there. */
    applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean {
      const at = desk;
      const receipt = receiptOf(move.game, move.round, move.step);
      if (!at || receipt === null) return false;
      if (holding()) fresh(at);
      return hasReceipt(at.ledger, receipt);
    },

    /**
     * Lets go of this device's receipts for `game`'s rounds, all but those of
     * the rounds in `keep`, by the page that holds the card: a round is over
     * and kept no more, and nothing will try its moves again. Returns whether
     * this page could (it holds the card).
     */
    forget(game: string, keep: readonly string[] = []): boolean {
      const at = desk;
      if (!at || !holding()) return false;
      fresh(at);
      const next = forgetReceipts(at.ledger, game, keep);
      if (next !== at.ledger) {
        at.ledger = next;
        store(at);
        publish();
      }
      // The machine is done with every other round of the game: the history writes them down as over, a lost one too.
      noted({ type: 'over', game, keep });
      return true;
    },

    /**
     * Says that `game`'s rounds on this device, all but those in `keep`, have
     * no medals out any more ("Medals out" in ledger.ts), by the page that
     * holds the card: lost, or paid, or never played. A machine says so as a
     * round of it is settled without a pay, and whenever it finds its rounds
     * settled. Returns whether this page could (it holds the card).
     */
    settle(game: string, keep: readonly string[] = []): boolean {
      const at = desk;
      if (!at || !holding()) return false;
      fresh(at);
      const next = settleRounds(at.ledger, game, keep);
      if (next !== at.ledger) {
        at.ledger = next;
        store(at);
        publish();
      }
      return true;
    },

    /** Gives a player with no medals left a free refill. Returns whether one was due, when this page holds the card; otherwise it is paid with the card. */
    refill(): boolean {
      const at = desk;
      if (!at || !refillDue(at.ledger)) return false;
      let paid = false;
      withCard(() => {
        if (at !== desk) return;
        refresh(at);
        if (!refillDue(at.ledger)) return;
        at.ledger = refill(at.ledger);
        if (!store(at)) return;
        paid = true;
        noted({ type: 'refill', medals: REFILL });
        tell({ type: 'refill', medals: REFILL });
        sync?.save('moment');
      });
      return paid;
    },

    /**
     * Takes today's bonus. A player whose account has been reached has the
     * account asked first, since another device may have taken the day: its
     * copy is joined in, and the day is paid only if it is still to take. An
     * account that fails to answer, or takes longer than `ASK_SECONDS`, is not
     * waited for.
     */
    claimBonus(): void {
      const at = desk;
      if (!started || !at || asking || !env.card.apart) return;
      const uid = wanted.uid;
      // A player who is signed in is paid into their own bank, once it is known whether the account has one: not into
      // the guest's that stands on the table while the account is asked.
      if (accounts && uid !== null && (where === 'checking' || at.owner !== uid)) return;
      if (!accounts || uid === null || where !== 'account') {
        pays();
        return;
      }
      const mine = (asking = { at, until: ticks + ASK_SECONDS });
      publish();
      const heard = (theirs: Ledger | null): void => {
        const waited = asking === mine;
        if (waited) asking = null;
        if (theirs && started && desk === mine.at) hears(uid, theirs);
        if (waited) pays();
        publish();
      };
      // The days the account's old record book took the bonus on are waited for too, if they are still being read.
      const days = bookReading ?? Promise.resolve();
      Promise.all([accounts.load(uid), days.catch(() => undefined)]).then(
        ([found]) => {
          const text = found ? fromCloud(found.state)?.text : null;
          const theirs = typeof text === 'string' ? parseLedger(text) : null;
          if (theirs || !found) heardAt = env.now();
          heard(theirs);
        },
        () => heard(null),
      );
    },

    /**
     * Starts the bank over: every medal in it is thrown away, a new member's
     * medals are put in, and every machine starts over. The days the bonus was
     * taken stay. For a player who is signed in it reaches the account at once
     * and, from there, their other devices.
     */
    reset(): void {
      const at = desk;
      if (!at) return;
      withCard(() => {
        if (at !== desk) return;
        refresh(at);
        const thrown = spendable(at.ledger);
        at.ledger = resetLedger(at.ledger);
        store(at);
        noted({ type: 'reset', thrown, medals: WELCOME });
        watchEra();
        sync?.save('moment');
      });
    },

    /** Moves a purse that a machine held before the bank into the bank of `owner`, once. */
    importPurse(owner: string | null, source: string, medals: number): void {
      const at = desk;
      if (!at || at.owner !== owner || hasImported(at.ledger, source)) return;
      at.imports.push({ source, medals, machine: true });
      at.ledger = importPurse(at.ledger, source, medals);
      // This device's guest purse is written down as moved in, so that no later guest's bank here moves it in again.
      if (source === PUSHER.guestPurse && owner === null) at.banked = source;
      commit(at);
      sync?.save('moment');
      publish();
    },

    /** Whether a game's machines are to be started over, the bank having been reset since they last were. */
    restartDue: (game: string): boolean => (desk ? restartDue(desk.ledger, game) : false),

    /** Notes that a game's machine has been started over since the bank's last reset. */
    restarted(game: string): void {
      const at = desk;
      if (!at || !restartDue(at.ledger, game)) return;
      withCard(() => {
        if (at !== desk) return;
        refresh(at);
        at.ledger = restarted(at.ledger, game);
        store(at);
      });
    },

    /**
     * Takes a seat at the bank for a machine of `game`: the card is asked for
     * at once, as the player has come to play it. One seat per page.
     */
    sit(game: string, handlers: SeatHandlers): Seat {
      const mine = { game, handlers, paused: false, held: false };
      if (seat) seat.held = false;
      seat = mine;
      start();
      // Asked for once the seat has been handed back, so that the machine is never told it has the card before it has its seat.
      queueMicrotask(() => {
        if (seat === mine) ask('play');
      });
      return {
        holding: () => seat === mine && (mine.held || !env.card.apart),
        play: () => {
          if (seat !== mine) return;
          mine.paused = false;
          if (held && !mine.held) {
            // The card is here for a moment's job: the machine has it as soon as that is done.
            return;
          }
          ask('play');
          publish();
        },
        leave: () => {
          if (seat !== mine) return;
          if (mine.held) letGo('left');
          seat = null;
          if (waiting && jobs.length === 0) {
            waiting();
            waiting = null;
          }
          publish();
          maybeEnd();
        },
      };
    },

    /** Today's bonus card, from the bank on the table: null until it has been read. */
    cardToday: () => (desk ? cardOf(desk.ledger, env.today()) : null),

    /**
     * A machine tells the medals' history what its moves of medals do not say:
     * a round it counts whole, or what it fed and paid since it last said (see
     * `Played`). It goes into the history of the medals on the table, and
     * moves no medal.
     */
    played(report: Played): void {
      if (!started) return;
      if ('round' in report) noted({ type: 'round', game: report.game, round: report.round, bet: report.bet, won: report.won });
      else noted({ type: 'machine', game: report.game, fed: report.fed, won: report.won, prize: report.prize ?? 0, jackpots: report.jackpots ?? [] });
    },

    /** The medals' history as it stands: `HISTORY_WAITING` until it has been read. */
    historyState: (): HistoryState => history.getState(),

    /** Listens for changes to the medals' history. The bank is opened for it, as for any listener, and put away when the last one leaves. */
    watchHistory(listener: () => void): () => void {
      const stop = history.subscribe(listener);
      start();
      return () => {
        stop();
        maybeEnd();
      };
    },
  };
}

// ── The browser ─────────────────────────────────────────────────────────────

const randomFrom = (): (() => number) => {
  try {
    const numbers = window.crypto.getRandomValues(new Uint32Array(16));
    let next = 0;
    return () => numbers[next++ % numbers.length] / 2 ** 32;
  } catch {
    return Math.random;
  }
};

/**
 * Runs `then` in a task of its own, after this one: a message to itself, which the browser does not hold back in a
 * hidden page as it does a timer.
 */
const nextTask = (then: () => void): void => {
  if (typeof MessageChannel === 'undefined') {
    setTimeout(then, 0);
    return;
  }
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    then();
  };
  channel.port2.postMessage(null);
};

/** Where a page that lets the card go writes, last of all, a mark of its own: the next page to hold it reads it first. */
export const CARD_HANDED_KEY = 'medal-center-card-handed';
/** How long a page given the card waits at most for the mark of the page that let it go. A page that died left none. */
export const CARD_HANDED_WAIT_MS = 2_000;

/** The parts of a browser the card is made of. */
export interface BrowserCardDeps {
  /** The browser's lock manager, where it has one. */
  locks: Pick<LockManager, 'request' | 'query'> | undefined;
  /** This page's storage. Either may throw, when storage is blocked. */
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  /** Hears another page's writes to storage, by key (null for a clear). Returns what stops it. */
  onStorage: (listener: (key: string | null) => void) => () => void;
  /** Runs something in a task after this one. */
  nextTask: (run: () => void) => void;
  /** Runs something after `ms`. Returns what cancels it. */
  later: (run: () => void, ms: number) => () => void;
  /** A mark no other page will write. */
  mark: () => string;
  /** Whether the page is being left (from pagehide until it is shown again). */
  leaving: () => boolean;
}

/**
 * The card in a browser: a Web Lock held for as long as the page keeps the card.
 *
 * What a page writes down as it lets the card go (the bank, its machine) is in its own storage at once, but it reaches
 * the other tabs later, and the lock can reach the next tab first: Firefox hands a tab what another wrote once the
 * task that wrote it is over, and WebKit sends storage and locks to a tab by different ways, so either can come first.
 * A tab that read the bank and the machine then would find them as they were before, and write them back so. So the
 * card is handed over:
 *
 * - The page that lets it go writes a mark of its own (`CARD_HANDED_KEY`) after everything else, and lets go a task
 *   later, when the task that wrote is over. A page that is being left lets go at once: it may not run another task,
 *   and the browser takes the card back as it goes.
 * - A page asks first for the card only if nobody holds it (`ifAvailable`), and then takes it at once, with nothing to
 *   wait for. If another page holds it, it gets in line for it, and is given it only once its storage has that page's
 *   mark, and so everything written before it. A page that died wrote no mark: after `CARD_HANDED_WAIT_MS` the card
 *   is given all the same. A page whose own card is still on its way out waits for no mark either.
 */
export function createBrowserCard({ locks, read, write, onStorage, nextTask: afterThis, later, mark, leaving }: BrowserCardDeps): CardLock {
  const apart = !!locks && typeof locks.request === 'function';
  /** This page's own cards that have been let go and not yet given back to the lock manager. */
  let going = 0;
  const readMark = (): string | null | undefined => {
    try {
      return read(CARD_HANDED_KEY);
    } catch {
      return undefined;
    }
  };
  /** Resolves once storage has a mark other than `before`, or after the longest wait. */
  const markAfter = (before: string | null): Promise<void> =>
    new Promise<void>((done) => {
      let over = false;
      const stops: (() => void)[] = [];
      const finish = () => {
        if (over) return;
        over = true;
        for (const stop of stops) stop();
        done();
      };
      const look = () => {
        if (readMark() !== before) finish();
      };
      stops.push(onStorage((key) => (key === CARD_HANDED_KEY || key === null) && look()));
      stops.push(later(finish, CARD_HANDED_WAIT_MS));
      // Storage tells a page of another's writes; a look now and then makes sure of it.
      const poll = () => {
        if (over) return;
        look();
        if (!over) stops.push(later(poll, 50));
      };
      poll();
    });
  /** Gives the card to the page, with what lets it go: its mark written last, and the lock let go a task later. */
  const hold = (granted: (release: () => void) => void) =>
    new Promise<void>((release) =>
      granted(() => {
        try {
          write(CARD_HANDED_KEY, mark());
        } catch {
          // Storage is blocked: there is nothing the next page could read anyway.
        }
        if (leaving()) {
          release();
          return;
        }
        going += 1;
        afterThis(() => {
          going -= 1;
          release();
        });
      }),
    );
  /** Resolves once this page's latest request for the card is in the lock manager's line, or has been given. */
  let inLine: Promise<void> = Promise.resolve();
  return {
    apart,
    ask: (granted) => {
      if (!apart || !locks) {
        granted(() => undefined);
        return () => undefined;
      }
      const stop = new AbortController();
      let given = false;
      let lineUp: () => void = () => undefined;
      inLine = new Promise<void>((resolve) => (lineUp = resolve));
      // The mark the last page to let the card go left, as this page's storage has it now; and whether the card on its
      // way back to the lock manager is this page's own.
      const before = readMark();
      const ours = going > 0;
      locks
        .request(CARD_LOCK, { ifAvailable: true }, (free) => {
          if (free && stop.signal.aborted) {
            // Withdrawn before it was answered: the card is let go again untouched.
            lineUp();
            return undefined;
          }
          if (free) {
            given = true;
            lineUp();
            return hold(granted);
          }
          if (stop.signal.aborted) {
            lineUp();
            return undefined;
          }
          locks
            .request(CARD_LOCK, { signal: stop.signal }, async () => {
              given = true;
              if (before !== undefined && !ours) await markAfter(before);
              return hold(granted);
            })
            .catch(() => {
              // Withdrawn while it waited, or refused: nothing was given.
            });
          lineUp();
          return undefined;
        })
        .catch(() => {
          // Refused: nothing was given, and nothing is waited for.
          lineUp();
        });
      return () => {
        if (!given) stop.abort();
      };
    },
    // The lock manager answers a page's calls in the order they were made: a question asked after a request is
    // answered once the request is in. The request that waits is made once the card is found taken, so the question
    // is asked once that request has been made.
    queued: () =>
      apart && locks && typeof locks.query === 'function'
        ? inLine.then(() => locks.query()).then(
            () => undefined,
            () => undefined,
          )
        : Promise.resolve(),
  };
}

const browserCard = (): CardLock => {
  let leaving = false;
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => (leaving = true), true);
    window.addEventListener('pageshow', () => (leaving = false), true);
  }
  return createBrowserCard({
    locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
    read: (key) => window.localStorage.getItem(key),
    write: (key, text) => window.localStorage.setItem(key, text),
    onStorage: (listener) => {
      const onEvent = (event: StorageEvent) => listener(event.key);
      window.addEventListener('storage', onEvent);
      return () => window.removeEventListener('storage', onEvent);
    },
    nextTask,
    later: (run, ms) => {
      const id = window.setTimeout(run, ms);
      return () => window.clearTimeout(id);
    },
    mark: () => randomName(randomFrom()) + randomName(randomFrom()),
    leaving: () => leaving,
  });
};

/**
 * An account's store for one game key on the site's save service, loaded the
 * first time it is used: the module that talks to the service is the one
 * every machine's page has already, and the bank's own tests never load it.
 * Nothing is sent as the page is left (`storeNow`): the history never sends
 * blind, and so never in the way that outlives the page.
 */
const savedLater = (gameKey: string): AccountStore => {
  let real: Promise<AccountStore> | null = null;
  const store = (): Promise<AccountStore> => (real ??= import('../MedalPusher/accountStore').then(({ accountStoreFor }) => accountStoreFor(gameKey)));
  return {
    load: (uid) => store().then((it) => it.load(uid)),
    store: (uid, state) => store().then((it) => it.store(uid, state)),
    prepare: (uid) => store().then(
      (it) => it.prepare(uid),
      () => undefined,
    ),
    storeNow: () => null,
    forget: (uid) => {
      void store().then(
        (it) => it.forget(uid),
        () => undefined,
      );
    },
  };
};
let historyAccount: AccountStore | null = null;

let channel: BroadcastChannel | null = null;
const browser = (): BankEnv => ({
  read: (key) => window.localStorage.getItem(key),
  write: (key, text) => window.localStorage.setItem(key, text),
  remove: (key) => window.localStorage.removeItem(key),
  today: () => localDay(new Date()),
  device: () => randomName(randomFrom()),
  now: () => Date.now(),
  mark: () => randomName(randomFrom()) + randomName(randomFrom()),
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  watch: ({ tick, changed, heard, hidden, shown }) => {
    const timer = window.setInterval(tick, 1000);
    const onStorage = (event: StorageEvent) => changed(event.key);
    const onVisibility = () => (document.visibilityState === 'hidden' ? hidden('hidden') : shown());
    const onLeave = () => hidden('left');
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) shown();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('pageshow', onShow);
    try {
      channel ??= new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        const message = event.data as BankMessage;
        if (isRecord(message) && message.kind === 'want' && typeof message.page === 'string') heard(message);
      };
    } catch {
      channel = null;
    }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('pageshow', onShow);
      if (channel) channel.onmessage = null;
    };
  },
  post: (message) => {
    try {
      channel ??= new BroadcastChannel(CHANNEL);
      channel.postMessage(message);
    } catch {
      // No other page can be told: the card is still only ever held by one.
    }
  },
  card: browserCard(),
  page: randomName(randomFrom()),
  historyStore: () => (historyAccount ??= savedLater(HISTORY_GAME_KEY)),
});

let theBank: Bank | null = null;
/** The page's one bank. It is made the first time it is asked for, which is never on the server. */
export const bank = (): Bank => (theBank ??= createBank(browser()));

const waitingState = (): BankState => WAITING;
const subscribeToBank = (listener: () => void) => bank().subscribe(listener);
const bankState = () => bank().getState();
/** The bank as the page shows it: `WAITING` on the server and in the first drawing, the browser's bank after. */
export const useBank = (): BankState => useSyncExternalStore(subscribeToBank, bankState, waitingState);

const waitingHistory = (): HistoryState => HISTORY_WAITING;
const subscribeToHistory = (listener: () => void) => bank().watchHistory(listener);
const historyNow = () => bank().historyState();
/** The medals' history as the page shows it: `HISTORY_WAITING` on the server and in the first drawing, the browser's after. */
export const useMedalHistory = (): HistoryState => useSyncExternalStore(subscribeToHistory, historyNow, waitingHistory);
