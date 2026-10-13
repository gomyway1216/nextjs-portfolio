'use client';

/**
 * The record book in the browser: where `records.ts`, which is only
 * arithmetic, meets the things it must not touch itself. This reads the
 * player's clock for the day, keeps the book in the browser's storage, hears
 * from the cabinet what the machine did, pays the day's bonus into the
 * machine's purse, and keeps the book of a player who is signed in on their
 * account as well.
 *
 * The page is drawn on the server first, where there is no browser, no book
 * and no today. So nothing is read until the page is in the browser and
 * something on it is listening: until then, and on the server, the state is
 * `WAITING`, and everything that shows the book draws its empty form.
 *
 * The day is looked at once a second, by a timer. A page left open over
 * midnight finds the new day's bonus ready without being loaded again, and so
 * does one whose clock is changed under it.
 *
 * Several tabs of the game share one stored book, and storage can only read a
 * value or write one: a tab that reads, works something out and writes can
 * have another tab's write land in between, and then write over it. So
 * everything that writes is a transaction, and a transaction runs under a
 * lock that the whole browser shares (the Web Locks API): no other tab reads
 * or writes the book while it runs. What a tab has counted since it last
 * looked is added to what is stored, never written over it, and a day's
 * bonus is paid only by a transaction that holds the lock, after the day has
 * been written into the book and read back out of storage.
 *
 * A browser without Web Locks (Safari before 15.4), or one that will not
 * grant the lock, has nothing that keeps the tabs apart, and nothing in
 * storage can stand in for it: a tab does not see what another tab is writing
 * until its own run of work is over, so reading a value back proves nothing
 * about the other tabs. (Tried in a real browser with the lock taken away,
 * two tabs pressing at once were both paid most of the time.) So there:
 *
 * - No daily bonus is paid at all, and the page says so. Nothing can be paid
 *   twice that is never paid.
 * - The records are still kept, by the same transactions run with no lock. A
 *   count can be lost when two tabs write in the same instant: the later
 *   write does not have the earlier one's medals in it. Nothing is ever
 *   counted that did not happen, and a tab that finds storage has lost
 *   something it wrote writes it again.
 *
 * The account. A player who is signed in has the book on their account too,
 * and `account.ts` keeps the two copies in step, as it does the machine's.
 * The book's own rule is that neither copy ever wins: what each device has
 * counted is in a row of its own, so the two are joined (`mergeBooks`), and
 * the joined book is what stays here and what is sent. Around that:
 *
 * - Each player's book has a key of its own on this device, a guest's and
 *   each account's (`bookKey`), and only the transactions above write there.
 *   The keeper has a slot of its own for an account's book, where it writes
 *   what it knows of the account's copy beside a copy of the text. It writes
 *   that without waiting for the lock, as a player signs out and as a copy
 *   is sent, so it is never the book the tabs go by: it is joined into the
 *   book whenever that player's book is opened.
 * - The first time an account is met on this device, the guest's book is
 *   joined with whatever the account holds and becomes that account's. It is
 *   moved, not copied: it leaves the guest's key, so that it cannot become a
 *   second account's as well.
 * - The book goes to the account far less often than the machine does: at
 *   once when a stamp is earned, the bonus taken or the records cleared, at
 *   most every five minutes otherwise, and when the page is hidden or the
 *   cabinet left.
 * - It is never sent blind. The account keeps one copy and takes whatever it
 *   is sent, so a device that wrote what it had would wipe out what another
 *   device had written since it last read: a day's bonus taken there, which
 *   this device, or a third, would then pay again. So every write reads the
 *   account first and sends the two joined (`joining`), and nothing is sent
 *   in the way that outlives the page, which cannot read first. A page that
 *   is closed with something unsent keeps it on this device, and sends it the
 *   next time the game is opened here.
 * - Before a day's bonus is paid to a player whose account has been reached,
 *   the account is asked once more for its book, and the day is paid only if
 *   it has not been taken there either. When the account does not answer,
 *   the day is paid from what this device knows. So a player with two
 *   devices, one of them with no network, can take a day's bonus on each:
 *   the books are joined later and show the day taken once and two bonuses
 *   counted. That is accepted; nothing but a server that decides could
 *   prevent it.
 * - Clearing the records is a new era of the book, and a book of a later era
 *   wins a joining, so a clearing reaches the account and, through it, the
 *   player's other devices.
 */

import { useSyncExternalStore } from 'react';
import {
  GUEST,
  createSync,
  fromCloud,
  toCloud,
  type AccountStore,
  type Kept,
  type Player,
  type Slots,
  type Standing,
  type Status,
  type Sync,
  type Verdict,
} from './account';
import {
  RECORDS_KEY,
  cardFor,
  clearBook,
  countBonus,
  createBook,
  dayFrom,
  hasDay,
  mergeBooks,
  newStamps,
  parseBook,
  rebase,
  record,
  serializeBook,
  spendDay,
  stamp,
  type AchievementId,
  type Day,
  type RecordBook,
  type RecordEvent,
} from './records';
import { newMark } from './savedMachine';
import { type Session, type SessionEvent } from './session';
import { playSound } from './sounds';

