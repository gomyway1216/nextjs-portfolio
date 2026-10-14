import { describe, expect, it } from 'vitest';

import { ACCOUNT_LIMIT, GUEST, MOMENT_GAP, RETRY_AFTER, fromCloud, toCloud, type AccountStore, type Player, type Standing } from '@/components/game/MedalPusher/account';
import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  ACHIEVEMENT_IDS,
  BEST_IDS,
  COUNTER_IDS,
  LIMITS,
  RECORDS_KEY,
  cardFor,
  claim,
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
  BOOK_LOOK_EVERY,
  BOOK_SEND_EVERY,
  RECORDS_GAME_KEY,
  RECORDS_LOCK,
  SAVE_EVERY,
  WAITING,
  bookKey,
  createRecords,
  deviceName,
  finish,
  localDay,
  printOf,
  settleBooks,
  type RecordsEnv,
  type Steps,
} from '@/components/game/MedalPusher/recordsStore';
import { MAX_STOCK, START_CREDITS, createSession, type Session, type SessionEvent } from '@/components/game/MedalPusher/session';

import { FakeAccounts, RESTORING, settled, signedIn } from './accountFakes';

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
function browser(day: Day = MONDAY, { locks = true, clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) }, name = 'device' }: { locks?: boolean; clock?: { now: number }; name?: string } = {}) {
  const held = new Map<string, string>();
  let marks = 0;
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

  const open = ({
    stepped = false,
    lock = locks ? 'granted' : 'none',
    account = null,
    player = GUEST,
  }: { stepped?: boolean; lock?: 'granted' | 'refused' | 'none'; account?: AccountStore | null; player?: Player } = {}) => {
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
      remove: (key) => {
        disk.touched += 1;
        if (disk.blocked) throw new Error('storage is blocked');
        held.delete(key);
      },
      today: () => today,
      device: () => `${name}${String((named += 1)).padStart(4, '0')}`,
      now: () => clock.now,
      mark: () => `mark-${(marks += 1)}`,
      watch: (given) => {
        handlers = given;
        return () => {
          handlers = null;
        };
      },
      lock: lock === 'granted' ? granted : beside,
      drive: stepped
        ? (steps, done) => void pending.push({ steps, done })
        : (steps, done) => {
            finish(steps);
            done();
          },
    };
    const store = createRecords(env);
    // A page with an account's store says who is playing before anything listens, as the game does.
    if (account) store.attend(player, account);
    let told = 0;
    const tab = {
      store,
      /** Starts listening, as the page does when it is drawn in the browser. Returns what stops it. */
      listen: () => store.subscribe(() => (told += 1)),
      tick: (times = 1) => {
        for (let i = 0; i < times; i++) handlers?.tick();
      },
      changed: (key?: string | null) => handlers?.changed(key),
      leaving: () => handlers?.leaving(),
      watching: () => handlers !== null,
      told: () => told,
      book: () => store.getState().book as RecordBook,
      total: () => viewOf(store.getState().book as RecordBook).total,
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
    /** What storage holds under a name. */
    at: (key: string): string | null => held.get(key) ?? null,
    /** Lets time pass on this device's clock. */
    wait: (seconds: number) => {
      clock.now += seconds * 1000;
    },
    setDay: (next: Day) => {
      today = next;
    },
    stored: () => parseBook(disk.text),
  };
}
type Tab = ReturnType<ReturnType<typeof browser>['open']>;

/** A machine whose counters the book reads, as the cabinet shows it one. (The day's bonus is the medal bank's now: see MedalCenter.) */
function machine(seed = 4) {
  return { session: createSession(seed, { balls: 0 }) };
}

/**
 * As much of a machine as the book looks at: its own counters, and a purse. Making a real machine lays out a whole
 * field of medals, which the tests that open hundreds of tabs have no use for.
 */
