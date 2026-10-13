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
 * Two tabs of the game share one stored book. Each writes what it has counted
 * since it last looked on top of what is stored now, never over it, and each
 * hears when the other has written. Before a bonus is paid the stored book is
 * read again, so a day one tab has taken is not paid in the other.
 */

import { useSyncExternalStore } from 'react';
import {
  RECORDS_KEY,
  claim,
  clearBook,
  createBook,
  dayFrom,
  mergeBooks,
  newStamps,
  parseBook,
  rebase,
  record,
  serializeBook,
  stamp,
  type AchievementId,
  type Day,
  type RecordBook,
  type RecordEvent,
} from './records';
import { MAX_STOCK, type Session, type SessionEvent } from './session';
import { playSound } from './sounds';

/** How often the book is written while it has something new in it, in seconds. A bonus, a stamp and a clearing are written at once. */
export const SAVE_EVERY = 5;

/** What the store needs of the world around it. The browser's are below; the tests bring their own. */
export interface RecordsEnv {
  /** The stored book as text, or null when there is none. Throws when storage is blocked. */
  read: () => string | null;
  /** Stores the book. Throws when storage is blocked or full. */
  write: (text: string) => void;
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
  /** Stamps earned on this page and not yet shown, the earliest first. */
  fresh: readonly AchievementId[];
  /** How many bonuses have been taken on this page, and the medals the last of them paid. What plays the stamp's ceremony looks at these. */
  claims: number;
  paid: number;
}

/** The state before anything has been read, and on the server. */
export const WAITING: RecordsState = { book: null, day: null, kept: true, purse: false, fresh: [], claims: 0, paid: 0 };

/** The local calendar day of a moment on the player's clock. */
export const localDay = (moment: Date): Day => dayFrom(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());

const DEVICE_LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A device's name: ten letters and digits, from random numbers in [0, 1). */
export const deviceName = (random: () => number): string =>
  Array.from({ length: 10 }, () => DEVICE_LETTERS[Math.min(DEVICE_LETTERS.length - 1, Math.floor(random() * DEVICE_LETTERS.length))]).join('');

export type Records = ReturnType<typeof createRecords>;

