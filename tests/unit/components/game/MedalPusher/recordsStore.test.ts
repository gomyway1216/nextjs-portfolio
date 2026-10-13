import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  BONUS_CARD,
  RECORDS_KEY,
  cardFor,
  claim,
  countDays,
  createBook,
  dayNumber,
  dayOf,
  hasDay,
  isDevice,
  parseBook,
  record,
  serializeBook,
  viewOf,
  type Day,
  type RecordBook,
} from '@/components/game/MedalPusher/records';
import {
  RECORDS_LOCK,
  SAVE_EVERY,
  WAITING,
  WRITE_TRIES,
  createRecords,
  deviceName,
  finish,
  localDay,
  type Records,
  type RecordsEnv,
  type Steps,
} from '@/components/game/MedalPusher/recordsStore';
import { MAX_STOCK, START_CREDITS, createSession, grant, type Session, type SessionEvent } from '@/components/game/MedalPusher/session';

const MONDAY: Day = '2026-10-12';
const after = (days: number): Day => dayOf((dayNumber(MONDAY) as number) + days);
const line: SessionEvent = { type: 'spinEnd', result: { tier: 'small', digits: [2, 2, 2], reach: true, reachKind: 'normal' } };

/**
 * A browser for the store to live in: one storage, which can be blocked or
 * full, one clock, one lock for all its tabs (or none, as in a browser
 * without Web Locks), and as many tabs as are opened. Each tab is a store of
 * its own, with the timer and the events it would be given, to be fired by
 * hand. A tab can be opened as one the lock is not there for, or one it is
 * refused to, while the others have it.
 *
 * A tab opened `stepped` does not run its transactions when they are asked
 * for. They wait, and the test takes them a step at a time: each step is one
 * read or one write of storage. Taking a step of this tab and then a step of
 * that one puts their reads and writes in any order that two tabs running
 * side by side could fall into.
 */
function browser(day: Day = MONDAY, { locks = true }: { locks?: boolean } = {}) {
  const held = new Map<string, string>();
  const disk = {
    blocked: false,
    full: false,
    /** Reads and writes of the book itself, and of anything at all. */
    reads: 0,
    writes: 0,
    touched: 0,
    get text(): string | null {
      return held.get(RECORDS_KEY) ?? null;
    },
    set text(value: string | null) {
      if (value === null) held.delete(RECORDS_KEY);
      else held.set(RECORDS_KEY, value);
    },
  };
  let today = day;
  let named = 0;
  // The lock: one task at a time, in the order they asked, each told that it is alone.
  let busy = false;
  const queue: ((alone: boolean, release: () => void) => void)[] = [];
  const pump = (): void => {
    if (busy) return;
    const task = queue.shift();
    if (!task) return;
    busy = true;
    task(true, () => {
      busy = false;
      pump();
    });
  };
  const granted: RecordsEnv['lock'] = (task) => {
    queue.push(task);
    pump();
  };
  /** No lock: the task runs beside whatever any other tab is doing, and is told so. */
  const beside: RecordsEnv['lock'] = (task) => task(false, () => undefined);

  const open = ({ stepped = false, lock = locks ? 'granted' : 'none' }: { stepped?: boolean; lock?: 'granted' | 'refused' | 'none' } = {}) => {
    let handlers: Parameters<RecordsEnv['watch']>[0] | null = null;
    const pending: { steps: Steps; done: () => void }[] = [];
    const env: RecordsEnv = {
      read: (key) => {
        disk.touched += 1;
        if (key === RECORDS_KEY) disk.reads += 1;
        if (disk.blocked) throw new Error('storage is blocked');
        return held.get(key) ?? null;
      },
      write: (key, text) => {
        disk.touched += 1;
        if (disk.blocked || disk.full) throw new Error('storage is full');
        if (key === RECORDS_KEY) disk.writes += 1;
        held.set(key, text);
      },
      today: () => today,
      device: () => `device${String((named += 1)).padStart(4, '0')}`,
      watch: (given) => {
        handlers = given;
        return () => {
          handlers = null;
        };
      },
      apart: () => lock !== 'none',
      lock: lock === 'granted' ? granted : beside,
      drive: stepped
        ? (steps, done) => void pending.push({ steps, done })
        : (steps, done) => {
            finish(steps);
            done();
          },
    };
    const store = createRecords(env);
    let told = 0;
    const tab = {
      store,
      /** Starts listening, as the page does when it is drawn in the browser. Returns what stops it. */
      listen: () => store.subscribe(() => (told += 1)),
      tick: (times = 1) => {
        for (let i = 0; i < times; i++) handlers?.tick();
      },
      changed: () => handlers?.changed(),
      leaving: () => handlers?.leaving(),
      watching: () => handlers !== null,
      told: () => told,
      book: () => store.getState().book as RecordBook,
      total: () => viewOf(store.getState().book as RecordBook).total,
      /** Takes today's bonus and says how many medals this tab was paid for it. */
      take: (): number => {
        const before = store.getState().claims;
        store.claimBonus();
        const now = store.getState();
        return now.claims > before ? now.paid : 0;
      },
      /** Whether a transaction of this tab's has a step waiting to be taken. */
      waiting: () => pending.length > 0,
      /** Takes one step of this tab's transaction: up to its next read or write, or to its end. */
      step: (): boolean => {
        const job = pending[0];
        if (!job) return false;
        if (job.steps.next().done) {
          pending.shift();
          job.done();
        }
        return true;
      },
      /** Takes this tab's transactions through to the end. A transaction that never ends is a failure, not a test that never ends. */
      run: () => {
        for (let steps = 0; tab.step(); steps++) if (steps > 10_000) throw new Error('the tab never finished');
      },
      /** Takes steps of this tab's until something is so. A tab that runs out of steps first is a failure. */
      stepUntil: (so: () => boolean) => {
        while (!so()) if (!tab.step()) throw new Error('the tab finished before it got there');
      },
    };
    return tab;
  };
  return {
    disk,
    held,
    open,
    setDay: (next: Day) => {
      today = next;
    },
    stored: () => parseBook(disk.text),
  };
}
type Tab = ReturnType<ReturnType<typeof browser>['open']>;

