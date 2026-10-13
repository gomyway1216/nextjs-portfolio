'use client';

/**
 * The record book in the browser: where `records.ts`, which is only
 * arithmetic, meets the things it must not touch itself. This reads the
 * player's clock for the day, keeps the book in the browser's storage, hears
 * from the cabinet what the machine did, and pays the day's bonus into the
 * machine's purse.
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
 */

import { useSyncExternalStore } from 'react';
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
  /** Today on the player's own calendar. */
  today: () => Day;
  /** A name for this device, made up at random. */
  device: () => string;
  /**
   * Starts calling `tick` once a second, `changed` when another tab has
   * written the book, and `leaving` when the page is hidden or left. Returns
   * what stops it.
   */
  watch: (handlers: { tick: () => void; changed: () => void; leaving: () => void }) => () => void;
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
  /** Stamps earned on this page and not yet shown, the earliest first. */
  fresh: readonly AchievementId[];
  /** How many bonuses have been taken on this page, and the medals the last of them paid. What plays the stamp's ceremony looks at these. */
  claims: number;
  paid: number;
}

/** The state before anything has been read, and on the server. */
export const WAITING: RecordsState = { book: null, day: null, kept: true, purse: false, apart: true, fresh: [], claims: 0, paid: 0 };

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

export type Records = ReturnType<typeof createRecords>;