export function createRecords(env: RecordsEnv) {
  let state = WAITING;
  /** The book as it is now, which the page is shown a second or so behind. */
  let book: RecordBook | null = null;
  /** The book as storage last had it, when this page last read or wrote. */
  let base: RecordBook | null = null;
  /** Whether the book holds something storage does not, and something the page has not been shown. */
  let unsaved = false;
  let unshown = false;
  let ticks = 0;
  let sound = false;
  let pay: ((medals: number) => boolean) | null = null;
  let unwatch: (() => void) | null = null;
  const listeners = new Set<() => void>();
  /** What each machine's own counters stood at when the book last looked. */
  const seen = new WeakMap<Session, { inserted: number; refills: number; full: boolean }>();

  /** Shows the page the book as it is now, with whatever else has changed. */
  const publish = (changes: Partial<RecordsState> = {}): void => {
    state = { ...state, ...changes, book };
    unshown = false;
    for (const listener of [...listeners]) listener();
  };

  /** Notes what a write has shown: that the browser keeps the book after all, or does not. The page is told with the next thing it is shown. */
  const keeps = (kept: boolean): void => {
    if (kept === state.kept) return;
    state = { ...state, kept };
    unshown = true;
  };

  /**
   * Takes in whatever storage holds now, without writing: what another tab
   * has counted and stamped, and the days it has taken. Returns the stamps
   * that only the two together have earned.
   */
  const adopt = (day: Day): AchievementId[] => {
    if (!book || !base) return [];
    let stored: RecordBook | null;
    try {
      stored = parseBook(env.read());
    } catch {
      return [];
    }
    if (!stored) return [];
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
  };

  /** Writes the book on top of whatever storage holds now. Returns whether it took. */
  const save = (day: Day): AchievementId[] | null => {
    if (!book || !base) return null;
    const earned = adopt(day);
    try {
      env.write(serializeBook(book));
    } catch {
      keeps(false);
      return null;
    }
    base = book;
    unsaved = false;
    keeps(true);
    return earned;
  };

  /** Rings for stamps that have just been earned and queues them to be shown. */
  const announce = (earned: readonly AchievementId[]): readonly AchievementId[] => {
    if (earned.length === 0) return state.fresh;
    playSound('gate', sound);
    return [...state.fresh, ...earned.filter((id) => !state.fresh.includes(id))];
  };

  const tick = (): void => {
    if (!book) return;
    ticks += 1;
    const day = env.today();
    const earned = unsaved && ticks % SAVE_EVERY === 0 ? (save(day) ?? []) : [];
    if (day !== state.day || unshown || earned.length > 0) publish({ day, fresh: announce(earned) });
  };

  const start = (): void => {
    let stored: RecordBook | null = null;
    let kept = true;
    try {
      stored = parseBook(env.read());
    } catch {
      kept = false;
    }
    book = stored ?? createBook(env.device());
    base = book;
    unsaved = false;
    ticks = 0;
    const day = env.today();
    state = { ...WAITING, day, kept, purse: pay !== null };
    // A book that is new is written at once, which also finds out whether this browser keeps one at all.
    if (kept && !stored) save(day);
    unwatch = env.watch({
      tick,
      changed: () => {
        if (!book) return;
        const day = env.today();
        const earned = adopt(day);
        if (unshown || earned.length > 0) publish({ day, fresh: announce(earned) });
      },
      leaving: () => {
        if (unsaved) save(env.today());
      },
    });
    publish();
  };

  const end = (): void => {
    if (unsaved) save(env.today());
    unwatch?.();
    unwatch = null;
    book = null;
    base = null;
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
     * Hears what a machine did in one frame. Besides its events, three things
     * are read off the machine's own counters, because no event says them:
     * medals fed, refills taken, and the hold filling up. A machine is only
     * looked at the first time it is seen, so nothing it did before, in the
     * save it was restored from, is counted again.
     */
    note(session: Session, events: readonly SessionEvent[]): void {
      const was = seen.get(session);
      const full = session.stock >= MAX_STOCK;
      if (!was) {
        seen.set(session, { inserted: session.inserted, refills: session.refills, full });
        return;
      }
      const fed = session.inserted - was.inserted;
      const refills = session.refills - was.refills;
      const filled = full && !was.full;
      was.inserted = session.inserted;
      was.refills = session.refills;
      was.full = full;
      if (!book || !state.day) return;
      let all: readonly RecordEvent[] = events;
      if (fed > 0 || refills > 0 || filled) {
        const extra: RecordEvent[] = [];
        if (fed > 0) extra.push({ type: 'fed', count: fed });
        if (refills > 0) extra.push({ type: 'refill', count: refills });
        if (filled) extra.push({ type: 'holdFull' });
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
      // A stamp is shown and written at once.
      const more = save(state.day) ?? [];
      publish({ fresh: announce([...earned, ...more]) });
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
     * into. The day is written down before the medals are paid, and nothing
     * is paid if it cannot be: a browser that will not remember the day pays
     * no bonus. What storage holds is read first, so a day is paid once
     * however many tabs are open. Returns the medals paid.
     */
    claimBonus(): number {
      if (!book || !pay) return 0;
      const day = env.today();
      const others = adopt(day);
      const before = book;
      const taken = claim(before, day);
      if (taken.medals === 0) {
        publish({ day, fresh: announce(others) });
        return 0;
      }
      book = taken.book;
      unsaved = true;
      const more = save(day);
      if (more === null || !pay(taken.medals)) {
        // Nothing was paid, so nothing is taken: the book goes back to what it was, in storage too if it got there.
        book = before;
        if (more !== null) {
          try {
            env.write(serializeBook(before));
            base = before;
          } catch {
            keeps(false);
          }
        }
        publish({ day, fresh: announce(others) });
        return 0;
      }
      // The stamp comes down on the card.
      playSound('reelStop', sound);
      publish({ day, claims: state.claims + 1, paid: taken.medals, fresh: announce([...others, ...newStamps(before, taken.book), ...more]) });
      return taken.medals;
    },

    /** A stamp's toast has been shown: it leaves the queue. */
    shown(id: AchievementId): void {
      if (state.fresh.includes(id)) publish({ fresh: state.fresh.filter((other) => other !== id) });
    },

    /** Clears the records, here and in storage. The days the bonus was taken stay. */
    clearRecords(): void {
      if (!book) return;
      const day = env.today();
      adopt(day);
      book = clearBook(book);
      unsaved = true;
      save(day);
      publish({ day, fresh: [] });
    },

    /** Whether the cabinet's sound is on, for the stamp and the chime. */
    setSound(on: boolean): void {
      sound = on;
    },

    /** The book as text, for keeping a copy somewhere else: null until it has been read. */
    exportBook: (): string | null => (book ? serializeBook(book) : null),

    /**
     * Joins a copy of the book from somewhere else, an account's or another
     * device's, into this one. Returns whether the text was a book.
     */
    absorb(text: string): boolean {
      const theirs = parseBook(text);
      if (!book || !theirs) return false;
      const day = env.today();
      const joined = mergeBooks(book, theirs);
      const stamped = stamp(joined, day);
      book = stamped;
      unsaved = true;
      const more = save(day) ?? [];
      publish({ day, fresh: announce([...newStamps(joined, stamped), ...more]) });
      return true;
    },
  };
}

/** The browser, as the store needs it. Nothing here runs until the store is listened to, which is never on the server. */
const browser: RecordsEnv = {
  read: () => window.localStorage.getItem(RECORDS_KEY),
  write: (text) => window.localStorage.setItem(RECORDS_KEY, text),
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
};

/** The page's one record book. */
export const records = createRecords(browser);

const waiting = (): RecordsState => WAITING;
/** The record book as the page shows it: `WAITING` on the server and in the first drawing, the browser's book after. */
export const useRecords = (): RecordsState => useSyncExternalStore(records.subscribe, records.getState, waiting);