/** A machine with a purse the store can pay into, as the cabinet gives it one. */
function machine(store: Records, seed = 4) {
  const session = createSession(seed, { balls: 0 });
  const paid: number[] = [];
  const close = store.openPurse((medals) => {
    paid.push(medals);
    return grant(session, medals);
  });
  return { session, paid, close };
}

/**
 * As much of a machine as the book looks at: its own counters, and a purse. Making a real machine lays out a whole
 * field of medals, which the tests that open hundreds of tabs have no use for.
 */
const counters = (): Session => ({ inserted: 0, refills: 0, credits: START_CREDITS }) as unknown as Session;
/** A purse for a tab that is one of many. */
function purse(store: Records) {
  const session = counters();
  const paid: number[] = [];
  store.openPurse((medals) => {
    paid.push(medals);
    return grant(session, medals);
  });
  return { session, paid };
}

/** How many days a stored book says the bonus was taken on. */
const countDaysTaken = (book: RecordBook | null): number => (book ? countDays(book.claimed) : 0);

/** Feeds the machine medals the way the cabinet's counters show it. */
const feed = (session: Session, medals: number) => {
  session.inserted += medals;
  session.credits -= medals;
};

describe('the record book in the browser', () => {
  it('is not read until something on the page is listening, and until then is the page the server sent', () => {
    const world = browser();
    const tab = world.open();
    expect(tab.store.getState()).toBe(WAITING);
    expect(WAITING).toEqual({ book: null, day: null, kept: true, purse: false, apart: true, fresh: [], claims: 0, paid: 0 });
    // Nothing that is done to it reads or writes, and nothing is paid.
    const { session, paid } = machine(tab.store);
    tab.store.note(session, [line]);
    tab.store.claimBonus();
    tab.store.clearRecords();
    expect(tab.store.absorb(serializeBook(createBook('other00001')))).toBe(false);
    expect(tab.store.exportBook()).toBeNull();
    expect(tab.store.getState()).toBe(WAITING);
    expect(world.disk).toMatchObject({ reads: 0, writes: 0, touched: 0, text: null });
    expect(paid).toEqual([]);
    expect(tab.watching()).toBe(false);
  });

  it('opens a new book for a new player, names the device, writes it once and tells the page', () => {
    const world = browser();
    const tab = world.open();
    const stop = tab.listen();
    const state = tab.store.getState();
    expect(state).toMatchObject({ day: MONDAY, kept: true, purse: false, apart: true, fresh: [], claims: 0, paid: 0 });
    expect(isDevice(state.book?.device)).toBe(true);
    expect(state.book).toEqual(createBook(state.book?.device as string));
    expect(world.stored()).toEqual(state.book);
    expect(world.disk.writes).toBe(1);
    expect(tab.told()).toBe(1);
    expect(tab.watching()).toBe(true);
    // A second listener does not open it again.
    const stopSecond = tab.store.subscribe(() => undefined);
    expect(world.disk.writes).toBe(1);
    stopSecond();
    expect(tab.watching()).toBe(true);
    // When the last one leaves, the book is put away.
    stop();
    expect(tab.watching()).toBe(false);
    expect(tab.store.getState()).toBe(WAITING);
    expect(tab.store.exportBook()).toBeNull();
  });

  it('finds the book it left, on the same device', () => {
    const world = browser();
    const first = world.open();
    const stop = first.listen();
    const device = first.book().device;
    const { session } = machine(first.store);
    first.store.note(session, []);
    feed(session, 7);
    first.store.note(session, [{ type: 'won', count: 3 }]);
    // The page is left before the timer has written: what it has is written as it goes.
    stop();
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 7, won: 3 });
    // The page is loaded again: the same book, the same device, and nothing written until there is something new.
    const writes = world.disk.writes;
    const again = world.open();
    again.listen();
    expect(again.book().device).toBe(device);
    expect(again.total()).toMatchObject({ fed: 7, won: 3 });
    expect(world.disk.writes).toBe(writes);
  });

  it('keeps what it had not written when it is listened to again before its write has had its turn', () => {
    // The page is left and come back to at once, while its last write is still waiting for the lock.
    const world = browser();
    const tab = world.open({ stepped: true });
    const stop = tab.listen();
    tab.run();
    const session = createSession(4, { balls: 0 });
    tab.store.note(session, []);
    feed(session, 5);
    tab.store.note(session, []);
    stop();
    expect(tab.waiting()).toBe(true);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(0);
    tab.listen();
    expect(tab.total().fed).toBe(5);
    tab.run();
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(5);
  });

  it('starts again with a new book when what is stored is not one', () => {
    const world = browser();
    world.disk.text = '{"v":1,"device":"x"}';
    const tab = world.open();
    tab.listen();
    expect(tab.book()).toEqual(createBook(tab.book().device));
    expect(world.stored()).toEqual(tab.book());
  });

  it('goes on in memory where storage is blocked, and says the book is not kept', () => {
    const world = browser();
    world.disk.blocked = true;
    const tab = world.open();
    tab.listen();
    expect(tab.store.getState()).toMatchObject({ kept: false, day: MONDAY });
    const { session, paid } = machine(tab.store);
    tab.store.note(session, []);
    feed(session, 5);
    tab.store.note(session, [line]);
    tab.tick();
    expect(tab.total().fed).toBe(5);
    expect(tab.store.getState().fresh).toEqual(['firstLine']);
    // Nothing would remember that a day had been paid, so no day is.
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);
    expect(session.credits).toBe(START_CREDITS - 5);
    tab.tick(SAVE_EVERY * 3);
    tab.leaving();
    expect(world.disk.writes).toBe(0);
    expect(world.held.size).toBe(0);
  });

  it('says the book is not kept when storage reads but will not write, and that it is once it will', () => {
    const world = browser();
    world.disk.full = true;
    const tab = world.open();
    tab.listen();
    expect(tab.store.getState().kept).toBe(false);
    const { session, paid } = machine(tab.store);
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);
    // Room is made. The next time the book has something to write, it is kept after all, and the bonus is there.
    world.disk.full = false;
    tab.store.note(session, []);
    feed(session, 1);
    tab.store.note(session, []);
    tab.tick(SAVE_EVERY);
    expect(tab.store.getState().kept).toBe(true);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(1);
    expect(tab.take()).toBe(BONUS_CARD[0]);
  });
});

