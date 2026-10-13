import { describe, expect, it } from 'vitest';

import { ACCOUNT_LIMIT, SEND_EVERY, fromCloud, sizeOf, slotFor, toCloud, type AccountStore, type Slots, type Status } from '@/components/game/MedalPusher/account';
import { booksOf, booksOfText, keepMachine, newMark } from '@/components/game/MedalPusher/savedMachine';
import { advance, createSession, insert, refill, type Session } from '@/components/game/MedalPusher/session';
import { STORAGE_KEY, STORAGE_VERSION, restore, serialize } from '@/components/game/MedalPusher/storage';

import { KEEPALIVE_LIMIT, SCENARIOS, measure, type Scenario } from '../../../../../scripts/medal-pusher-save-size';

import beforeArms from './fixtures/save-before-feed-arms.json';
import beforeLeftAndRight from './fixtures/save-before-left-and-right.json';
import beforeLipChuckers from './fixtures/save-before-lip-chuckers.json';
import beforeSlots from './fixtures/save-before-the-front-slots.json';

const DT = 1 / 60;
/** Tests that run the machine for a good while get room on a slow machine. */
const LONG = 30_000;

/** Plays a machine: a medal into each rail every `every` steps, the purse refilled when it is empty. */
function play(session: Session, seconds: number, every = 30): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (session.credits === 0) refill(session);
    if (i % every === 0) {
      insert(session, 0);
      insert(session, 1);
    }
    advance(session, DT);
  }
}

/** What the account stores and gives back: the state as JSON, there and back. */
const throughTheRoute = (state: object): unknown => JSON.parse(JSON.stringify(state));

describe('the machine on its way to the account', () => {
  it('comes back as the identical machine', { timeout: LONG }, () => {
    const session = createSession(11);
    play(session, 30);
    const text = serialize(session);
    const state = toCloud(text, 'a-mark', 0);
    expect(state).not.toBeNull();
    const back = fromCloud(throughTheRoute(state as object));
    expect(back?.text).toBe(text);
    expect(serialize(restore(back?.text ?? null, 3) as Session)).toBe(text);
  });

  it('is about a third of the size it has on the device', { timeout: LONG }, () => {
    const session = createSession(12);
    const fresh = serialize(session);
    play(session, 40);
    const inPlay = serialize(session);
    for (const text of [fresh, inPlay]) {
      const size = sizeOf(toCloud(text, newMark(), Date.now()) as object);
      expect(size).toBeLessThan(text.length * 0.45);
      expect(size).toBeLessThan(ACCOUNT_LIMIT / 2);
    }
  });

  it('fits the account with room to spare through forty-five seconds of a field crowded on purpose', { timeout: LONG }, () => {
    // What this covers, and no more: one machine (seed 2), forty-five seconds of its own time, measured every half
    // second, with both feeds held down, twelve hundred medals of towers stood on the pusher every twenty seconds
    // and a hundred and fifty thrown on every seven. That is far more than play gives a machine, and by then the
    // field is past five hundred medals. It is not the largest a save gets: the field goes on filling for a few
    // minutes. Five minutes over three seeds is `npx tsx scripts/medal-pusher-save-size.ts`, which takes a minute
    // or two here and several on CI, and is where the sizes quoted for this game come from. This test runs the
    // same `measure` for the shorter while, so that a change which makes saves bigger fails here first.
    const crowded = SCENARIOS.find((scenario) => scenario.crowded);
    expect(crowded).toBeDefined();
    const measured = measure(crowded as Scenario, 2, 45);
    expect(measured.samples).toBe(90);
    // Every one of them comes back from the packing as the text it was.
    expect(measured.changed).toBe(0);
    // It is crowded: over five hundred medals lying, sixty in the air, and too big for the account as it is.
    expect(measured.medals).toBeGreaterThan(500);
    expect(measured.falling).toBeGreaterThan(60);
    expect(measured.deviceMost).toBeGreaterThan(ACCOUNT_LIMIT * 1.4);
    // Packed, it is under nine tenths of what the route takes. It was under three quarters while the slot threw on
    // what the towers' places could not hold, nine medals a second: the hopper pours that four times as fast, so
    // the same forty-five seconds put far more medals on this field (56,081 bytes at the most here, where it was 38,540).
    expect(measured.accountMost).toBeLessThan(ACCOUNT_LIMIT * 0.9);
    // …and the whole request is under what a browser will send as the page is left (64 KiB of body).
    expect(measured.requestMost).toBeGreaterThan(measured.accountMost);
    expect(measured.requestMost).toBeLessThan(KEEPALIVE_LIMIT);
  });

  it('measures a machine the same way each time, and a new one as what it is', () => {
    const ordinary = SCENARIOS[0];
    const [once, again] = [measure(ordinary, 7, 5), measure(ordinary, 7, 5)];
    expect(again).toEqual(once);
    const fresh = serialize(createSession(7));
    expect(once.deviceNew).toBe(fresh.length);
    expect(once.accountNew).toBe(sizeOf(toCloud(fresh, 'a-mark-of-16-hex', 0) as object));
    expect(once.samples).toBe(10);
    expect(once.accountMost).toBeGreaterThanOrEqual(once.accountMean);
    expect(once.accountMean).toBeGreaterThanOrEqual(once.accountNew);
  });

  it.each([
    ['before the feed arms', beforeArms.save, 1],
    ['with one aim for both arms', beforeLeftAndRight.save, 2],
    ['before the chuckers were on the lip', beforeLipChuckers.save, null],
    ['before the slots were at the front', beforeSlots.save, null],
  ])('carries a save written %s to the account and back, to the machine it was', (_name, save, version) => {
    if (version !== null) expect((JSON.parse(save) as { version: number }).version).toBe(version);
    expect((JSON.parse(save) as { version: number }).version).toBeLessThanOrEqual(STORAGE_VERSION);
    const state = toCloud(save, 'old-mark', 0);
    expect(state).not.toBeNull();
    expect(sizeOf(state as object)).toBeLessThan(ACCOUNT_LIMIT / 2);
    const back = fromCloud(throughTheRoute(state as object));
    expect(back?.text).toBe(save);
    const [original, travelled] = [restore(save, 9), restore(back?.text ?? null, 9)];
    expect(original).not.toBeNull();
    expect(serialize(travelled as Session)).toBe(serialize(original as Session));
  });
});