/**
 * How often the book is written while it has something new in it, in seconds.
 * A bonus, a stamp and a clearing are written as they happen. A write waits
 * its turn for the lock, so a page that is closed may not get to make its
 * last one: this is the most play that can go unwritten.
 */
export const SAVE_EVERY = 2;
/** The name of the lock the tabs share. */
export const RECORDS_LOCK = 'medal-pusher-records';
/** How many times a day's stamp is written again when reading it back does not show it. */
export const WRITE_TRIES = 3;

/** The key the book has among a player's saves on the account. */
export const RECORDS_GAME_KEY = 'medal-pusher-records';
/**
 * How often a book that has changed goes to the account, in seconds. Nearly
 * every medal changes it, and each write costs the server a document written,
 * an entry in the activity log and two functions run: so five minutes, where
 * the machine has one. A stamp, a bonus and a clearing do not wait for it.
 */
export const BOOK_SEND_EVERY = 300;
/** How often the account's keeper is shown the book, in seconds: that is when it sends what is due, and asks again for an account it could not reach. */
export const BOOK_LOOK_EVERY = 10;
/** How long a press on the bonus waits to hear from the account, in seconds, before the day is paid from what this device knows. */
export const ASK_SECONDS = 4;
/** How long what the account has just said is taken to be what it holds, in milliseconds: a write made within it does not ask again first. */
export const HEARD_FOR = 2000;

/**
 * Where a player's book is kept on this device: a guest's under the book's
 * own name, and each account's under a name of its own. (The keeper's slot
 * for an account, `medal-pusher-records:` and the account, is another thing:
 * see the top of the file.)
 */
export const bookKey = (uid: string | null): string => (uid === null ? RECORDS_KEY : `medal-pusher-book:${uid}`);

/** What two copies of a book have in common when they hold the same things, whichever device each is kept on. */
export function printOf(text: string): string {
  const book = parseBook(text);
  return book ? serializeBook({ ...book, device: '' }) : text;
}

/**
 * Which copy wins when the account's has been read: neither. They are joined,
 * and the joined book is put on this device and, if the account lacks any of
 * it, sent.
 *
 * - The account's copy cannot be read here: hold. It is left as it is.
 * - The account has none: this device's book becomes the account's, and is
 *   sent unless there is nothing in it.
 * - Otherwise the two are joined, as this device's book. It is sent when it
 *   holds something the account's copy does not.
 *
 * This device's book is the one it keeps for the account or, when it keeps
 * none, the guest's book on the table: `fromGuest` then says that the guest's
 * book has gone into the account's. `name` makes up a device's name, for the
 * one case with no book here at all.
 */
export function settleBooks({ account, device, guest }: Standing, name: () => string): { verdict: Verdict; fromGuest: boolean } {
  if (account.kind === 'unreadable') return { verdict: { kind: 'hold' }, fromGuest: false };
  const mine = device ? device.text : guest;
  const here = mine === null ? null : parseBook(mine);
  const fromGuest = !device && here !== null;
  if (account.kind === 'none') {
    // With nothing on the table there is nothing to send, and nothing is touched.
    if (!here) return { verdict: { kind: 'adopt' }, fromGuest: false };
    // A book with nothing in it yet is not worth a document on the account: it is sent once there is something to say.
    const text = serializeBook(here);
    return { verdict: { kind: 'take', text, send: printOf(text) !== printOf(serializeBook(createBook(here.device))) }, fromGuest };
  }
  const theirs = parseBook(account.text);
  if (!theirs) return { verdict: { kind: 'hold' }, fromGuest: false };
  // A book is never taken under another device's name: two devices counting into one row would each lose the other's count.
  const merged = serializeBook(mergeBooks(here ?? createBook(name()), theirs));
  return { verdict: { kind: 'take', text: merged, send: printOf(merged) !== printOf(account.text) }, fromGuest };
}

/**
 * A transaction, as steps: it stops before each read and each write of
 * storage. The browser takes the steps straight through. The tests take them
 * one at a time, a step of this tab and then a step of that one, in every
 * order that tabs running side by side could fall into.
 */
export type Steps<T = void> = Generator<void, T, void>;

