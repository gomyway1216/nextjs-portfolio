import { describe, expect, it } from 'vitest';

import {
  BONUS_CARD,
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
import { SAVE_EVERY, WAITING, createRecords, deviceName, localDay, type Records, type RecordsEnv } from '@/components/game/MedalPusher/recordsStore';
import { MAX_STOCK, START_CREDITS, createSession, grant, type Session, type SessionEvent } from '@/components/game/MedalPusher/session';

const MONDAY: Day = '2026-10-12';
const after = (days: number): Day => dayOf((dayNumber(MONDAY) as number) + days);
const line: SessionEvent = { type: 'spinEnd', result: { tier: 'small', digits: [2, 2, 2], reach: true, reachKind: 'normal' } };

/**
 * A browser for the store to live in: one storage, which can be blocked or
 * full, one clock, and as many tabs as are opened. Each tab is a store of its
 * own with the timer and the events it would be given, to be fired by hand.
 */
function browser(day: Day = MONDAY) {
  const disk = { text: null as string | null, blocked: false, full: false, reads: 0, writes: 0 };
  let today = day;
  let named = 0;
  const open = () => {
    let handlers: Parameters<RecordsEnv['watch']>[0] | null = null;
    const env: RecordsEnv = {
      read: () => {
        disk.reads += 1;
        if (disk.blocked) throw new Error('storage is blocked');
        return disk.text;
      },
      write: (text) => {
        if (disk.blocked || disk.full) throw new Error('storage is full');
        disk.writes += 1;
        disk.text = text;
      },
      today: () => today,
      device: () => `device${String((named += 1)).padStart(4, '0')}`,
      watch: (given) => {
        handlers = given;
        return () => {
          handlers = null;
        };
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
    };
    return tab;
  };
  return {
    disk,
    open,
    setDay: (next: Day) => {
      today = next;
    },
    stored: () => parseBook(disk.text),
  };
}

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
    expect(WAITING).toEqual({ book: null, day: null, kept: true, purse: false, fresh: [], claims: 0, paid: 0 });
    // Nothing that is done to it reads or writes, and nothing is paid.
    const { session, paid } = machine(tab.store);
    tab.store.note(session, [line]);
    expect(tab.store.claimBonus()).toBe(0);
    tab.store.clearRecords();
    expect(tab.store.absorb(serializeBook(createBook('other00001')))).toBe(false);
    expect(tab.store.exportBook()).toBeNull();
    expect(tab.store.getState()).toBe(WAITING);
    expect(world.disk).toMatchObject({ reads: 0, writes: 0, text: null });
    expect(paid).toEqual([]);
    expect(tab.watching()).toBe(false);
  });

  it('opens a new book for a new player, names the device, writes it once and tells the page', () => {
    const world = browser();
    const tab = world.open();
    const stop = tab.listen();
    const state = tab.store.getState();
    expect(state).toMatchObject({ day: MONDAY, kept: true, purse: false, fresh: [], claims: 0, paid: 0 });
    expect(state.book).toEqual(createBook('device0001'));
    expect(isDevice(state.book?.device)).toBe(true);
    expect(world.stored()).toEqual(createBook('device0001'));
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
  });

  it('finds the book it left, on the same device', () => {
    const world = browser();
    const first = world.open();
    const stop = first.listen();
    const { session } = machine(first.store);
    first.store.note(session, []);
    feed(session, 7);
    first.store.note(session, [{ type: 'won', count: 3 }]);
    stop();
    expect(viewOf(world.stored() as RecordBook).total).toMatchObject({ fed: 7, won: 3 });
    // The page is loaded again: the same book, the same device, and nothing written until there is something new.
    const writes = world.disk.writes;
    const again = world.open();
    again.listen();
    expect(again.book().device).toBe('device0001');
    expect(again.total()).toMatchObject({ fed: 7, won: 3 });
    expect(world.disk.writes).toBe(writes);
  });

  it('starts again with a new book when what is stored is not one', () => {
    const world = browser();
    world.disk.text = '{"v":1,"device":"x"}';
    const tab = world.open();
    tab.listen();
    expect(tab.book()).toEqual(createBook('device0001'));
    expect(world.stored()).toEqual(createBook('device0001'));
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
    expect(tab.total().fed).toBe(5);
    expect(tab.store.getState().fresh).toEqual(['firstLine']);
    // Nothing would remember that a day had been paid, so no day is.
    expect(tab.store.claimBonus()).toBe(0);
    expect(paid).toEqual([]);
    expect(session.credits).toBe(START_CREDITS - 5);
    tab.tick(SAVE_EVERY * 3);
    tab.leaving();
    expect(world.disk.writes).toBe(0);
  });

  it('says the book is not kept when storage reads but will not write, and that it is once it will', () => {
    const world = browser();
    world.disk.full = true;
    const tab = world.open();
    tab.listen();
    expect(tab.store.getState().kept).toBe(false);
    const { session, paid } = machine(tab.store);
    expect(tab.store.claimBonus()).toBe(0);
    expect(paid).toEqual([]);
    // Room is made. The next time the book has something to write, it is kept after all, and the bonus is there.
    world.disk.full = false;
    tab.store.note(session, []);
    feed(session, 1);
    tab.store.note(session, []);
    tab.tick(SAVE_EVERY);
    expect(tab.store.getState().kept).toBe(true);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(1);
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[0]);
  });
});