describe('hearing what the machine did', () => {
  it('counts from when it first sees a machine, so nothing in a restored save is counted again', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const session = createSession(4, { balls: 0 });
    // A machine out of its save: medals fed and refills taken, all from before.
    session.inserted = 500;
    session.refills = 3;
    tab.store.note(session, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 0, refills: 0 });
    feed(session, 2);
    tab.store.note(session, []);
    session.refills += 1;
    tab.store.note(session, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 2, refills: 1 });
  });

  it('reads medals fed and refills off the machine’s own counters, and everything else from its events', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const session = createSession(4, { balls: 0 });
    tab.store.note(session, []);
    feed(session, 3);
    tab.store.note(session, [
      { type: 'won', count: 2 },
      { type: 'landed', count: 3 },
    ]);
    // The hold filling is the machine's to say. How full the hold stands when the frame is over says nothing:
    // here it fills and a spin takes one off in the same frame, and it is counted; then it only stands full, and is not.
    session.stock = MAX_STOCK - 1;
    tab.store.note(session, [{ type: 'holdFilled' }, { type: 'checker', gate: 0, held: true }]);
    session.stock = MAX_STOCK;
    tab.store.note(session, [{ type: 'checker', gate: 1, held: false }]);
    tab.store.note(session, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 3, won: 2, hits: 2, wasted: 1, fulls: 1 });
    expect(tab.book().stamps).toEqual({ holdFull: MONDAY });
    expect(hasDay(tab.book().played, MONDAY)).toBe(true);
  });

  it('shows the page a second later and not every frame, and writes every few seconds and when the page is left', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const session = createSession(4, { balls: 0 });
    tab.store.note(session, []);
    const [told, writes] = [tab.told(), world.disk.writes];
    for (let frame = 0; frame < 120; frame++) {
      feed(session, 1);
      tab.store.note(session, [{ type: 'landed', count: 1 }]);
    }
    // A hundred and twenty frames of play: the page has not been drawn again and nothing has been written.
    expect(tab.told()).toBe(told);
    expect(world.disk.writes).toBe(writes);
    expect(tab.total().fed).toBe(0);
    tab.tick();
    expect(tab.told()).toBe(told + 1);
    expect(tab.total().fed).toBe(120);
    expect(SAVE_EVERY).toBeGreaterThan(1);
    expect(world.disk.writes).toBe(writes);
    tab.tick(SAVE_EVERY - 1);
    // A tick with nothing new draws nothing, and the timer's write comes round.
    expect(tab.told()).toBe(told + 1);
    expect(world.disk.writes).toBe(writes + 1);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(120);
    // Nothing new, nothing written.
    tab.tick(SAVE_EVERY * 2);
    tab.leaving();
    expect(world.disk.writes).toBe(writes + 1);
    feed(session, 4);
    tab.store.note(session, []);
    tab.leaving();
    expect(world.disk.writes).toBe(writes + 2);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(124);
    // The most that can go unwritten when a page is closed is a couple of seconds of play.
    expect(SAVE_EVERY).toBeLessThanOrEqual(3);
  });

  it('keeps the records when the machine is started over', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const old = createSession(4, { balls: 0 });
    tab.store.note(old, []);
    feed(old, 30);
    tab.store.note(old, [{ type: 'won', count: 20 }, line]);
    // Start over: a new machine with nothing played. The book has what the old one did, and counts on.
    const fresh = createSession(5, { balls: 0 });
    tab.store.note(fresh, []);
    feed(fresh, 2);
    tab.store.note(fresh, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 32, won: 20, small: 1 });
    expect(tab.book().stamps.firstLine).toBe(MONDAY);
  });

  it('queues a stamp to be shown the moment it is earned, writes it at once, and earns it once', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const session = createSession(4, { balls: 0 });
    tab.store.note(session, []);
    const [told, writes] = [tab.told(), world.disk.writes];
    tab.store.note(session, [line]);
    expect(tab.store.getState().fresh).toEqual(['firstLine']);
    expect(tab.told()).toBe(told + 1);
    expect(world.disk.writes).toBe(writes + 1);
    expect(world.stored()?.stamps).toEqual({ firstLine: MONDAY });
    // A second line earns nothing new. A tower earns its own, and waits its turn behind the first.
    tab.store.note(session, [line]);
    expect(tab.store.getState().fresh).toEqual(['firstLine']);
    tab.store.note(session, [{ type: 'toppled', count: 1 }]);
    expect(tab.store.getState().fresh).toEqual(['firstLine', 'tower']);
    tab.store.shown('firstLine');
    expect(tab.store.getState().fresh).toEqual(['tower']);
    tab.store.shown('firstLine');
    tab.store.shown('tower');
    expect(tab.store.getState().fresh).toEqual([]);
    // Loaded again, the stamps are in the book and nothing is announced a second time.
    const again = world.open();
    again.listen();
    expect(again.book().stamps).toEqual({ firstLine: MONDAY, tower: MONDAY });
    expect(again.store.getState().fresh).toEqual([]);
  });
});