const counters = (): Session => ({ inserted: 0, refills: 0, credits: START_CREDITS }) as unknown as Session;
/** A machine's counters for a tab that is one of many. */
function purse() {
  return { session: counters() };
}


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
    expect(WAITING).toEqual({ book: null, day: null, kept: true, where: 'device', fresh: [] });
    // Nothing that is done to it reads or writes.
    const { session } = machine();
    tab.store.note(session, [line]);
    tab.store.clearRecords();
    expect(tab.store.absorb(serializeBook(createBook('other00001')))).toBe(false);
    expect(tab.store.exportBook()).toBeNull();
    expect(tab.store.getState()).toBe(WAITING);
    expect(world.disk).toMatchObject({ reads: 0, writes: 0, touched: 0, text: null });
    expect(tab.watching()).toBe(false);
  });

  it('opens a new book for a new player, names the device, writes it once and tells the page', () => {
    const world = browser();
    const tab = world.open();
    const stop = tab.listen();
    const state = tab.store.getState();
    expect(state).toMatchObject({ day: MONDAY, kept: true, fresh: [] });
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
    const { session } = machine();
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
    const { session } = machine();
    tab.store.note(session, []);
    feed(session, 5);
    tab.store.note(session, [line]);
    tab.tick();
    expect(tab.total().fed).toBe(5);
    expect(tab.store.getState().fresh).toEqual(['firstLine']);
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
    const { session } = machine();
    // Room is made. The next time the book has something to write, it is kept after all.
    world.disk.full = false;
    tab.store.note(session, []);
    feed(session, 1);
    tab.store.note(session, []);
    tab.tick(SAVE_EVERY);
    expect(tab.store.getState().kept).toBe(true);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(1);
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
    tab.store.note(session, [{ type: 'holdFilled' }, { type: 'checker', gate: 0, held: true, gold: false, lucky: false }]);
    session.stock = MAX_STOCK;
    tab.store.note(session, [{ type: 'checker', gate: 1, held: false, gold: false, lucky: false }]);
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

describe('two tabs of the game, one after the other', () => {
  it('hear each other: a tab is told when the other has written', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    const { session } = machine();
    one.store.note(session, []);
    feed(session, 3);
    one.store.note(session, []);
    one.leaving();
    const told = two.told();
    expect(two.total().fed).toBe(0);
    two.changed();
    expect(two.told()).toBe(told + 1);
    expect(two.total().fed).toBe(3);
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
      return purse();
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

  it('count every medal once under the lock, whatever order they play, write and hear in', () => {
    for (const count of [2, 3]) {
      for (let schedule = 0; schedule < 40; schedule++) {
        const rng = seededRng(7000 + 100 * count + schedule);
        const pick = (n: number) => Math.min(n - 1, Math.floor(rng() * n));
        const { world, open } = tabs(count, true);
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
          else if (what === 5 || what === 6) open[who].tick(SAVE_EVERY);
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
        expect(viewOf(world.stored() as RecordBook).total.fed, `tabs ${count}, schedule ${schedule}`).toBe(truth);
        for (const tab of open) expect(tab.total().fed).toBe(truth);
      }
    }
  });

  it('put back what a write made over theirs has taken out of storage, as soon as they hear of it', () => {
    const { world, open } = tabs(2, ['granted', 'refused']);
    const [one, two] = open;
    // The second tab reads, then the first earns a stamp and writes it at once, then the second writes over it.
    const second = counters();
    two.store.note(second, []);
    feed(second, 2);
    two.store.note(second, []);
    two.leaving();
    two.step();
    two.step();
    const first = counters();
    one.store.note(first, []);
    one.store.note(first, [line]);
    one.run();
    expect((world.stored() as RecordBook).stamps.firstLine).toBe(MONDAY);
    two.run();
    expect((world.stored() as RecordBook).stamps.firstLine).toBeUndefined();
    // The first tab hears the write, sees that storage has lost the stamp, and writes it back without waiting for its timer.
    one.changed();
    expect(one.waiting()).toBe(true);
    one.run();
    expect((world.stored() as RecordBook).stamps.firstLine).toBe(MONDAY);
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 2, small: 1 });
  });
});

describe('clearing the records', () => {
  it('wipes the board and the stamps here and in storage, and keeps the days the bonus was taken on', () => {
    const world = browser();
    // A book from before the medal bank paid the bonus: today's was taken here.
    world.disk.text = serializeBook(claim(createBook('device0001'), MONDAY).book);
    const tab = world.open();
    tab.listen();
    const { session } = machine();
    tab.store.note(session, []);
    feed(session, 9);
    tab.store.note(session, [line]);
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
    expect(cardFor(tab.book(), MONDAY).state).toBe('taken');

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

// ── The account ─────────────────────────────────────────────────────────────

// Two players who do not exist. Nothing here is fetched: the account's side is the fake that account.test.ts runs on.
const ANNA = 'account-of-anna';
const BEN = 'account-of-ben';

type World = ReturnType<typeof browser>;

/** Devices with one account's side between them. Each is a browser of its own; they share a clock. */
function devices() {
  const clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) };
  const accounts = new FakeAccounts(() => clock.now);
  return {
    accounts,
    device: (name: string): World => browser(MONDAY, { clock, name }),
    /** The book an account holds, as any device would read it. */
    held: (uid: string): RecordBook | null => parseBook(accounts.text(uid)),
  };
}

/** Opens the game on a device for a player, lets the account answer, and gives the tab with a machine to play on it. */
async function sit(world: World, accounts: FakeAccounts, player: Player = GUEST) {
  const tab = world.open({ account: accounts.store, player });
  const stop = tab.listen();
  await settled();
  const session = counters();
  tab.store.note(session, []);
  return {
    tab,
    store: tab.store,
    /** Closes the page. */
    stop,
    state: () => tab.store.getState(),
    total: () => tab.total(),
    /** Feeds medals, with whatever else the machine says happened. */
    play: (medals: number, events: SessionEvent[] = []) => {
      feed(session, medals);
      tab.store.note(session, events);
    },
    /** Lets seconds pass: on the clock, and on the page's timer with it. */
    pass: (seconds: number) => {
      for (let second = 0; second < seconds; second++) {
        world.wait(1);
        tab.tick();
      }
    },
    /** Says who is playing now. */
    attend: async (next: Player) => {
      tab.store.attend(next, accounts.store);
      await settled();
    },
  };
}

const standing = (over: Partial<Standing>): Standing => ({ account: { kind: 'none' }, device: null, guest: null, skew: 0, ...over });
const asDevice = (book: RecordBook): Standing['device'] => ({ text: serializeBook(book), dirty: false, known: null, sent: null, sentIsLatest: false, changedAt: 0 });
const asAccount = (book: RecordBook): Standing['account'] => ({ kind: 'save', text: serializeBook(book), mark: 'a-mark', updatedAt: 0 });
const some = (device: string, medals: number, day: Day = MONDAY): RecordBook => record(createBook(device), [{ type: 'fed', count: medals }], day);

describe('which copy of the book wins: neither', () => {
  const name = () => 'named00001';

  it('joins the two, as this device’s book, and sends the joined book only when the account lacks some of it', () => {
    const here = some('phone00001', 30);
    const there = some('laptop0001', 20, after(-1));
    const { verdict, fromGuest } = settleBooks(standing({ account: asAccount(there), device: asDevice(here) }), name);
    expect(fromGuest).toBe(false);
    if (verdict.kind !== 'take') throw new Error(`not joined: ${verdict.kind}`);
    const joined = parseBook(verdict.text) as RecordBook;
    expect(joined.device).toBe('phone00001');
    expect(viewOf(joined).total.fed).toBe(50);
    expect(verdict.send).toBe(true);
    // The account already holds everything this device does: the joined book is taken, and nothing is sent, though the
    // two texts differ in whose device each is kept on.
    const both = parseBook(verdict.text) as RecordBook;
    const again = settleBooks(standing({ account: asAccount({ ...both, device: 'laptop0001' }), device: asDevice(here) }), name).verdict;
    expect(again).toEqual({ kind: 'take', text: verdict.text, send: false });
    expect(printOf(serializeBook(both))).toBe(printOf(serializeBook({ ...both, device: 'laptop0001' })));
    expect(printOf(serializeBook(both))).not.toBe(printOf(serializeBook(here)));
    expect(printOf('not a book')).toBe('not a book');
  });

  it('takes the guest’s book into the account’s when this device keeps none for the account, and says so', () => {
    const guest = some('phone00001', 30);
    const there = some('laptop0001', 20);
    const met = settleBooks(standing({ account: asAccount(there), guest: serializeBook(guest) }), name);
    expect(met.fromGuest).toBe(true);
    expect(met.verdict.kind === 'take' && viewOf(parseBook(met.verdict.text) as RecordBook).total.fed).toBe(50);
    // An account with nothing on it gets the book, unless the book has nothing in it either: that is not worth a document.
    expect(settleBooks(standing({ guest: serializeBook(guest) }), name)).toEqual({ verdict: { kind: 'take', text: serializeBook(guest), send: true }, fromGuest: true });
    const blank = serializeBook(createBook('phone00001'));
    expect(settleBooks(standing({ guest: blank }), name)).toEqual({ verdict: { kind: 'take', text: blank, send: false }, fromGuest: true });
    expect(settleBooks(standing({ device: asDevice(guest) }), name)).toEqual({ verdict: { kind: 'take', text: serializeBook(guest), send: true }, fromGuest: false });
  });

  it('holds when the account’s copy cannot be read, and never takes a book under another device’s name', () => {
    const here = some('phone00001', 30);
    expect(settleBooks(standing({ account: { kind: 'unreadable' }, device: asDevice(here) }), name).verdict).toEqual({ kind: 'hold' });
    expect(settleBooks(standing({ account: { kind: 'save', text: '{"v":99}', mark: null, updatedAt: null }, device: asDevice(here) }), name).verdict).toEqual({ kind: 'hold' });
    // Nothing on the table at all: nothing is touched when the account has none, and the account's is taken as a book of this device's own.
    expect(settleBooks(standing({}), name).verdict).toEqual({ kind: 'adopt' });
    const taken = settleBooks(standing({ account: asAccount(some('laptop0001', 20)) }), name);
    expect(taken.fromGuest).toBe(false);
    expect(taken.verdict.kind === 'take' && (parseBook(taken.verdict.text) as RecordBook).device).toBe('named00001');
    expect(taken.verdict.kind === 'take' && taken.verdict.send).toBe(false);
  });
});

describe('the book of a player who is signed in', () => {
  it('touches no account for a guest, and the keeper never writes the book’s own key', async () => {
    const { accounts, device } = devices();
    const phone = device('phone');
    const guest = await sit(phone, accounts);
    guest.play(12, [line]);
    guest.tab.tick(SAVE_EVERY);
    const writes = phone.disk.writes;
    guest.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    guest.tab.leaving();
    await settled();
    expect(accounts.calls).toEqual([]);
    expect(guest.state().where).toBe('device');
    // Only a transaction writes the book: looking at it for the account, every ten seconds, writes nothing.
    expect(phone.disk.writes).toBe(writes);
    expect([...phone.held.keys()]).toEqual([RECORDS_KEY]);
  });

  it('joins a guest’s book with the account’s the first time the account is met here, and moves it: it does not become a second account’s', async () => {
    const { accounts, device, held } = devices();
    // Another device has played on this account already.
    accounts.put(ANNA, serializeBook(record(createBook('tablet0001'), [{ type: 'fed', count: 70 }, { type: 'won', count: 40 }], after(-1))), 'their-mark');
    // Here, a guest has played, and earned a stamp.
    const phone = device('phone');
    const page = await sit(phone, accounts);
    page.play(30, [line]);
    page.tab.tick(SAVE_EVERY);
    const guests = page.tab.book().device;
    expect(viewOf(parseBook(phone.at(RECORDS_KEY)) as RecordBook).total.fed).toBe(30);

    // They sign in. Until the account answers, the book on the table is still the guest's.
    page.store.attend(signedIn(ANNA), accounts.store);
    expect(page.state().where).toBe('checking');
    expect(page.total().fed).toBe(30);
    await settled();
    expect(page.state().where).toBe('account');
    expect(page.total()).toMatchObject({ fed: 100, won: 40, small: 1 });
    expect(page.tab.book().stamps.firstLine).toBe(MONDAY);
    expect(page.tab.book().device).toBe(guests);
    // It is the account's now, under the account's key, and has left the guest's.
    expect(phone.at(RECORDS_KEY)).toBeNull();
    expect(viewOf(parseBook(phone.at(bookKey(ANNA))) as RecordBook).total.fed).toBe(100);
    // The account lacked the guest's part, so it was sent the joined book, once.
    expect(viewOf(held(ANNA) as RecordBook).total).toMatchObject({ fed: 100, won: 40, small: 1 });
    expect(accounts.count('store')).toBe(1);
    expect(Object.keys((held(ANNA) as RecordBook).counters).sort()).toEqual([guests, 'tablet0001'].sort());

    // They sign out: the guest's book is a new one, with nothing of theirs in it and a name of its own.
    await page.attend(GUEST);
    expect(page.state().where).toBe('device');
    expect(page.total().fed).toBe(0);
    expect(page.tab.book().stamps).toEqual({});
    expect(page.tab.book().device).not.toBe(guests);
    expect(page.state().fresh).toEqual([]);
    // Somebody else signs in at the same computer, and gets nothing of the first player's. Their empty book is not
    // worth a document on their account.
    await page.attend(signedIn(BEN));
    expect(page.state().where).toBe('account');
    expect(page.total().fed).toBe(0);
    expect(accounts.text(BEN)).toBeNull();
    page.play(5);
    page.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(BEN) as RecordBook).total.fed).toBe(5);
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(100);
    // And the first player, back again, finds their own.
    await page.attend(signedIn(ANNA));
    expect(page.total()).toMatchObject({ fed: 100, won: 40 });
  });

  it('adds together what two devices have each counted, whichever of them comes to the account second', async () => {
    const { accounts, device, held } = devices();
    const [phone, laptop] = [device('phone'), device('laptop')];
    const a = await sit(phone, accounts, signedIn(ANNA));
    a.play(30);
    a.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(30);

    // The second device opens with the first's counts, and adds its own.
    const b = await sit(laptop, accounts, signedIn(ANNA));
    expect(b.total().fed).toBe(30);
    b.play(20);
    b.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(50);

    // The first has played on meanwhile, without hearing of the second. Loaded again, it has both, and so has the account.
    a.play(5);
    a.tab.tick(SAVE_EVERY);
    expect(a.total().fed).toBe(35);
    // Leaving the cabinet sends what has not gone, joined with what the account has come to hold meanwhile.
    a.stop();
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(55);
    const again = await sit(phone, accounts, signedIn(ANNA));
    expect(again.total().fed).toBe(55);
    expect(Object.keys((held(ANNA) as RecordBook).counters)).toHaveLength(2);
    b.stop();
    expect((await sit(laptop, accounts, signedIn(ANNA))).total().fed).toBe(55);
  });

  it('clears the account’s book with this device’s, and the other device’s when it next reaches the account', async () => {
    const { accounts, device, held } = devices();
    const [phone, laptop] = [device('phone'), device('laptop')];
    const a = await sit(phone, accounts, signedIn(ANNA));
    a.play(30, [line]);
    // A book from before the medal bank paid the bonus, with today's taken.
    a.store.absorb(serializeBook(claim(createBook('older00001'), MONDAY).book));
    await settled();
    a.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    await settled();
    const b = await sit(laptop, accounts, signedIn(ANNA));
    b.play(20);
    b.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(50);

    // The second device clears the records. The account's are cleared at once.
    b.pass(MOMENT_GAP);
    const sent = accounts.count('store');
    b.store.clearRecords();
    await settled();
    expect(accounts.count('store')).toBe(sent + 1);
    expect(held(ANNA)).toMatchObject({ era: 1, counters: {}, stamps: {} });
    // The day the bonus was taken stays, on the account as here: clearing is not a way to take it again.
    expect(hasDay((held(ANNA) as RecordBook).claimed, MONDAY)).toBe(true);

    // The first device still shows its own, and has played on. When it next reaches the account its old records go:
    // what it counted before the clearing does not come back, there or here.
    a.play(7);
    a.tab.tick(SAVE_EVERY);
    expect(a.total().fed).toBe(37);
    a.stop();
    const again = await sit(phone, accounts, signedIn(ANNA));
    expect(again.tab.book().era).toBe(1);
    expect(again.total().fed).toBe(0);
    expect(again.tab.book().stamps).toEqual({});
    expect(cardFor(again.tab.book(), MONDAY).state).toBe('taken');
    expect(viewOf(parseBook(phone.at(bookKey(ANNA))) as RecordBook).total.fed).toBe(0);
    expect(held(ANNA)).toMatchObject({ era: 1, counters: {} });
  });

  it('leaves a copy on the account that it cannot read exactly as it is, and keeps this device’s book on this device', async () => {
    const { accounts, device } = devices();
    for (const state of [{ format: 99, data: 'from a later game' }, toCloud(JSON.stringify({ v: 99, device: 'tablet0001' }), 'their-mark', 0)]) {
      accounts.docs.set(ANNA, { state, updatedAt: 1 });
      accounts.calls.length = 0;
      const world = device('phone');
      const page = await sit(world, accounts, signedIn(ANNA));
      expect(page.state().where).toBe('unreadable');
      page.play(30, [line]);
      page.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
      page.tab.leaving();
      page.stop();
      await settled();
      expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
      expect(accounts.docs.get(ANNA)).toEqual({ state, updatedAt: 1 });
      // What was played is kept here.
      expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 30, small: 1 });
    }
  });

  it('reads the account before every write, so that what another device has written since is not wiped out', async () => {
    const { accounts, device, held } = devices();
    const a = await sit(device('phone'), accounts, signedIn(ANNA));
    const b = await sit(device('laptop'), accounts, signedIn(ANNA));
    a.play(10);
    a.pass(BOOK_LOOK_EVERY);
    await settled();
    // The second device, open all the while, earns a stamp and is given a book from before the medal bank paid the
    // bonus, with today's taken. Both go up.
    b.play(20, [line]);
    b.store.absorb(serializeBook(claim(createBook('older00001'), MONDAY).book));
    await settled();
    b.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total).toMatchObject({ fed: 30, claims: 1 });

    // The first device has heard none of it. Its next write, five minutes on, carries what it has counted and leaves
    // what the other wrote where it is.
    expect(cardFor(a.tab.book(), MONDAY).state).toBe('ready');
    a.play(5);
    a.pass(BOOK_SEND_EVERY);
    await settled();
    const there = held(ANNA) as RecordBook;
    expect(viewOf(there).total).toMatchObject({ fed: 35, claims: 1, small: 1 });
    expect(hasDay(there.claimed, MONDAY)).toBe(true);
    // And reading told this device what it had missed: the day is taken here too, without the page being loaded again.
    expect(cardFor(a.tab.book(), MONDAY).state).toBe('taken');
    expect(a.total()).toMatchObject({ fed: 35, claims: 1 });
    expect(a.tab.book().stamps.firstLine).toBe(MONDAY);

    // What it learnt is news to the keeper, which has it sent in its turn. The account holds all of it already, so
    // the account is read and nothing is written.
    const [reads, writes] = [accounts.count('load'), accounts.count('store')];
    a.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    await settled();
    expect(accounts.count('load')).toBe(reads + 1);
    expect(accounts.count('store')).toBe(writes);

    // A copy this page cannot read, put there since it last asked, is not written over either.
    a.pass(BOOK_LOOK_EVERY);
    const later = { state: { format: 99, data: 'from a later game' }, updatedAt: 1 };
    accounts.docs.set(ANNA, later);
    a.play(1, [{ type: 'toppled', count: 1 }]);
    a.pass(MOMENT_GAP + BOOK_LOOK_EVERY);
    await settled();
    expect(accounts.docs.get(ANNA)).toEqual(later);
    expect(accounts.count('store')).toBe(writes);
    expect(a.total().towers).toBe(1);
  });

  it('keeps on this device what a player had not sent when they signed out, sends nothing as them afterwards, and sends it when they are back', async () => {
    const { accounts, device, held } = devices();
    const [phone, laptop] = [device('phone'), device('laptop')];
    const a = await sit(phone, accounts, signedIn(ANNA));
    a.play(10);
    a.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(10);
    // More is counted, and they sign out before its five minutes are up, and before it has even been written here.
    a.play(40);
    const calls = accounts.calls.length;
    await a.attend(GUEST);
    expect(accounts.forgotten).toEqual([ANNA]);
    expect(a.total().fed).toBe(0);
    // Nothing goes to the account as them: not now, not on the clock, and not as the page is left.
    a.play(3);
    a.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    a.tab.leaving();
    await settled();
    expect(accounts.calls.slice(calls)).toEqual([]);
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(10);
    // It is all under their own key on this device.
    expect(viewOf(parseBook(phone.at(bookKey(ANNA))) as RecordBook).total.fed).toBe(50);

    // Signed in on another device, they find what the account has.
    const b = await sit(laptop, accounts, signedIn(ANNA));
    expect(b.total().fed).toBe(10);
    // Back on the first, the rest goes up, and the guest's three medals stay the guest's.
    await a.attend(signedIn(ANNA));
    expect(a.total().fed).toBe(50);
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(50);
    expect(viewOf(parseBook(phone.at(RECORDS_KEY)) as RecordBook).total.fed).toBe(3);
  });

  it('goes to the account at once for a stamp, every five minutes otherwise, and when the page is hidden, and never in the way that outlives the page', async () => {
    const { accounts, device, held } = devices();
    const a = await sit(device('phone'), accounts, signedIn(ANNA));
    const sends = () => accounts.count('store');
    // Nothing has been counted: nothing is sent.
    a.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(sends()).toBe(0);
    // The first medals go up the next time the keeper looks.
    a.play(10);
    a.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(sends()).toBe(1);
    // After that, medals wait for the five minutes.
    a.play(10);
    a.pass(BOOK_SEND_EVERY - BOOK_LOOK_EVERY);
    await settled();
    expect(sends()).toBe(1);
    a.pass(BOOK_LOOK_EVERY);
    await settled();
    expect(sends()).toBe(2);
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(20);
    // A stamp does not wait, beyond the few seconds any two writes are kept apart by.
    a.play(1, [line]);
    await settled();
    expect(sends()).toBe(2);
    a.pass(MOMENT_GAP);
    await settled();
    expect(sends()).toBe(3);
    expect((held(ANNA) as RecordBook).stamps.firstLine).toBe(MONDAY);
    // A page that is hidden sends what has not gone, and says it once.
    a.pass(MOMENT_GAP);
    a.play(4);
    a.tab.leaving();
    await settled();
    expect(sends()).toBe(4);
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(25);
    a.tab.leaving();
    a.stop();
    await settled();
    expect(sends()).toBe(4);
    // A page left with nothing new says nothing.
    const again = await sit(device('laptop'), accounts, signedIn(ANNA));
    again.tab.leaving();
    again.stop();
    await settled();
    expect(sends()).toBe(4);
    // Nothing was ever sent in the way that outlives the page, and no token was got ready for it.
    expect([accounts.count('storeNow'), accounts.count('prepare')]).toEqual([0, 0]);
  });

  it('tries an account it could not reach again when its wait is over, and says where the book is meanwhile', async () => {
    const { accounts, device, held } = devices();
    accounts.down = true;
    const a = await sit(device('phone'), accounts, signedIn(ANNA));
    expect(a.state()).toMatchObject({ where: 'offline', kept: true });
    a.play(10);
    accounts.down = false;
    a.pass(RETRY_AFTER[0] + BOOK_LOOK_EVERY);
    await settled();
    expect(a.state().where).toBe('account');
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(10);
    // A write that fails is tried again after its wait, not after the book's five minutes.
    accounts.down = true;
    a.play(1, [line]);
    a.pass(MOMENT_GAP + BOOK_LOOK_EVERY);
    await settled();
    expect(a.state().where).toBe('offline');
    accounts.down = false;
    a.pass(RETRY_AFTER[0] + BOOK_LOOK_EVERY);
    await settled();
    expect(a.state().where).toBe('account');
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(11);
  });

  it('does not count twice what another tab of this device counted, when it hears of it from the account before it reads it here', async () => {
    const { accounts, device } = devices();
    const world = device('phone');
    const one = await sit(world, accounts, signedIn(ANNA));
    const two = await sit(world, accounts, signedIn(ANNA));
    // Two tabs of one browser count into the same row of the book.
    expect(two.tab.book().device).toBe(one.tab.book().device);
    two.play(100);
    two.pass(BOOK_LOOK_EVERY);
    await settled();
    // The first tab has not looked at storage since. A stamp of its own goes to the account at once, and the write reads
    // the account first, which tells it of the hundred.
    expect(one.total().fed).toBe(0);
    one.play(1, [line]);
    one.pass(MOMENT_GAP + BOOK_LOOK_EVERY);
    await settled();
    one.tab.tick(SAVE_EVERY);
    expect(one.total().fed).toBe(101);
    expect(viewOf(parseBook(world.at(bookKey(ANNA))) as RecordBook).total.fed).toBe(101);
    // And what it counts itself from here is added, once.
    one.play(5);
    one.tab.tick(SAVE_EVERY);
    two.tab.changed(bookKey(ANNA));
    expect([one.total().fed, two.total().fed]).toEqual([106, 106]);
  });

  it('reads storage when another tab has written this player’s book, and not for anything else another tab writes', async () => {
    const { accounts, device } = devices();
    const world = device('phone');
    const one = await sit(world, accounts, signedIn(ANNA));
    const two = await sit(world, accounts, signedIn(ANNA));
    two.play(7);
    two.tab.tick(SAVE_EVERY);
    const touched = world.disk.touched;
    one.tab.changed('medal-pusher');
    one.tab.changed(RECORDS_KEY);
    one.tab.changed(bookKey(BEN));
    expect(world.disk.touched).toBe(touched);
    expect(one.total().fed).toBe(0);
    one.tab.changed(bookKey(ANNA));
    expect(world.disk.touched).toBe(touched + 1);
    expect(one.total().fed).toBe(7);
  });

  it('moves the guest’s book into the account once, from two tabs of a player who has signed in', async () => {
    const { accounts, device, held } = devices();
    const world = device('phone');
    // A guest has played in one tab. Signed in, the two tabs of this browser each hear from the account.
    const one = await sit(world, accounts);
    one.play(12);
    one.tab.tick(SAVE_EVERY);
    const two = await sit(world, accounts);
    await one.attend(signedIn(ANNA));
    await two.attend(signedIn(ANNA));
    expect(world.at(RECORDS_KEY)).toBeNull();
    // The guest's medals are in the account's book once, in whichever tab it is read.
    one.tab.tick(SAVE_EVERY);
    two.tab.tick(SAVE_EVERY);
    two.tab.changed();
    expect([one.total().fed, two.total().fed]).toEqual([12, 12]);
    expect(viewOf(parseBook(world.at(bookKey(ANNA))) as RecordBook).total.fed).toBe(12);
    // Both send what they have: the account holds the guest's medals once.
    one.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    two.pass(BOOK_SEND_EVERY + BOOK_LOOK_EVERY);
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total).toMatchObject({ fed: 12 });
  });

  it('opens with the book of whoever played here last while the site is still finding out who is signed in, and touches no account until it knows', async () => {
    const { accounts, device, held } = devices();
    const world = device('phone');
    const first = await sit(world, accounts, signedIn(ANNA));
    first.play(25, [line]);
    first.pass(BOOK_LOOK_EVERY);
    first.stop();
    await settled();
    expect(viewOf(held(ANNA) as RecordBook).total.fed).toBe(25);

    // The page is loaded again. The site expects somebody and has not yet said who.
    const calls = accounts.calls.length;
    const page = await sit(world, accounts, RESTORING);
    expect(page.total()).toMatchObject({ fed: 25, small: 1 });
    expect(page.state().where).toBe('device');
    expect(accounts.calls.slice(calls)).toEqual([]);
    // It is them: the account is asked now, and the book stays theirs.
    await page.attend(signedIn(ANNA));
    expect(page.state().where).toBe('account');
    expect(page.total().fed).toBe(25);
    page.stop();

    // Another time it turns out that nobody is signed in after all: their book leaves the table for a guest's.
    const other = await sit(world, accounts, RESTORING);
    expect(other.total().fed).toBe(25);
    const before = accounts.calls.length;
    await other.attend(GUEST);
    expect(other.total().fed).toBe(0);
    expect(other.state().where).toBe('device');
    expect(accounts.calls.slice(before)).toEqual([]);
    // Theirs is still under their own key, for when they are back.
    expect(viewOf(parseBook(world.at(bookKey(ANNA))) as RecordBook).total.fed).toBe(25);
  });

  it('is a small part of what the account takes, however full the book is', () => {
    // The fullest book there can be: every counter at its most on every device it has room for, every best, every
    // stamp, and every day of four years played and taken.
    const days: Record<string, number> = {};
    for (let month = 0; month < LIMITS.months; month++) days[`${2026 + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`] = 2 ** 31 - 1;
    const row = Object.fromEntries(COUNTER_IDS.map((id) => [id, LIMITS.count]));
    const fullest = parseBook(
      JSON.stringify({
        v: 1,
        device: 'zzzzzzzzzzzzzzzz',
        era: LIMITS.eras,
        counters: Object.fromEntries(Array.from({ length: LIMITS.devices }, (_, index) => [`zzzzzzzzzzzzzzz${index}`, row])),
        bests: Object.fromEntries(BEST_IDS.map((id) => [id, LIMITS.count])),
        stamps: Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, '2026-10-12'])),
        played: days,
        claimed: days,
      }),
    ) as RecordBook;
    expect(Object.keys(fullest.counters)).toHaveLength(LIMITS.devices);
    expect(Object.keys(fullest.claimed)).toHaveLength(LIMITS.months);
    const text = serializeBook(fullest);
    const state = toCloud(text, 'a-mark-of-16-hex', Date.UTC(2099, 11, 31));
    if (!state) throw new Error('the fullest book cannot be sent at all');
    expect(fromCloud(state)?.text).toBe(text);
    const request = new TextEncoder().encode(JSON.stringify({ gameKey: RECORDS_GAME_KEY, state })).length;
    // About 7 KB, of the 64 KB the route takes. It is never sent as the page is left, so it takes nothing from what a
    // browser allows the machine's leaving write.
    expect(request).toBeLessThan(ACCOUNT_LIMIT / 8);
    expect(request).toBeGreaterThan(text.length);
  });
});