describe('hearing what the machine did', () => {
  it('counts from when it first sees a machine, so nothing in a restored save is counted again', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const session = createSession(4, { balls: 0 });
    // A machine out of its save: medals fed, refills taken and a full hold, all from before.
    session.inserted = 500;
    session.refills = 3;
    session.stock = MAX_STOCK;
    tab.store.note(session, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 0, refills: 0, fulls: 0 });
    feed(session, 2);
    tab.store.note(session, []);
    session.refills += 1;
    tab.store.note(session, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 2, refills: 1, fulls: 0 });
  });

  it('reads medals fed, refills and the hold filling off the machine’s own counters, and the rest from its events', () => {
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
    // The hold fills: that is said once, when it happens, and again only after it has emptied a little and filled anew.
    session.stock = MAX_STOCK - 1;
    tab.store.note(session, [{ type: 'checker', gate: 0, held: true }]);
    session.stock = MAX_STOCK;
    tab.store.note(session, [{ type: 'checker', gate: 1, held: true }]);
    tab.store.note(session, [{ type: 'checker', gate: 1, held: false }]);
    tab.store.note(session, []);
    session.stock = MAX_STOCK - 1;
    tab.store.note(session, []);
    session.stock = MAX_STOCK;
    tab.store.note(session, []);
    tab.tick();
    expect(tab.total()).toMatchObject({ fed: 3, won: 2, hits: 3, wasted: 1, fulls: 2 });
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
    expect(world.disk.writes).toBe(writes);
    // A tick with nothing new draws nothing.
    tab.tick();
    expect(tab.told()).toBe(told + 1);
    tab.tick(SAVE_EVERY - 2);
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
    expect(tab.store.claimBonus()).toBe(0);
    const { session, paid } = machine(tab.store);
    expect(tab.store.getState().purse).toBe(true);
    expect(cardFor(tab.book(), MONDAY).state).toBe('ready');
    expect(session.credits).toBe(START_CREDITS);

    expect(tab.store.claimBonus()).toBe(BONUS_CARD[0]);
    expect(paid).toEqual([BONUS_CARD[0]]);
    expect(session.credits).toBe(START_CREDITS + BONUS_CARD[0]);
    expect(tab.store.getState()).toMatchObject({ claims: 1, paid: BONUS_CARD[0], day: MONDAY });
    expect(cardFor(tab.book(), MONDAY).state).toBe('taken');
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(true);
    expect(tab.total()).toMatchObject({ claims: 1, bonus: BONUS_CARD[0], fed: 0, won: 0 });

    // It is not there a second time.
    expect(tab.store.claimBonus()).toBe(0);
    expect(paid).toEqual([BONUS_CARD[0]]);
    expect(session.credits).toBe(START_CREDITS + BONUS_CARD[0]);
    expect(tab.store.getState().claims).toBe(1);
  });

  it('is not offered again when the page is loaded again that day, and is the next day', () => {
    const world = browser();
    const first = world.open();
    const stop = first.listen();
    machine(first.store);
    expect(first.store.claimBonus()).toBe(BONUS_CARD[0]);
    stop();

    const again = world.open();
    again.listen();
    const { paid } = machine(again.store);
    expect(cardFor(again.book(), MONDAY).state).toBe('taken');
    // The page that took it plays the stamp's ceremony; a page that finds it taken does not.
    expect(again.store.getState()).toMatchObject({ claims: 0, paid: 0 });
    expect(again.store.claimBonus()).toBe(0);
    expect(paid).toEqual([]);

    world.setDay(after(1));
    expect(again.store.claimBonus()).toBe(BONUS_CARD[1]);
    expect(paid).toEqual([BONUS_CARD[1]]);
  });

  it('becomes ready at midnight on a page that is left open, by its timer', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { paid } = machine(tab.store);
    tab.store.claimBonus();
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
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[1]);
    expect(paid).toEqual([BONUS_CARD[0], BONUS_CARD[1]]);
  });

  it('pays each day once however the clock is moved', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { paid } = machine(tab.store);
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[0]);
    // Forward three days: a missed day, so the first square of a new card, and it is taken.
    world.setDay(after(3));
    tab.tick();
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[0]);
    // Back again: nothing is ready on the days before the one that was stamped, nor on that day when it comes.
    for (const days of [0, 1, 2, 3]) {
      world.setDay(after(days));
      tab.tick();
      expect(tab.store.claimBonus()).toBe(0);
    }
    world.setDay(after(4));
    tab.tick();
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[1]);
    expect(paid).toEqual([BONUS_CARD[0], BONUS_CARD[0], BONUS_CARD[1]]);
    // A clock set off the calendar altogether has no bonus.
    world.setDay('2150-01-01');
    tab.tick();
    expect(tab.store.claimBonus()).toBe(0);
  });

  it('pays nothing, and takes nothing, when the day cannot be written down', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    const { session, paid } = machine(tab.store);
    const before = tab.book();
    world.disk.full = true;
    expect(tab.store.claimBonus()).toBe(0);
    expect(paid).toEqual([]);
    expect(session.credits).toBe(START_CREDITS);
    expect(tab.book()).toBe(before);
    expect(tab.store.getState()).toMatchObject({ kept: false, claims: 0 });
    expect(hasDay((world.stored() as RecordBook).claimed, MONDAY)).toBe(false);
  });

  it('takes nothing when the machine will not be paid, and puts storage back', () => {
    const world = browser();
    const tab = world.open();
    tab.listen();
    tab.store.openPurse(() => false);
    const before = serializeBook(tab.book());
    expect(tab.store.claimBonus()).toBe(0);
    expect(serializeBook(tab.book())).toBe(before);
    expect(world.disk.text).toBe(before);
    expect(tab.store.getState().claims).toBe(0);
    // With a purse that takes it, it is still there to be taken.
    const { paid } = machine(tab.store);
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[0]);
    expect(paid).toEqual([BONUS_CARD[0]]);
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
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[0]);
    expect(old.paid).toEqual([]);
    expect(now.paid).toEqual([BONUS_CARD[0]]);
    now.close();
    expect(tab.store.getState().purse).toBe(false);
    world.setDay(after(1));
    expect(tab.store.claimBonus()).toBe(0);
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
    expect(tab.store.claimBonus()).toBe(BONUS_CARD[6]);
    expect(tab.store.getState().fresh).toEqual(['week']);
    expect(world.stored()?.stamps).toEqual({ week: after(6) });
  });
});