describe('taking the day’s bonus', () => {
  it('pays what the card says into the machine’s purse, once', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    expect(tab.store.getState().purse).toBe(false);
    // With no machine there is nowhere to pay it.
    expect(tab.take()).toBe(0);
    const { session, paid } = machine(tab.store);
    expect(tab.store.getState().purse).toBe(true);
    expect(cardFor(tab.book(), MONDAY).state).toBe('ready');
    expect(session.credits).toBe(START_CREDITS);

    expect(tab.take()).toBe(BONUS_CARD[0]);
    expect(paid).toEqual([BONUS_CARD[0]]);
    expect(session.credits).toBe(START_CREDITS + BONUS_CARD[0]);
    expect(tab.store.getState()).toMatchObject({ claims: 1, paid: BONUS_CARD[0], day: MONDAY });
    expect(cardFor(tab.book(), MONDAY).state).toBe('taken');
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(true);
    expect(tab.total()).toMatchObject({ claims: 1, bonus: BONUS_CARD[0], fed: 0, won: 0 });
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ claims: 1, bonus: BONUS_CARD[0] });
    // Nothing is kept in storage but the book.
    expect([...world.held.keys()]).toEqual([RECORDS_KEY]);

    // It is not there a second time.
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([BONUS_CARD[0]]);
    expect(session.credits).toBe(START_CREDITS + BONUS_CARD[0]);
    expect(tab.store.getState().claims).toBe(1);
  });

  it('writes the day into the book and reads it back out of storage before a medal is paid', () => {
    const world = browser();
    const tab = world.open({ stepped: true });
    tab.listen();
    tab.run();
    const { paid } = machine(tab.store);
    tab.store.claimBonus();
    // Step by step: at the moment the purse is paid, the stored book already has the day, and no bonus counted yet.
    let before: { claimed: boolean; counted: number; read: number } | null = null;
    while (tab.waiting()) {
      const was = { claimed: hasDay(world.stored()?.claimed ?? {}, MONDAY), counted: viewOf(world.stored() as RecordBook).total.claims, read: world.disk.reads };
      tab.step();
      // The step that pays is the one that reads the book back: nothing is paid on the strength of the write alone.
      if (paid.length === 1 && before === null) before = { ...was, read: world.disk.reads - was.read };
    }
    expect(paid).toEqual([BONUS_CARD[0]]);
    expect(before).toEqual({ claimed: true, counted: 0, read: 1 });
    // The bonus is counted only once it has been paid, and that is written too.
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ claims: 1, bonus: BONUS_CARD[0] });
  });

  it('is not offered again when the page is loaded again that day, and is the next day', () => {
    const world = browser();
    const first = world.open();
    const stop = first.listen();
    machine(first.store);
    expect(first.take()).toBe(BONUS_CARD[0]);
    stop();

    const again = world.open();
    again.listen();
    const { paid } = machine(again.store);
    expect(cardFor(again.book(), MONDAY).state).toBe('taken');
    // The page that took it plays the stamp's ceremony; a page that finds it taken does not.
    expect(again.store.getState()).toMatchObject({ claims: 0, paid: 0 });
    expect(again.take()).toBe(0);
    expect(paid).toEqual([]);

    world.setDay(after(1));
    expect(again.take()).toBe(BONUS_CARD[1]);
    expect(paid).toEqual([BONUS_CARD[1]]);
  });

  it('becomes ready at midnight on a page that is left open, by its timer', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { paid } = machine(tab.store);
    tab.take();
    const ready = () => {
      const { book, day } = tab.store.getState();
      return book !== null && day !== null && cardFor(book, day).state === 'ready';
    };
    expect(ready()).toBe(false);
    const told = tab.told();
    tab.tick(30);
    expect(tab.told()).toBe(told);
    // Midnight passes. The next tick of the timer sees the new day and tells the page.
    world.setDay(after(1));
    expect(ready()).toBe(false);
    tab.tick();
    expect(tab.told()).toBe(told + 1);
    expect(tab.store.getState().day).toBe(after(1));
    expect(ready()).toBe(true);
    expect(tab.take()).toBe(BONUS_CARD[1]);
    expect(paid).toEqual([BONUS_CARD[0], BONUS_CARD[1]]);
  });

  it('pays each day once however the clock is moved', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { paid } = machine(tab.store);
    expect(tab.take()).toBe(BONUS_CARD[0]);
    // Forward three days: a missed day, so the first square of a new card, and it is taken.
    world.setDay(after(3));
    tab.tick();
    expect(tab.take()).toBe(BONUS_CARD[0]);
    // Back again: nothing is ready on the days before the one that was stamped, nor on that day when it comes.
    for (const days of [0, 1, 2, 3]) {
      world.setDay(after(days));
      tab.tick();
      expect(tab.take()).toBe(0);
    }
    world.setDay(after(4));
    tab.tick();
    expect(tab.take()).toBe(BONUS_CARD[1]);
    expect(paid).toEqual([BONUS_CARD[0], BONUS_CARD[0], BONUS_CARD[1]]);
    // A clock set off the calendar altogether has no bonus.
    world.setDay('2150-01-01');
    tab.tick();
    expect(tab.take()).toBe(0);
  });

  it('pays nothing, and takes nothing, when the day cannot be written down', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { session, paid } = machine(tab.store);
    const before = tab.book();
    world.disk.full = true;
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);
    expect(session.credits).toBe(START_CREDITS);
    expect(tab.book()).toBe(before);
    expect(tab.store.getState()).toMatchObject({ kept: false, claims: 0 });
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(false);
    // The day is not spent: it is there to be taken when storage takes a write again.
    world.disk.full = false;
    expect(tab.take()).toBe(BONUS_CARD[0]);
  });

  it('pays no bonus in a browser that cannot keep its tabs apart, and says so; the records are kept all the same', () => {
    const world = browser(MONDAY, { locks: false });
    const tab = world.open();
    tab.listen();
    expect(tab.store.getState()).toMatchObject({ apart: false, kept: true });
    const { session, paid } = machine(tab.store);
    expect(cardFor(tab.book(), MONDAY).state).toBe('ready');
    const told = tab.told();
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);
    expect(session.credits).toBe(START_CREDITS);
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(false);
    expect(tab.total()).toMatchObject({ claims: 0, bonus: 0 });
    expect(tab.told()).toBe(told + 1);
    // However often it is asked, and on whatever day.
    for (const days of [0, 1, 2]) {
      world.setDay(after(days));
      tab.tick();
      expect(tab.take()).toBe(0);
    }
    expect(paid).toEqual([]);
    expect(countDaysTaken(world.stored())).toBe(0);
    // What is played is counted and written, lock or no lock.
    tab.store.note(session, []);
    feed(session, 6);
    tab.store.note(session, [line]);
    tab.leaving();
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 6, small: 1 });
    expect((world.stored() as RecordBook).stamps.firstLine).toBe(after(2));
  });

  it('stops offering the bonus in a tab the lock is refused to, and pays it nothing', () => {
    const world = browser();
    const tab = world.open({ lock: 'refused' });
    tab.listen();
    // The browser has Web Locks, so the bonus is offered. Then the lock is asked for, and is not given.
    expect(tab.store.getState().apart).toBe(true);
    const { paid } = machine(tab.store);
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);
    expect(tab.store.getState().apart).toBe(false);
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(false);
    // A tab that has the lock is paid as ever.
    const other = world.open();
    other.listen();
    const purseOfOther = machine(other.store, 5);
    expect(other.take()).toBe(BONUS_CARD[0]);
    expect(purseOfOther.paid).toEqual([BONUS_CARD[0]]);
  });

  it('counts no bonus when the machine will not be paid: the day is spent, and nothing is said to have been given', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    tab.store.openPurse(() => false);
    expect(tab.take()).toBe(0);
    expect(tab.store.getState().claims).toBe(0);
    expect(tab.total()).toMatchObject({ claims: 0, bonus: 0 });
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ claims: 0, bonus: 0 });
    // The day was written down before the purse was asked, and a day is written down once.
    expect(cardFor(tab.book(), MONDAY).state).toBe('taken');
    const { paid } = machine(tab.store);
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);
  });

  it('pays into the machine that is there now: a purse that has been closed is not paid', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const old = machine(tab.store, 4);
    const now = machine(tab.store, 5);
    // The old cabinet is taken down after the new one stands: that does not take the new one's purse away.
    old.close();
    expect(tab.store.getState().purse).toBe(true);
    expect(tab.take()).toBe(BONUS_CARD[0]);
    expect(old.paid).toEqual([]);
    expect(now.paid).toEqual([BONUS_CARD[0]]);
    now.close();
    expect(tab.store.getState().purse).toBe(false);
    world.setDay(after(1));
    expect(tab.take()).toBe(0);
  });

  it('earns the week’s stamp with the seventh day in a row, and queues it', () => {
    const world = browser();
    let book = createBook('device0001');
    for (let days = 0; days < 6; days++) book = claim(book, after(days)).book;
    world.disk.text = serializeBook(book);
    world.setDay(after(6));
    const tab = world.open();
    tab.listen();
    machine(tab.store);
    expect(tab.take()).toBe(BONUS_CARD[6]);
    expect(tab.store.getState().fresh).toEqual(['week']);
    expect(world.stored()?.stamps).toEqual({ week: after(6) });
  });
});