/** What the store needs of the world around it. The browser's are below; the tests bring their own. */
export interface RecordsEnv {
  /** What storage holds under a name, or null when it holds nothing. Throws when storage is blocked. */
  read: (key: string) => string | null;
  /** Stores a text under a name. Throws when storage is blocked or full. */
  write: (key: string, text: string) => void;
  /** Takes away what storage holds under a name. Throws when storage is blocked. */
  remove: (key: string) => void;
  /** Today on the player's own calendar. */
  today: () => Day;
  /** A name for this device, made up at random. */
  device: () => string;
  /** This device's clock in milliseconds, and a mark for each copy sent to the account: any text no other copy will carry. */
  now: () => number;
  mark: () => string;
  /**
   * Starts calling `tick` once a second, `changed` when another tab has
   * written to storage (with the name it wrote under, when that is known),
   * and `leaving` when the page is hidden or left. Returns what stops it.
   */
  watch: (handlers: { tick: () => void; changed: (key?: string | null) => void; leaving: () => void }) => () => void;
  /** Whether this browser can keep its tabs apart at all: whether it has Web Locks. */
  apart: () => boolean;
  /**
   * Runs `task` while no other tab is running one, telling it that it is
   * `alone`, and lets the next one go when the task calls `release`. Where
   * the browser cannot keep the tabs apart, or will not, the task is run all
   * the same and told that it is not alone.
   */
  lock: (task: (alone: boolean, release: () => void) => void) => void;
  /** Takes a transaction through its steps, and calls `done` when it has taken the last. */
  drive: (steps: Steps, done: () => void) => void;
}

export interface RecordsState {
  /** The book, or null until the browser's copy has been read. */
  book: RecordBook | null;
  /** Today on the player's calendar. Null until then, too. */
  day: Day | null;
  /** Whether this browser keeps the book. Where it cannot, there is no daily bonus: nothing would remember that a day had been paid. */
  kept: boolean;
  /** Whether a machine is there to pay a bonus into. */
  purse: boolean;
  /** Whether this browser keeps its tabs apart. Where it cannot, there is no daily bonus either: two tabs could each pay the same day. */
  apart: boolean;
  /** Where else the book is kept: nowhere (a guest's), on the account, or on an account that has not been reached, cannot be read, or is still being asked. */
  where: Status['where'];
  /** Whether a press on the bonus is waiting to hear from the account. */
  asking: boolean;
  /** Stamps earned on this page and not yet shown, the earliest first. */
  fresh: readonly AchievementId[];
  /** How many bonuses have been taken on this page, and the medals the last of them paid. What plays the stamp's ceremony looks at these. */
  claims: number;
  paid: number;
}

/** The state before anything has been read, and on the server. */
export const WAITING: RecordsState = { book: null, day: null, kept: true, purse: false, apart: true, where: 'device', asking: false, fresh: [], claims: 0, paid: 0 };

/** The local calendar day of a moment on the player's clock. */
export const localDay = (moment: Date): Day => dayFrom(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());

const DEVICE_LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A device's name: ten letters and digits, from random numbers in [0, 1). */
export const deviceName = (random: () => number): string =>
  Array.from({ length: 10 }, () => DEVICE_LETTERS[Math.min(DEVICE_LETTERS.length - 1, Math.floor(random() * DEVICE_LETTERS.length))]).join('');