describe('two tabs of the game', () => {
  it('pay a day’s bonus once between them', () => {
    const world = browser();
    const [one, two] = [world.open(), world.open()];
    one.listen();
    two.listen();
    expect(two.book().device).toBe('device0001');
    const [first, second] = [machine(one.store, 4), machine(two.store, 5)];
    // Both show it ready. The first takes it; the second looks at what is stored before it pays, and does not.
    expect(cardFor(two.book(), MONDAY).state).toBe('ready');
    expect(one.store.claimBonus()).toBe(BONUS_CARD[0]);
    expect(two.store.claimBonus()).toBe(0);
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
    one.store.claimBonus();
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
    expect(one.total().fed).toBe(7);
    expect(two.total().fed).toBe(7);
    feed(first, 10);
    one.store.note(first, []);
    one.tick(SAVE_EVERY);
    two.tick(SAVE_EVERY);
    two.changed();
    expect(two.total().fed).toBe(17);
    expect(viewOf(world.stored() as RecordBook).total.fed).toBe(17);
    expect(Object.keys((world.stored() as RecordBook).counters)).toEqual(['device0001']);
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
    tab.store.claimBonus();
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
    expect(tab.store.claimBonus()).toBe(0);
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
    expect(tab.book().device).toBe('device0001');
    expect(tab.book().stamps).toEqual({ firstLine: after(-2) });
    // A stamp earned elsewhere was announced there, and is not announced here.
    expect(tab.store.getState().fresh).toEqual([]);
    expect(world.stored()).toEqual(tab.book());
    // The phone took today's bonus: it is taken here.
    const { paid } = machine(tab.store);
    expect(tab.store.claimBonus()).toBe(0);
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
    expect(tab.book().stamps).toEqual({});
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
});