describe('two tabs of the game, one after the other', () => {
  it('pay a day’s bonus once between them', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    expect(two.book().device).toBe(one.book().device);
    const [first, second] = [machine(one.store, 4), machine(two.store, 5)];
    // Both show it ready. The first takes it; the second looks at what is stored before it pays, and does not.
    expect(cardFor(two.book(), MONDAY).state).toBe('ready');
    expect(one.take()).toBe(BONUS_CARD[0]);
    expect(two.take()).toBe(0);
    expect(first.paid).toEqual([BONUS_CARD[0]]);
    expect(second.paid).toEqual([]);
    expect(cardFor(two.book(), MONDAY).state).toBe('taken');
    expect(two.store.getState().claims).toBe(0);
  });

  it('hear each other: a tab is told when the other has written', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    machine(one.store);
    one.take();
    const told = two.told();
    expect(cardFor(two.book(), MONDAY).state).toBe('ready');
    two.changed();
    expect(two.told()).toBe(told + 1);
    expect(cardFor(two.book(), MONDAY).state).toBe('taken');
    // Hearing writes nothing, so two tabs do not answer each other for ever.
    const writes = world.disk.writes;
    two.changed();
    one.changed();
    two.changed();
    expect(world.disk.writes).toBe(writes);
    expect(two.told()).toBe(told + 1);
  });

  it('do not answer each other’s writes with writes of their own while both are being played', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    const [first, second] = [createSession(4, { balls: 0 }), createSession(5, { balls: 0 })];
    one.store.note(first, []);
    two.store.note(second, []);
    const writes = world.disk.writes;
    for (let round = 0; round < 20; round++) {
      feed(first, 1);
      one.store.note(first, []);
      feed(second, 1);
      two.store.note(second, []);
      // Each hears the other, with medals of its own not yet written.
      one.changed();
      two.changed();
    }
    expect(world.disk.writes).toBe(writes);
    one.leaving();
    two.leaving();
    expect(world.disk.writes).toBe(writes + 2);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(40);
  });

  it('add what each has counted to the one book, whichever writes first', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    const [first, second] = [createSession(4, { balls: 0 }), createSession(5, { balls: 0 })];
    one.store.note(first, []);
    two.store.note(second, []);
    feed(first, 3);
    one.store.note(first, [{ type: 'won', count: 1 }]);
    feed(second, 4);
    two.store.note(second, []);
    one.leaving();
    two.leaving();
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 7, won: 1 });
    // Each takes in what the other wrote; what they hold is then the same, and writing again changes nothing.
    one.changed();
    two.changed();
    one.tick();
    two.tick();
    expect(one.total().fed).toBe(7);
    expect(two.total().fed).toBe(7);
    feed(first, 10);
    one.store.note(first, []);
    one.tick(SAVE_EVERY);
    two.tick(SAVE_EVERY);
    two.changed();
    expect(two.total().fed).toBe(17);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(17);
    expect(Object.keys((world.stored() as RecordBook).counters)).toHaveLength(1);
  });
});