/** Takes steps straight through to the last. */
export function finish<T>(steps: Steps<T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * One player's book on the table. A transaction works on the book it was
 * asked for, so one that gets its turn after another player has sat down
 * still writes the first player's book under the first player's key.
 */
interface Desk {
  /** Whose book it is: an account's id, or null for a guest's. */
  owner: string | null;
  key: string;
  /** The book as it is now, which the page is shown a second or so behind. */
  book: RecordBook;
  /** The book as storage last had it, when this page last read or wrote, with whatever has come from the account since. */
  base: RecordBook;
  /** Whether the book holds something storage does not. */
  unsaved: boolean;
  /** Whether storage was found to have lost something this page had already written, so that it has to be written again without waiting. */
  repair: boolean;
  /** Whether a write is already waiting its turn. */
  saving: boolean;
  /** Whether this is a guest's book that has become the account's, and has still to leave the guest's key. */
  moved: boolean;
}

export type Records = ReturnType<typeof createRecords>;

export function createRecords(env: RecordsEnv) {
  let state = WAITING;
  /** Whether anything on the page is listening. The book is kept in hand after the last listener has left, until what it has not written is written. */
  let started = false;
  /** The book on the table. */
  let desk: Desk | null = null;
  /** Whether the book holds something the page has not been shown. */
  let unshown = false;
  let ticks = 0;
  let sound = false;
  let pay: ((medals: number) => boolean) | null = null;
  let unwatch: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** What each machine's own counters stood at when the book last looked. */
  const seen = new WeakMap<Session, { inserted: number; refills: number }>();

  /** Who is playing, and their accounts' store: null where the page has none, and every book is then a guest's. */
  let wanted: Player = GUEST;
  let accounts: AccountStore | null = null;
  /** What keeps the book in step with the account, while the page is listening and there is a store. */
  let sync: Sync | null = null;
  let where: Status['where'] = 'device';
  /** Whether the copy the keeper is about to hand over has the guest's book in it. */
  let moving = false;
  /** A press on the bonus that is waiting to hear from the account, and the tick at which it stops waiting. */
  let asking: { at: Desk; until: number } | null = null;
  /** When the account's copy was last read and joined into the book here, by this device's clock. */
  let heardAt = Number.NEGATIVE_INFINITY;

  /** Shows the page the book as it is now, with whatever else has changed. */
  const publish = (changes: Partial<RecordsState> = {}): void => {
    if (!started) return;
    state = { ...state, ...changes, book: desk ? desk.book : null, where, asking: asking !== null };
    unshown = false;
    for (const listener of [...listeners]) listener();
  };

  /** Notes what a write has shown: that the browser keeps the book after all, or does not. The page is told with the next thing it is shown. */
  const keeps = (kept: boolean): void => {
    if (!started || kept === state.kept) return;
    state = { ...state, kept };
    unshown = true;
  };

  /** Rings for stamps that have just been earned and queues them to be shown. A stamp does not wait five minutes to reach the account. */
  const announce = (earned: readonly AchievementId[]): readonly AchievementId[] => {
    if (earned.length === 0) return state.fresh;
    playSound('gate', sound);
    sync?.save('moment');
    return [...state.fresh, ...earned.filter((id) => !state.fresh.includes(id))];
  };

  /** One read of storage: the text under a name, null when there is none, undefined when storage cannot be read. */
  function* get(key: string): Steps<string | null | undefined> {
    yield;
    try {
      return env.read(key);
    } catch {
      return undefined;
    }
  }

  /** One write to storage. Returns whether it took. */
  function* put(key: string, text: string): Steps<boolean> {
    yield;
    try {
      env.write(key, text);
      return true;
    } catch {
      return false;
    }
  }

  /** Takes one name out of storage. Returns whether it did. */
  function* drop(key: string): Steps<boolean> {
    yield;
    try {
      env.remove(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Joins a copy of the book from somewhere else into a desk's: the account's
   * copy, or the keeper's. Returns the stamps that only the two together have
   * earned. What comes in is not this page's own counting, so it is added to
   * what storage is taken to hold as well: a transaction then adds to storage
   * only what this page has counted itself, and writes the rest for being
   * missing there.
   */
  const join = (at: Desk, theirs: RecordBook, day: Day): AchievementId[] => {
    const joined = mergeBooks(at.book, theirs);
    at.base = mergeBooks(at.base, theirs);
    const stamped = stamp(joined, day);
    if (serializeBook(stamped) === serializeBook(at.book)) return [];
    at.book = stamped;
    at.unsaved = true;
    if (at === desk) unshown = true;
    return newStamps(joined, stamped);
  };

  /**
   * Takes in what storage holds now, without writing: what another tab has
   * counted and stamped, and the days it has taken. Returns the stamps that
   * only the two together have earned.
   *
   * Storage can turn out to have lost something it held when this page last
   * looked: a day, a stamp, a count. That is what a write made over this
   * page's own leaves behind, where nothing keeps the tabs apart. The book
   * here still has it, and is marked to be written again at once.
   */
  function* adopt(at: Desk, day: Day): Steps<AchievementId[]> {
    const text = yield* get(at.key);
    if (text === undefined) return [];
    const stored = parseBook(text);
    if (!stored) {
      at.unsaved = true;
      at.repair = true;
      return [];
    }
    if (serializeBook(mergeBooks(stored, at.base)) !== serializeBook(stored)) {
      at.unsaved = true;
      at.repair = true;
    }
    const joined = rebase(stored, at.book, at.base);
    const stamped = stamp(joined, day);
    at.base = stored;
    if (stamped !== joined) at.unsaved = true;
    // Most times storage holds nothing this page does not: the book is then the very one it was.
    if (serializeBook(stamped) !== serializeBook(at.book)) {
      at.book = stamped;
      if (at === desk) unshown = true;
    }
    return newStamps(joined, stamped);
  }

  /** Writes a desk's book on top of whatever storage holds now. Gives the stamps the joining earned, or null when the write did not take. */
  function* write(at: Desk, day: Day): Steps<AchievementId[] | null> {
    const earned = yield* adopt(at, day);
    const written = at.book;
    if (!(yield* put(at.key, serializeBook(written)))) {
      if (at === desk) keeps(false);
      return null;
    }
    // What storage has now is the book as it was when it was written out. Anything counted since is still to write.
    at.base = written;
    if (at.book === written) {
      at.unsaved = false;
      at.repair = false;
    }
    if (at === desk) keeps(true);
    // A guest's book that has become this account's is safely under the account's key now: it leaves the guest's.
    if (at.moved && at.owner !== null && (yield* drop(bookKey(null)))) at.moved = false;
    return earned;
  }

  /** Runs a transaction: under the lock the tabs share, where the browser has one. The transaction is told whether it has it. */
  const transact = (task: (alone: boolean) => Steps): void => env.lock((alone, release) => env.drive(task(alone), release));

  /** Writes a desk's book when its turn for the lock comes. One write waits at a time: whatever is new by then goes with it. */
  const saveSoon = (at: Desk): void => {
    if (at.saving) return;
    at.saving = true;
    transact(function* () {
      at.saving = false;
      const day = env.today();
      const earned = (yield* write(at, day)) ?? [];
      if (at === desk && (unshown || earned.length > 0)) publish({ day, fresh: announce(earned) });
    });
  };

  /**
   * Puts a player's book on the table: what this device keeps for them, with
   * the copy the keeper has handed over joined into it. A book of theirs that
   * is still in hand keeps what it had not written yet. Returns whether
   * storage could be read, and the stamps the joining earned.
   */
  const seat = (text: string | null, owner: string | null, moved: boolean, day: Day): { readable: boolean; earned: AchievementId[] } => {
    const key = bookKey(owner);
    let read: string | null | undefined;
    try {
      read = env.read(key);
    } catch {
      read = undefined;
    }
    const stored = typeof read === 'string' ? parseBook(read) : null;
    const given = text === null ? null : parseBook(text);
    const had = desk && desk.owner === owner ? desk : null;
    const book = had ? (stored ? rebase(stored, had.book, had.base) : had.book) : (stored ?? given ?? createBook(env.device()));
    const at: Desk = had ?? { owner, key, book, base: book, unsaved: false, repair: false, saving: false, moved: false };
    at.book = book;
    at.base = stored ?? book;
    at.moved ||= moved && owner !== null;
    const earned = given ? join(at, given, day) : [];
    at.unsaved = at.moved || !stored || serializeBook(at.book) !== serializeBook({ ...stored, device: at.book.device });
    desk = at;
    return { readable: read !== undefined, earned };
  };

  /** A text of the book as it is, kept so that it is not written out again for every question about one book. */
  let printed: { book: RecordBook; text: string } | null = null;
  const kept: Kept = {
    slot: RECORDS_KEY,
    current() {
      if (!desk) return null;
      if (printed?.book !== desk.book) printed = { book: desk.book, text: serializeBook(desk.book) };
      return printed.text;
    },
    reads: (text) => parseBook(text) !== null,
    print: printOf,
    settle(standing) {
      const { verdict, fromGuest } = settleBooks(standing, env.device);
      moving = fromGuest;
      // What the account holds is in the verdict's book, unless it could not be read.
      if (verdict.kind !== 'hold') heardAt = env.now();
      return verdict;
    },
    reopen: () => reopen(),
  };

  /**
   * Storage, as the keeper is given it. A guest's book has one home, the key
   * the transactions write: the keeper reads it there and is not let write
   * it. Everything else it keeps, an account's copy and whose account was
   * here last, is its own.
   */
  const slots: Slots = {
    getItem: (key) => env.read(key),
    setItem: (key, value) => {
      if (key !== RECORDS_KEY) env.write(key, value);
    },
    removeItem: (key) => {
      if (key !== RECORDS_KEY) env.remove(key);
    },
  };

  /**
   * The account has said what it holds, in answer to something other than
   * the keeper's first question. It is joined into that player's book here.
   */
  const hears = (uid: string, theirs: RecordBook): void => {
    const at = desk;
    if (!at || at.owner !== uid) return;
    const earned = join(at, theirs, env.today());
    if (at.unsaved) saveSoon(at);
    if (started && (unshown || earned.length > 0)) publish({ fresh: announce(earned) });
  };

  /**
   * The account's store as the keeper is given it: one that never writes
   * blind. A write first reads what the account holds now and sends the two
   * joined, under the mark the keeper gave it, and what was read is joined
   * into the book here as well. When the account turns out to hold all of it
   * already, nothing is written. A copy there that cannot be read, put there
   * since this page first asked, is not written over: the write fails, as an
   * account that cannot be reached does.
   *
   * Nothing is sent in the way that outlives the page, since that cannot
   * read first; so nothing has to be got ready for it either, and the book
   * asks for the player's token only when it reads or writes.
   */
  const joining = (store: AccountStore): AccountStore => ({
    load: (uid) => store.load(uid),
    async store(uid, state) {
      const sending = fromCloud(state);
      const mine = sending ? parseBook(sending.text) : null;
      // What the account said a moment ago, with this very book made from it, is not asked for again.
      if (!sending || !mine || env.now() - heardAt < HEARD_FOR) return store.store(uid, state);
      const found = await store.load(uid);
      if (!found) return store.store(uid, state);
      const got = fromCloud(found.state);
      const theirs = got ? parseBook(got.text) : null;
      if (!got || !theirs) throw new Error('The account holds a copy this page cannot read');
      heardAt = env.now();
      const merged = serializeBook(mergeBooks(mine, theirs));
      const news = printOf(merged) !== printOf(sending.text);
      if (news) hears(uid, theirs);
      if (printOf(merged) === printOf(got.text)) return undefined;
      const changedAt = (state as { changedAt?: unknown }).changedAt;
      const joined = news ? toCloud(merged, sending.mark ?? env.mark(), typeof changedAt === 'number' ? changedAt : env.now()) : null;
      return store.store(uid, joined ?? state);
    },
    prepare: () => Promise.resolve(),
    storeNow: () => null,
    forget: (uid) => store.forget(uid),
  });

  const keeper = (store: AccountStore): Sync =>
    createSync({
      kept,
      store: joining(store),
      slots: () => slots,
      now: env.now,
      mark: env.mark,
      every: BOOK_SEND_EVERY,
      onStatus: (status) => {
        where = status.where;
        if (started && state.where !== where) publish();
      },
    });

  /**
   * The keeper has another book to open: another player's, or this player's
   * joined with the account's. The book that leaves the table, if it is not
   * this player's, is written under its own key when its turn comes; a
   * guest's that has gone into the account's is not, since all of it is in
   * the book that takes its place.
   */
  function reopen(): void {
    if (!sync) return;
    const was = desk;
    const carried = moving;
    moving = false;
    const text = sync.open();
    const owner = sync.owner();
    if (!started) return;
    const other = !was || was.owner !== owner;
    if (was && other) {
      if (carried) was.unsaved = false;
      else if (was.unsaved) saveSoon(was);
      // Nothing of the player who has left is shown to the next, and a bonus they were waiting on is not paid.
      asking = null;
      state = { ...state, fresh: [] };
    }
    const day = env.today();
    const { readable, earned } = seat(text, owner, carried, day);
    keeps(readable);
    if (desk?.unsaved && readable) saveSoon(desk);
    publish({ day, fresh: announce(earned) });
    // The keeper sees the book as it now is, and sends it if the account lacks any of it.
    sync.save('tick');
  }

  const tick = (): void => {
    if (!started || !desk) return;
    ticks += 1;
    const day = env.today();
    if (day !== state.day || unshown) publish({ day });
    if (desk.unsaved && ticks % SAVE_EVERY === 0) saveSoon(desk);
    // An account that could not be reached is tried again as soon as its wait is over, not at the book's five minutes.
    if (ticks % BOOK_LOOK_EVERY === 0) sync?.save(where === 'offline' ? 'moment' : 'tick');
    if (asking && ticks >= asking.until) {
      // The account has not answered in time: the day is paid from what this device knows.
      asking = null;
      pays();
    }
  };

  const start = (): void => {
    const day = env.today();
    sync = accounts ? keeper(accounts) : null;
    sync?.player(wanted);
    const { readable, earned } = seat(sync ? sync.open() : null, sync ? sync.owner() : null, false, day);
    started = true;
    unshown = false;
    ticks = 0;
    state = { ...WAITING, day, kept: readable, purse: pay !== null, apart: env.apart() };
    unwatch = env.watch({
      tick,
      // Another tab has written. Reading what it wrote is one read and needs no turn; writing, if this page has more, does.
      changed: (key) => {
        const at = desk;
        if (!started || !at || (typeof key === 'string' && key !== at.key)) return;
        const today = env.today();
        const joined = finish(adopt(at, today));
        if (unshown || joined.length > 0) publish({ day: today, fresh: announce(joined) });
        // What this page has counted since it last wrote waits for the timer, so that two tabs do not answer each
        // other's every write with one of their own. Something storage has lost is put back now.
        if (at.repair) saveSoon(at);
      },
      leaving: () => {
        if (desk?.unsaved) saveSoon(desk);
        // The account is sent what it has not had, if the page lives long enough to read it first. See the top of the file.
        sync?.save('moment');
      },
    });
    // A book that is new is written at once, which also finds out whether this browser keeps one at all.
    if (desk?.unsaved && readable) saveSoon(desk);
    publish({ fresh: announce(earned) });
  };

  const end = (): void => {
    if (desk?.unsaved) saveSoon(desk);
    // The cabinet is left and the page is not: what is unsent goes now, and is heard of or not after the keeper is closed.
    sync?.save('moment');
    sync?.close();
    sync = null;
    where = 'device';
    moving = false;
    asking = null;
    unwatch?.();
    unwatch = null;
    started = false;
    state = WAITING;
  };

  /**
   * Takes today's bonus, if there is one to take and a machine to pay it
   * into. It is a transaction, and it pays only when it holds the lock, so
   * that no other tab is anywhere in these steps at the same time:
   *
   * 1. What storage holds is taken in and the book is written. A browser
   *    that will not take the write pays no bonus.
   * 2. The card is looked at. If today's stamp is on it already, from this
   *    tab, another, or another device by way of the account, there is
   *    nothing to take.
   * 3. The day is stamped in the book, the book is written, and it is read
   *    back out of storage. Only a day that is there to be read is paid.
   * 4. The medals are paid, and only then counted as bonus medals.
   *
   * What the page is shown says how it went: `claims` and `paid`.
   */
  function pays(): void {
    transact(function* (alone) {
      const at = desk;
      if (!started || !at || !pay) {
        publish();
        return;
      }
      if (!alone) {
        // Nothing keeps another tab out of these steps, so nothing is paid. The page stops offering it.
        publish({ apart: false });
        return;
      }
      const day = env.today();
      /** The stamps earned along the way: by what storage brought in, by the day, and by the bonus. */
      const earned: AchievementId[] = [];
      const first = yield* write(at, day);
      if (first === null) {
        publish({ day });
        return;
      }
      earned.push(...first);
      const card = cardFor(at.book, day);
      if (card.state !== 'ready') {
        publish({ day, fresh: announce(earned) });
        return;
      }
      at.book = spendDay(at.book, day);
      at.unsaved = true;
      let written = false;
      for (let attempt = 0; !written && attempt < WRITE_TRIES; attempt++) {
        const again = yield* write(at, day);
        if (again === null) break;
        earned.push(...again);
        const back = yield* get(at.key);
        written = typeof back === 'string' && hasDay(parseBook(back)?.claimed ?? {}, day);
      }
      if (!written || at !== desk) {
        // The day could not be written down where it could be read again. It stays stamped here, and no medals go with it.
        publish({ day, fresh: announce(earned) });
        return;
      }
      if (!pay || !pay(card.medals)) {
        publish({ day, fresh: announce(earned) });
        return;
      }
      const before = at.book;
      at.book = countBonus(before, card.medals, day);
      earned.push(...newStamps(before, at.book));
      at.unsaved = true;
      earned.push(...((yield* write(at, day)) ?? []));
      // The stamp comes down on the card.
      playSound('reelStop', sound);
      publish({ day, claims: state.claims + 1, paid: card.medals, fresh: announce(earned) });
      // A day that has been taken does not wait five minutes to reach the account.
      sync?.save('moment');
    });
  }

  return {
    getState: (): RecordsState => state,

    /** Listens for changes. The book is read when the first listener arrives and put away when the last one leaves. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (listeners.delete(listener) && listeners.size === 0) end();
      };
    },

    /**
     * Says who is playing, and where their account is kept. A page that is
     * already listening changes books at once when that changes whose book
     * is on the table; one that is not opens the right book when it starts.
     */
    attend(player: Player, store: AccountStore | null = null): void {
      wanted = store ? player : GUEST;
      if (store === accounts) {
        sync?.player(wanted);
        return;
      }
      accounts = store;
      if (!started) return;
      // Another store, which the page never does to itself: the keeper is made again around it, and says whose book to open.
      sync?.close();
      sync = store ? keeper(store) : null;
      sync?.player(wanted);
      if (sync) reopen();
    },

    /**
     * Hears what a machine did in one frame. Besides its events, two things
     * are read off the machine's own counters, because no event says them:
     * medals fed, and refills taken. A machine is only looked at the first
     * time it is seen, so nothing it did before, in the save it was restored
     * from, is counted again.
     */
    note(session: Session, events: readonly SessionEvent[]): void {
      const was = seen.get(session);
      if (!was) {
        seen.set(session, { inserted: session.inserted, refills: session.refills });
        return;
      }
      const fed = session.inserted - was.inserted;
      const refills = session.refills - was.refills;
      was.inserted = session.inserted;
      was.refills = session.refills;
      if (!started || !desk || !state.day) return;
      let all: readonly RecordEvent[] = events;
      if (fed > 0 || refills > 0) {
        const extra: RecordEvent[] = [];
        if (fed > 0) extra.push({ type: 'fed', count: fed });
        if (refills > 0) extra.push({ type: 'refill', count: refills });
        all = [...events, ...extra];
      }
      if (all.length === 0) return;
      const next = record(desk.book, all, state.day);
      if (next === desk.book) return;
      const earned = newStamps(desk.book, next);
      desk.book = next;
      desk.unsaved = true;
      unshown = true;
      if (earned.length === 0) return;
      // A stamp is shown at once, and written as soon as the lock is this tab's.
      publish({ fresh: announce(earned) });
      saveSoon(desk);
    },

    /**
     * Gives the store the machine's purse: what pays medals into it, and says
     * whether it did. Returns what takes the purse away again.
     */
    openPurse(into: (medals: number) => boolean): () => void {
      pay = into;
      if (desk) publish({ purse: true });
      return () => {
        if (pay !== into) return;
        pay = null;
        if (desk) publish({ purse: false });
      };
    },

    /**
     * Takes today's bonus: see `pays`. A player whose account has been
     * reached has the account asked first, since another device may have
     * taken the day since this page last heard: its book is joined into this
     * one, and the day is paid only if it is still to take. An account that
     * fails to answer, or takes longer than `ASK_SECONDS`, is not waited for.
     */
    claimBonus(): void {
      const at = desk;
      if (!started || !at || !pay || asking) return;
      const uid = wanted.uid;
      if (!accounts || uid === null || at.owner !== uid || where !== 'account') {
        pays();
        return;
      }
      const mine = (asking = { at, until: ticks + ASK_SECONDS });
      publish();
      const heard = (theirs: RecordBook | null): void => {
        const waited = asking === mine;
        if (waited) asking = null;
        // An answer that comes too late to be waited for is still what the account holds.
        if (theirs && started && desk === mine.at) {
          const earned = join(mine.at, theirs, env.today());
          if (earned.length > 0 || !waited) publish({ fresh: announce(earned) });
        }
        if (waited) pays();
      };
      let reading: ReturnType<AccountStore['load']>;
      try {
        reading = accounts.load(uid);
      } catch {
        heard(null);
        return;
      }
      reading.then(
        (found) => {
          const text = found ? fromCloud(found.state)?.text : null;
          const theirs = typeof text === 'string' ? parseBook(text) : null;
          // The account has answered, with a book or with none: the write that follows a bonus need not ask again.
          if (theirs || !found) heardAt = env.now();
          heard(theirs);
        },
        () => heard(null),
      );
    },

    /** A stamp's toast has been shown: it leaves the queue. */
    shown(id: AchievementId): void {
      if (state.fresh.includes(id)) publish({ fresh: state.fresh.filter((other) => other !== id) });
    },

    /**
     * Clears the records, here and in storage, and for a player who is signed
     * in on their account too: the cleared book is a new era, which wins when
     * it is joined with the account's and, from there, with the book on each
     * of the player's other devices. The days the bonus was taken stay.
     */
    clearRecords(): void {
      transact(function* () {
        const at = desk;
        if (!started || !at) return;
        const day = env.today();
        yield* adopt(at, day);
        at.book = clearBook(at.book);
        at.unsaved = true;
        yield* write(at, day);
        if (at !== desk) return;
        publish({ day, fresh: [] });
        sync?.save('moment');
      });
    },

    /** Whether the cabinet's sound is on, for the stamp and the chime. */
    setSound(on: boolean): void {
      sound = on;
    },

    /** The book as text, for keeping a copy somewhere else: null until it has been read. */
    exportBook: (): string | null => (started ? kept.current() : null),

    /**
     * Joins a copy of the book from somewhere else, an account's or another
     * device's, into this one. Returns whether the text was a book.
     */
    absorb(text: string): boolean {
      const theirs = parseBook(text);
      const at = desk;
      if (!started || !at || !theirs) return false;
      transact(function* () {
        if (!started || at !== desk) return;
        const day = env.today();
        const earned = join(at, theirs, day);
        const more = (yield* write(at, day)) ?? [];
        publish({ day, fresh: announce([...earned, ...more]) });
      });
      return true;
    },
  };
}

/** The browser, as the store needs it. Nothing here runs until the store is listened to, which is never on the server. */
const browser: RecordsEnv = {
  read: (key) => window.localStorage.getItem(key),
  write: (key, text) => window.localStorage.setItem(key, text),
  remove: (key) => window.localStorage.removeItem(key),
  today: () => localDay(new Date()),
  device: () => {
    try {
      const numbers = window.crypto.getRandomValues(new Uint32Array(10));
      let next = 0;
      return deviceName(() => numbers[next++] / 2 ** 32);
    } catch {
      return deviceName(Math.random);
    }
  },
  now: () => Date.now(),
  mark: newMark,
  watch: ({ tick, changed, leaving }) => {
    const timer = window.setInterval(tick, 1000);
    const onStorage = (event: StorageEvent) => changed(event.key);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leaving();
      else tick();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', leaving);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', leaving);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },
  apart: () => typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function',
  lock: (task) => {
    // No Web Locks here (Safari before 15.4), or the browser will not grant one: the task runs beside whatever
    // another tab is doing, and is told so. The top of this file says what that costs and what it is not let do.
    const beside = () => task(false, () => undefined);
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks || typeof locks.request !== 'function') return beside();
    let begun = false;
    try {
      locks
        .request(RECORDS_LOCK, () => {
          begun = true;
          // The lock is held until the task says it is done.
          return new Promise<void>((release) => task(true, release));
        })
        .catch(() => {
          if (!begun) beside();
        });
    } catch {
      if (!begun) beside();
    }
  },
  drive: (steps, done) => {
    try {
      finish(steps);
    } finally {
      done();
    }
  },
};

/** The page's one record book. */
export const records = createRecords(browser);

const waiting = (): RecordsState => WAITING;
/** The record book as the page shows it: `WAITING` on the server and in the first drawing, the browser's book after. */
export const useRecords = (): RecordsState => useSyncExternalStore(records.subscribe, records.getState, waiting);