describe('the machine’s books', () => {
  it('are the same from the machine and from its save', () => {
    const session = createSession(3);
    play(session, 5);
    expect(booksOfText(serialize(session))).toBe(booksOf(session));
    expect(JSON.parse(booksOf(session))).toMatchObject({ credits: session.credits, inserted: session.inserted, jackpot: session.jackpot });
    expect(booksOf(session)).not.toContain('medals');
  });

  it('do not change while the machine is only watched, and do when it is played', () => {
    const session = createSession(4);
    const before = booksOf(session);
    // A machine nobody feeds keeps its medals: the pusher goes to and fro and nothing else happens.
    for (let i = 0; i < 600; i++) advance(session, DT);
    session.machine.aims = [session.machine.aims[0] - 2, session.machine.aims[1] + 2];
    expect(serialize(session)).not.toBe(serialize(createSession(4)));
    expect(booksOf(session)).toBe(before);
    insert(session, 0);
    expect(booksOf(session)).not.toBe(before);
  });

  it('are a text of its own for a text that is no save', () => {
    expect(booksOfText('not json')).toBe('not json');
    expect(booksOfText('[1,2]')).toBe('[1,2]');
    expect(booksOfText('null')).toBe('null');
  });

  it('have a mark of sixteen hex digits, a new one each time', () => {
    const marks = new Set(Array.from({ length: 50 }, newMark));
    expect(marks.size).toBe(50);
    for (const mark of marks) expect(mark).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ── The keeper with a real machine on the table ─────────────────────────────

class MapSlots implements Slots {
  map = new Map<string, string>();
  getItem = (key: string): string | null => this.map.get(key) ?? null;
  setItem = (key: string, value: string): void => void this.map.set(key, value);
  removeItem = (key: string): void => void this.map.delete(key);
}

/** An account that keeps what it is given, and counts. */
function fakeAccount() {
  const docs = new Map<string, { state: unknown; updatedAt: number }>();
  const calls: string[] = [];
  const store: AccountStore = {
    load: async (uid) => {
      calls.push('load');
      const found = docs.get(uid);
      return found ? { state: throughTheRoute(found.state as object), updatedAt: new Date(found.updatedAt).toISOString(), serverTime: null } : null;
    },
    store: async (uid, state) => {
      calls.push('store');
      docs.set(uid, { state: throughTheRoute(state), updatedAt: Date.now() });
    },
    prepare: async () => undefined,
    forget: () => undefined,
    storeNow: (uid, state) => {
      calls.push('storeNow');
      docs.set(uid, { state: throughTheRoute(state), updatedAt: Date.now() });
      return Promise.resolve(true);
    },
  };
  return { docs, calls, store };
}

const settled = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** A cabinet with a real machine on its table, kept by the real keeper on a fake device and a fake account. */
function cabinetOn(slots: MapSlots, account: ReturnType<typeof fakeAccount>, clock: { now: number }) {
  const table = { session: null as Session | null, asked: false, reopens: 0, seed: 100 };
  const statuses: Status[] = [];
  const keeping = keepMachine({
    store: account.store,
    slots: () => slots,
    session: () => table.session,
    reopen: () => {
      table.asked = true;
    },
    onStatus: (status) => statuses.push(status),
    now: () => clock.now,
  });
  const open = (): void => {
    const text = keeping.open();
    table.seed += 1;
    table.session = (text === null ? null : restore(text, table.seed)) ?? createSession(table.seed);
    keeping.save('tick');
  };
  const rest = async (): Promise<void> => {
    await settled();
    while (table.asked) {
      table.asked = false;
      table.reopens += 1;
      keeping.save('left');
      open();
      await settled();
    }
  };
  return { table, statuses, keeping, open, rest };
}

describe('a real machine kept on an account', () => {
  it('is found on a second device as the machine it was on the first', { timeout: LONG }, async () => {
    const clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) };
    const account = fakeAccount();
    const uid = 'player-one';

    // The first device: a guest plays, signs in, and the machine becomes the account’s.
    const first = cabinetOn(new MapSlots(), account, clock);
    first.open();
    play(first.table.session as Session, 10);
    first.keeping.player({ uid, settled: true, expected: true });
    await first.rest();
    expect(first.statuses.at(-1)?.where).toBe('account');
    play(first.table.session as Session, 5);
    clock.now += SEND_EVERY * 1000;
    first.keeping.save('tick');
    await first.rest();
    const left = serialize(first.table.session as Session);
    expect(account.docs.size).toBe(1);
    expect(sizeOf(account.docs.get(uid)?.state as object)).toBeLessThan(ACCOUNT_LIMIT / 2);

    // The second device has never seen the player. A guest’s machine stands on it.
    const slots = new MapSlots();
    const second = cabinetOn(slots, account, clock);
    second.keeping.player({ uid, settled: true, expected: false });
    second.open();
    const guests = serialize(second.table.session as Session);
    await second.rest();
    expect(second.table.reopens).toBe(1);
    expect(serialize(second.table.session as Session)).toBe(left);
    // The guest’s machine on the second device is where it was, and the account was not written to.
    expect(slots.map.get(STORAGE_KEY)).toBe(guests);
    expect(slots.map.has(slotFor(STORAGE_KEY, uid))).toBe(true);
    expect(account.calls.filter((call) => call !== 'load')).toEqual(['store', 'store']);
  });

  it('is not sent while nobody plays it, however long it runs', { timeout: LONG }, async () => {
    const clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) };
    const account = fakeAccount();
    const cabinet = cabinetOn(new MapSlots(), account, clock);
    cabinet.keeping.player({ uid: 'player-one', settled: true, expected: true });
    cabinet.open();
    await cabinet.rest();
    const sent = account.calls.filter((call) => call !== 'load').length;
    for (let minute = 0; minute < 5; minute++) {
      for (let i = 0; i < 12; i++) {
        for (let step = 0; step < 20; step++) advance(cabinet.table.session as Session, DT);
        clock.now += 5000;
        cabinet.keeping.save('tick');
      }
      await cabinet.rest();
    }
    cabinet.keeping.save('hidden');
    cabinet.keeping.save('left');
    await cabinet.rest();
    expect(account.calls.filter((call) => call !== 'load').length).toBe(sent);
  });
});