describe('tabs whose reads and writes fall between each other’s', () => {
  /** Tabs that are listening, each with a machine, and their transactions waiting to be stepped. */
  const tabs = (count: number, locks: boolean | ('granted' | 'refused' | 'none')[], day: Day = MONDAY) => {
    const world = browser(day, { locks: locks !== false });
    const open = Array.from({ length: count }, (_, index) => world.open({ stepped: true, lock: Array.isArray(locks) ? locks[index] : locks ? 'granted' : 'none' }));
    const machines = open.map((tab) => {
      tab.listen();
      // The first write of a new book, and the reading of it by the others.
      for (const other of open) other.run();
      return purse(tab.store);
    });
    for (const tab of open) tab.changed();
    return { world, open, machines };
  };
  /** Takes steps of whichever tabs have one waiting, picked by `rng`, until none has. Returns how many were taken. */
  const shuffle = (open: Tab[], rng: () => number): number => {
    let steps = 0;
    for (;;) {
      const ready = open.filter((tab) => tab.waiting());
      if (ready.length === 0) return steps;
      ready[Math.min(ready.length - 1, Math.floor(rng() * ready.length))].step();
      steps += 1;
      if (steps > 10_000) throw new Error('the tabs never finished');
    }
  };
  /** Everybody writes what they have and hears everybody else, as tabs left open do within a few seconds. */
  const settle = (open: Tab[]) => {
    for (let round = 0; round < 3; round++) {
      for (const tab of open) {
        tab.leaving();
        tab.run();
        for (const other of open) {
          other.changed();
          other.run();
        }
      }
    }
    for (const tab of open) tab.tick();
  };

  it('lose a count where nothing keeps them apart: both read, both write, and the later write has not the earlier one’s medals', () => {
    // This is what a browser without Web Locks can do, and what the lock is for.
    const { world, open } = tabs(2, false);
    const [one, two] = open;
    const [first, second] = [createSession(4, { balls: 0 }), createSession(5, { balls: 0 })];
    one.store.note(first, []);
    two.store.note(second, []);
    feed(first, 3);
    one.store.note(first, []);
    feed(second, 4);
    two.store.note(second, []);
    one.leaving();
    two.leaving();
    // Each takes its first step, up to its read, and then its read; then each writes.
    for (const tab of [one, two, one, two]) tab.step();
    one.run();
    two.run();
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(4);
    // Nothing is ever counted that did not happen, and what is left unwritten is the smaller of the two.
    settle(open);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(4);
  });

  it('cannot fall between each other’s under the lock: the second tab’s transaction does not begin until the first has ended', () => {
    const { world, open } = tabs(2, true);
    const [one, two] = open;
    const [first, second] = [createSession(4, { balls: 0 }), createSession(5, { balls: 0 })];
    one.store.note(first, []);
    two.store.note(second, []);
    feed(first, 3);
    one.store.note(first, []);
    feed(second, 4);
    two.store.note(second, []);
    one.leaving();
    two.leaving();
    // The same order is asked for. The second tab has no step to take while the first holds the lock.
    expect(one.step()).toBe(true);
    expect(two.waiting()).toBe(false);
    expect(two.step()).toBe(false);
    one.run();
    expect(two.waiting()).toBe(true);
    two.run();
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(7);
  });

  it('count every medal once under the lock, whatever order they play, write, hear and take the bonus in', () => {
    for (const count of [2, 3]) {
      for (let schedule = 0; schedule < 40; schedule++) {
        const rng = seededRng(7000 + 100 * count + schedule);
        const pick = (n: number) => Math.min(n - 1, Math.floor(rng() * n));
        const { world, open, machines } = tabs(count, true);
        const sessions = open.map(counters);
        open.forEach((tab, index) => tab.store.note(sessions[index], []));
        let truth = 0;
        for (let turn = 0; turn < 60; turn++) {
          const who = pick(count);
          const what = pick(10);
          if (what < 3) {
            const medals = 1 + pick(9);
            feed(sessions[who], medals);
            open[who].store.note(sessions[who], []);
            truth += medals;
          } else if (what === 3) open[who].leaving();
          else if (what === 4) open[who].changed();
          else if (what === 5) open[who].store.claimBonus();
          else if (what === 6) open[who].tick(SAVE_EVERY);
          else {
            // One read or one write, of whichever tab the lock lets go on.
            const ready = open.filter((tab) => tab.waiting());
            if (ready.length > 0) ready[pick(ready.length)].step();
            // Under the lock only one tab is ever in the middle of anything.
            expect(open.filter((tab) => tab.waiting()).length).toBeLessThanOrEqual(1);
          }
          expect(viewOf(world.stored() as RecordBook).total.fed).toBeLessThanOrEqual(truth);
        }
        shuffle(open, rng);
        settle(open);
        const paid = machines.flatMap((each) => each.paid);
        const asked = paid.length > 0 || open.some((tab) => cardFor(tab.book(), MONDAY).state === 'taken');
        expect(viewOf(world.stored() as RecordBook).total.fed, `tabs ${count}, schedule ${schedule}`).toBe(truth);
        // The bonus: paid once if anybody reached for it, to the first that did, and counted once.
        expect(paid).toEqual(asked ? [BONUS_CARD[0]] : []);
        expect(viewOf(world.stored() as RecordBook).total.claims).toBe(paid.length);
        for (const tab of open) expect(tab.total().fed).toBe(truth);
      }
    }
  });

  it('pay a day once under the lock when every tab reaches for it at once: the tab that asked first, and no other', () => {
    for (const count of [2, 3, 4]) {
      for (let schedule = 0; schedule < 25; schedule++) {
        const rng = seededRng(9000 + 1000 * count + schedule);
        const { world, open, machines } = tabs(count, true);
        const sessions = open.map(counters);
        // Every tab has medals of its own to write, and every tab reaches for today's bonus, in an order drawn by lot.
        const order = open.map((_, index) => index).sort(() => rng() - 0.5);
        for (const index of order) {
          open[index].store.note(sessions[index], []);
          feed(sessions[index], 1 + index);
          open[index].store.note(sessions[index], []);
          if (rng() < 0.5) open[index].leaving();
          open[index].store.claimBonus();
        }
        // Their steps are taken in whatever order the lock allows, with the tabs hearing each other at odd moments.
        for (let steps = 0; open.some((tab) => tab.waiting()); steps++) {
          const ready = open.filter((tab) => tab.waiting());
          expect(ready).toHaveLength(1);
          ready[0].step();
          if (rng() < 0.3) open[Math.min(count - 1, Math.floor(rng() * count))].changed();
          if (steps > 10_000) throw new Error('the tabs never finished');
        }
        expect(machines.map((each) => each.paid)).toEqual(open.map((_, index) => (index === order[0] ? [BONUS_CARD[0]] : [])));
        settle(open);
        for (const tab of open) expect(cardFor(tab.book(), MONDAY).state).toBe('taken');
        // Asked again, nobody is paid again, and a tab opened later finds the day taken.
        for (const tab of open) tab.store.claimBonus();
        shuffle(open, rng);
        const late = world.open();
        late.listen();
        const lateOne = purse(late.store);
        expect(late.take()).toBe(0);
        expect(lateOne.paid).toEqual([]);
        expect(machines.flatMap((each) => each.paid)).toEqual([BONUS_CARD[0]]);
        // One bonus counted, and every medal.
        expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ claims: 1, bonus: BONUS_CARD[0], fed: (count * (count + 1)) / 2 });
      }
    }
  });

  it('pay no bonus at all where nothing keeps them apart, whatever order their reads and writes fall in', () => {
    for (const count of [2, 3]) {
      for (let schedule = 0; schedule < 40; schedule++) {
        const rng = seededRng(12_000 + 1000 * count + schedule);
        const { world, open, machines } = tabs(count, false);
        const sessions = open.map(counters);
        open.forEach((tab, index) => {
          tab.store.note(sessions[index], []);
          feed(sessions[index], 1 + index);
          tab.store.note(sessions[index], []);
          if (rng() < 0.5) tab.leaving();
          tab.store.claimBonus();
        });
        shuffle(open, rng);
        settle(open);
        // Nobody was paid, no day was spent, and no tab offers the bonus any more.
        expect(machines.flatMap((each) => each.paid)).toEqual([]);
        expect(countDaysTaken(world.stored())).toBe(0);
        for (const tab of open) expect(tab.store.getState().apart).toBe(false);
        // The medals are counted as well as tabs with nothing between them can: never more than were fed.
        const fed = viewOf(world.stored() as RecordBook).total.fed;
        expect(fed).toBeGreaterThan(0);
        expect(fed).toBeLessThanOrEqual((count * (count + 1)) / 2);
      }
    }
  });

  it('write the day again when a write from a tab outside the lock lands on it before it is read back, and pay once it shows', () => {
    // The first tab has the lock. The second is one the lock was refused to: its writes are not kept out.
    const { world, open, machines } = tabs(2, ['granted', 'refused']);
    const [one, two] = open;
    // The second tab has a medal to write. It reads the book and then stops, with the write still to make.
    const second = counters();
    two.store.note(second, []);
    feed(second, 1);
    two.store.note(second, []);
    two.leaving();
    two.step();
    two.step();
    // The first tab reaches for the bonus and gets as far as writing the day into the book.
    one.store.claimBonus();
    one.stepUntil(() => hasDay(world.stored()?.claimed ?? {}, MONDAY));
    expect(machines[0].paid).toEqual([]);
    // Now the second tab's write lands: it was worked out before the day was there, and the day is gone from storage.
    two.run();
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(false);
    // The first tab reads the book back, does not find its day, and pays nothing yet.
    one.step();
    expect(machines[0].paid).toEqual([]);
    // It writes again, reads again, finds it, and pays.
    one.run();
    expect(machines[0].paid).toEqual([BONUS_CARD[0]]);
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(true);
    expect(WRITE_TRIES).toBeGreaterThanOrEqual(2);
    // The second tab, hearing, finds the day taken, and the medal it wrote is still counted. It was never paid.
    settle(open);
    expect(cardFor(two.book(), MONDAY).state).toBe('taken');
    expect(machines[1].paid).toEqual([]);
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 1, claims: 1 });
  });

  it('pay nothing when the day will not stay written however often it is written', () => {
    // A tab outside the lock that writes over the book every time: the day never reads back, and no medal is given.
    const { world, open, machines } = tabs(2, ['granted', 'refused']);
    const [one, two] = open;
    const stale = world.disk.text as string;
    one.store.claimBonus();
    for (let steps = 0; one.waiting(); steps++) {
      const before = world.disk.writes;
      one.step();
      // Whatever the first tab writes is written over at once with the book as it was before.
      if (world.disk.writes > before) world.disk.text = stale;
      if (steps > 1000) throw new Error('the tab never finished');
    }
    expect(machines[0].paid).toEqual([]);
    expect(one.store.getState().claims).toBe(0);
    expect(one.total()).toMatchObject({ claims: 0, bonus: 0 });
    void two;
  });

  it('put back what a write made over theirs has taken out of storage, as soon as they hear of it', () => {
    const { world, open, machines } = tabs(2, ['granted', 'refused']);
    const [one, two] = open;
    // The second tab reads, then the first takes the bonus from start to finish, then the second writes over it.
    const second = counters();
    two.store.note(second, []);
    feed(second, 2);
    two.store.note(second, []);
    two.leaving();
    two.step();
    two.step();
    one.store.claimBonus();
    one.run();
    expect(machines[0].paid).toEqual([BONUS_CARD[0]]);
    two.run();
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(false);
    // The first tab hears the write, sees that storage has lost the day, and writes it back without waiting for its timer.
    one.changed();
    expect(one.waiting()).toBe(true);
    one.run();
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(true);
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 2, claims: 1, bonus: BONUS_CARD[0] });
  });
});