export function createRecords(env: RecordsEnv) {
  let state = WAITING;
  /** Whether anything on the page is listening. The book is kept in hand after the last listener has left, until what it has not written is written. */
  let started = false;
  /** The book as it is now, which the page is shown a second or so behind. */
  let book: RecordBook | null = null;
  /** The book as storage last had it, when this page last read or wrote. */
  let base: RecordBook | null = null;
  /** Whether the book holds something storage does not, and something the page has not been shown. */
  let unsaved = false;
  let unshown = false;
  /** Whether a write is already waiting its turn. */
  let saving = false;
  /** Whether storage was found to have lost something this page had already written, so that it has to be written again without waiting. */
  let repair = false;
  let ticks = 0;
  let sound = false;
  let pay: ((medals: number) => boolean) | null = null;
  let unwatch: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** What each machine's own counters stood at when the book last looked. */
  const seen = new WeakMap<Session, { inserted: number; refills: number }>();

  /** Shows the page the book as it is now, with whatever else has changed. */
  const publish = (changes: Partial<RecordsState> = {}): void => {
    if (!started) return;
    state = { ...state, ...changes, book };
    unshown = false;
    for (const listener of [...listeners]) listener();
  };

  /** Notes what a write has shown: that the browser keeps the book after all, or does not. The page is told with the next thing it is shown. */
  const keeps = (kept: boolean): void => {
    if (!started || kept === state.kept) return;
    state = { ...state, kept };
    unshown = true;
  };

  /** Rings for stamps that have just been earned and queues them to be shown. */
  const announce = (earned: readonly AchievementId[]): readonly AchievementId[] => {
    if (earned.length === 0) return state.fresh;
    playSound('gate', sound);
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
  function* adopt(day: Day): Steps<AchievementId[]> {
    const text = yield* get(RECORDS_KEY);
    if (text === undefined || !book || !base) return [];
    const stored = parseBook(text);
    if (!stored) {
      unsaved = true;
      repair = true;
      return [];
    }
    if (serializeBook(mergeBooks(stored, base)) !== serializeBook(stored)) {
      unsaved = true;
      repair = true;
    }
    const joined = rebase(stored, book, base);
    const stamped = stamp(joined, day);
    base = stored;
    if (stamped !== joined) unsaved = true;
    // Most times storage holds nothing this page does not: the book is then the very one it was.
    if (serializeBook(stamped) !== serializeBook(book)) {
      book = stamped;
      unshown = true;
    }
    return newStamps(joined, stamped);
  }

  /** Writes the book on top of whatever storage holds now. Gives the stamps the joining earned, or null when the write did not take. */
  function* write(day: Day): Steps<AchievementId[] | null> {
    const earned = yield* adopt(day);
    if (!book) return null;
    const written = book;
    if (!(yield* put(RECORDS_KEY, serializeBook(written)))) {
      keeps(false);
      return null;
    }
    // What storage has now is the book as it was when it was written out. Anything counted since is still to write.
    base = written;
    if (book === written) {
      unsaved = false;
      repair = false;
    }
    keeps(true);
    return earned;
  }

  /** Runs a transaction: under the lock the tabs share, where the browser has one. The transaction is told whether it has it. */
  const transact = (task: (alone: boolean) => Steps): void => env.lock((alone, release) => env.drive(task(alone), release));

  /** Writes the book when its turn for the lock comes. One write waits at a time: whatever is new by then goes with it. */
  const saveSoon = (): void => {
    if (saving) return;
    saving = true;
    transact(function* () {
      saving = false;
      if (!book) return;
      const day = env.today();
      const earned = (yield* write(day)) ?? [];
      if (unshown || earned.length > 0) publish({ day, fresh: announce(earned) });
    });
  };

  const tick = (): void => {
    if (!started || !book) return;
    ticks += 1;
    const day = env.today();
    if (day !== state.day || unshown) publish({ day });
    if (unsaved && ticks % SAVE_EVERY === 0) saveSoon();
  };

  const start = (): void => {
    started = true;
    let text: string | null | undefined;
    try {
      text = env.read(RECORDS_KEY);
    } catch {
      text = undefined;
    }
    const stored = text === undefined ? null : parseBook(text);
    // A book still in hand is one this page was showing a moment ago: what it had not written yet is not dropped.
    if (book && base && stored) book = rebase(stored, book, base);
    else if (stored || !book) book = stored ?? createBook(env.device());
    base = stored ?? book;
    unsaved = !stored || serializeBook(book) !== serializeBook({ ...stored, device: book.device });
    unshown = false;
    ticks = 0;
    state = { ...WAITING, day: env.today(), kept: text !== undefined, purse: pay !== null, apart: env.apart() };
    unwatch = env.watch({
      tick,
      // Another tab has written. Reading what it wrote is one read and needs no turn; writing, if this page has more, does.
      changed: () => {
        if (!started || !book) return;
        const day = env.today();
        const earned = finish(adopt(day));
        if (unshown || earned.length > 0) publish({ day, fresh: announce(earned) });
        // What this page has counted since it last wrote waits for the timer, so that two tabs do not answer each
        // other's every write with one of their own. Something storage has lost is put back now.
        if (repair) saveSoon();
      },
      leaving: () => {
        if (unsaved) saveSoon();
      },
    });
    // A book that is new is written at once, which also finds out whether this browser keeps one at all.
    if (unsaved && text !== undefined) saveSoon();
    publish();
  };

  const end = (): void => {
    if (unsaved) saveSoon();
    unwatch?.();
    unwatch = null;
    started = false;
    state = WAITING;
  };

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
      if (!started || !book || !state.day) return;
      let all: readonly RecordEvent[] = events;
      if (fed > 0 || refills > 0) {
        const extra: RecordEvent[] = [];
        if (fed > 0) extra.push({ type: 'fed', count: fed });
        if (refills > 0) extra.push({ type: 'refill', count: refills });
        all = [...events, ...extra];
      }
      if (all.length === 0) return;
      const next = record(book, all, state.day);
      if (next === book) return;
      const earned = newStamps(book, next);
      book = next;
      unsaved = true;
      unshown = true;
      if (earned.length === 0) return;
      // A stamp is shown at once, and written as soon as the lock is this tab's.
      publish({ fresh: announce(earned) });
      saveSoon();
    },

    /**
     * Gives the store the machine's purse: what pays medals into it, and says
     * whether it did. Returns what takes the purse away again.
     */
    openPurse(into: (medals: number) => boolean): () => void {
      pay = into;
      if (book) publish({ purse: true });
      return () => {
        if (pay !== into) return;
        pay = null;
        if (book) publish({ purse: false });
      };
    },

    /**
     * Takes today's bonus, if there is one to take and a machine to pay it
     * into. It is a transaction, and it pays only when it holds the lock, so
     * that no other tab is anywhere in these steps at the same time:
     *
     * 1. What storage holds is taken in and the book is written. A browser
     *    that will not take the write pays no bonus.
     * 2. The card is looked at. If today's stamp is on it already, from this
     *    tab or another, there is nothing to take.
     * 3. The day is stamped in the book, the book is written, and it is read
     *    back out of storage. Only a day that is there to be read is paid.
     * 4. The medals are paid, and only then counted as bonus medals.
     *
     * What the page is shown says how it went: `claims` and `paid`.
     */
    claimBonus(): void {
      transact(function* (alone) {
        if (!started || !book || !pay) return;
        if (!alone) {
          // Nothing keeps another tab out of these steps, so nothing is paid. The page stops offering it.
          publish({ apart: false });
          return;
        }
        const day = env.today();
        /** The stamps earned along the way: by what storage brought in, by the day, and by the bonus. */
        const earned: AchievementId[] = [];
        const first = yield* write(day);
        if (first === null || !book) {
          publish({ day });
          return;
        }
        earned.push(...first);
        const card = cardFor(book, day);
        if (card.state !== 'ready') {
          publish({ day, fresh: announce(earned) });
          return;
        }
        book = spendDay(book, day);
        unsaved = true;
        let written = false;
        for (let attempt = 0; !written && attempt < WRITE_TRIES; attempt++) {
          const again = yield* write(day);
          if (again === null) break;
          earned.push(...again);
          const back = yield* get(RECORDS_KEY);
          written = typeof back === 'string' && hasDay(parseBook(back)?.claimed ?? {}, day);
        }
        if (!written) {
          // The day could not be written down where it could be read again. It stays stamped here, and no medals go with it.
          publish({ day, fresh: announce(earned) });
          return;
        }
        if (!pay || !pay(card.medals) || !book) {
          publish({ day, fresh: announce(earned) });
          return;
        }
        const before = book;
        book = countBonus(before, card.medals, day);
        earned.push(...newStamps(before, book));
        unsaved = true;
        earned.push(...((yield* write(day)) ?? []));
        // The stamp comes down on the card.
        playSound('reelStop', sound);
        publish({ day, claims: state.claims + 1, paid: card.medals, fresh: announce(earned) });
      });
    },

    /** A stamp's toast has been shown: it leaves the queue. */
    shown(id: AchievementId): void {
      if (state.fresh.includes(id)) publish({ fresh: state.fresh.filter((other) => other !== id) });
    },

    /** Clears the records, here and in storage. The days the bonus was taken stay. */
    clearRecords(): void {
      transact(function* () {
        if (!started || !book) return;
        const day = env.today();
        yield* adopt(day);
        if (!book) return;
        book = clearBook(book);
        unsaved = true;
        yield* write(day);
        publish({ day, fresh: [] });
      });
    },

    /** Whether the cabinet's sound is on, for the stamp and the chime. */
    setSound(on: boolean): void {
      sound = on;
    },

    /** The book as text, for keeping a copy somewhere else: null until it has been read. */
    exportBook: (): string | null => (started && book ? serializeBook(book) : null),

    /**
     * Joins a copy of the book from somewhere else, an account's or another
     * device's, into this one. Returns whether the text was a book.
     */
    absorb(text: string): boolean {
      const theirs = parseBook(text);
      if (!started || !book || !theirs) return false;
      transact(function* () {
        if (!started || !book) return;
        const day = env.today();
        const joined = mergeBooks(book, theirs);
        const stamped = stamp(joined, day);
        const earned = newStamps(joined, stamped);
        if (serializeBook(stamped) !== serializeBook(book)) {
          book = stamped;
          unsaved = true;
          unshown = true;
        }
        const more = (yield* write(day)) ?? [];
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
  watch: ({ tick, changed, leaving }) => {
    const timer = window.setInterval(tick, 1000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === RECORDS_KEY) changed();
    };
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