describe('clearing the records', () => {
  it('wipes the board and the stamps here and in storage, and keeps the bonus card', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { session } = machine(tab.store);
    tab.store.note(session, []);
    feed(session, 9);
    tab.store.note(session, [line]);
    tab.take();
    expect(tab.total()).toMatchObject({ fed: 9, small: 1, claims: 1 });
    expect(tab.store.getState().fresh).toEqual(['firstLine']);

    tab.store.clearRecords();
    expect(tab.total()).toMatchObject({ fed: 0, small: 0, claims: 0 });
    expect(tab.book().stamps).toEqual({});
    expect(tab.book().era).toBe(1);
    expect(tab.store.getState().fresh).toEqual([]);
    expect(viewOf(tab.book()).days).toBe(0);
    expect(world.stored()).toEqual(tab.book());
    // Today's bonus stays taken: clearing is not a way to have it again.
    expect(cardFor(tab.book(), MONDAY).state).toBe('taken');
    expect(tab.take()).toBe(0);
    expect(session.credits).toBe(START_CREDITS - 9 + BONUS_CARD[0]);
    // Play goes on counting, from nothing.
    feed(session, 2);
    tab.store.note(session, []);
    tab.leaving();
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(2);
  });

  it('reaches the other tab, which does not bring the old records back', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    const [first, second] = [createSession(4, { balls: 0 }), createSession(5, { balls: 0 })];
    one.store.note(first, []);
    two.store.note(second, []);
    feed(first, 5);
    one.store.note(first, []);
    one.leaving();
    feed(second, 8);
    two.store.note(second, []);
    one.store.clearRecords();
    // The second tab had eight medals it had not written. They were fed before the clearing, and go with it.
    two.leaving();
    expect((world.stored() as RecordBook).era).toBe(1);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(0);
    two.tick();
    expect(two.book().era).toBe(1);
    expect(two.total().fed).toBe(0);
    feed(second, 1);
    two.store.note(second, []);
    two.leaving();
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(1);
  });
});

describe('a copy of the book from somewhere else', () => {
  it('is joined in: nothing lost, nothing counted twice, and its own copy changes nothing', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const device = tab.book().device;
    const session = createSession(4, { balls: 0 });
    tab.store.note(session, []);
    feed(session, 6);
    tab.store.note(session, []);
    // The copy to keep elsewhere is the book as it is now, which the page is shown a moment later.
    const mine = tab.store.exportBook() as string;
    expect(viewOf(parseBook(mine) as RecordBook).total.fed).toBe(6);
    expect(tab.total().fed).toBe(0);
    tab.tick();
    expect(parseBook(mine)).toEqual(tab.book());

    // The account holds what a phone did: its counts, a stamp, and Monday's bonus.
    const phone = claim(record(createBook('phone00001'), [{ type: 'fed', count: 100 }, { type: 'won', count: 90 }, line], after(-2)), MONDAY).book;
    expect(tab.store.absorb(serializeBook(phone))).toBe(true);
    expect(tab.total()).toMatchObject({ fed: 106, won: 90, small: 1, claims: 1 });
    expect(tab.book().device).toBe(device);
    expect(tab.book().stamps).toEqual({ firstLine: after(-2) });
    // A stamp earned elsewhere was announced there, and is not announced here.
    expect(tab.store.getState().fresh).toEqual([]);
    expect(world.stored()).toEqual(tab.book());
    // The phone took today's bonus: it is taken here.
    const { paid } = machine(tab.store);
    expect(tab.take()).toBe(0);
    expect(paid).toEqual([]);

    // The same copy again, the book's own copy from before, and its copy as it is now: nothing moves.
    const joined = tab.store.exportBook();
    for (const text of [serializeBook(phone), mine, joined as string]) {
      expect(tab.store.absorb(text)).toBe(true);
      expect(tab.store.exportBook()).toBe(joined);
    }
    expect(tab.store.absorb('not a book')).toBe(false);
    expect(tab.store.exportBook()).toBe(joined);
  });

  it('announces a stamp that only the two copies together have earned', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const session = createSession(4, { balls: 0 });
    tab.store.note(session, []);
    tab.store.note(session, [{ type: 'won', count: 600 }]);
    expect(tab.store.exportBook()).not.toContain('thousand');
    const phone = record(createBook('phone00001'), [{ type: 'won', count: 500 }], after(-1));
    expect(phone.stamps).toEqual({});
    tab.store.absorb(serializeBook(phone));
    expect(tab.total().won).toBe(1100);
    expect(tab.book().stamps).toEqual({ thousand: MONDAY });
    expect(tab.store.getState().fresh).toEqual(['thousand']);
  });
});

describe('what the store asks of the browser', () => {
  it('reads the day off the player’s own clock, whatever the time of day', () => {
    expect(localDay(new Date(2026, 9, 12, 0, 0, 0))).toBe('2026-10-12');
    expect(localDay(new Date(2026, 9, 12, 23, 59, 59))).toBe('2026-10-12');
    expect(localDay(new Date(2027, 0, 1, 0, 0, 1))).toBe('2027-01-01');
    expect(localDay(new Date(2026, 1, 3, 12))).toBe('2026-02-03');
  });

  it('names a device with ten letters and digits', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const names = new Set(Array.from({ length: 200 }, () => deviceName(random)));
    expect(names.size).toBe(200);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9]{10}$/);
      expect(isDevice(name)).toBe(true);
    }
    expect(deviceName(() => 0)).toBe('0000000000');
    expect(deviceName(() => 0.999999999)).toBe('zzzzzzzzzz');
    expect(deviceName(() => 1)).toBe('zzzzzzzzzz');
  });

  it('keeps its lock and its book under names of their own, apart from the machine’s save', () => {
    expect(RECORDS_LOCK).toBe('medal-pusher-records');
    expect(RECORDS_KEY).not.toBe('medal-pusher-machine');
  });

  it('takes steps straight through to the last, and gives what they come to', () => {
    function* count(): Steps<number> {
      yield;
      yield;
      return 7;
    }
    expect(finish(count())).toBe(7);
  });
});
