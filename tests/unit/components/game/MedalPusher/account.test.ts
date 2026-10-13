import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_LIMIT,
  CLOUD_FORMAT,
  GUEST,
  MOMENT_GAP,
  RETRY_AFTER,
  SEND_EVERY,
  createSync,
  decide,
  fromCloud,
  sizeOf,
  slotFor,
  toCloud,
  type AccountStore,
  type Kept,
  type Player,
  type Slots,
  type Standing,
  type Status,
  type Sync,
  type Verdict,
} from '@/components/game/MedalPusher/account';

// Everything here runs on fakes: a clock that is moved by hand, a storage that is a map, and an account that is
// another map behind promises. Nothing is fetched and no real account is named.

/** A document for the tests: its books are what is worth sending, and its field is what changes all the time. */
const doc = (books: number, field = 0): string => JSON.stringify({ ok: true, books, field });
const booksIn = (text: string | null): number | null => (text === null ? null : (JSON.parse(text) as { books: number }).books);

class FakeSlots implements Slots {
  map = new Map<string, string>();
  /** Storage that is blocked: every call throws. */
  blocked = false;
  /** Storage that is full: nothing more can be written, and what is there can be read and removed. */
  full = false;
  getItem(key: string): string | null {
    if (this.blocked) throw new Error('blocked');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.blocked || this.full) throw new Error(this.full ? 'full' : 'blocked');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.blocked) throw new Error('blocked');
    this.map.delete(key);
  }
}

/** The account's side: one document for each account, a clock of its own, and a way to be down. */
class FakeAccounts {
  docs = new Map<string, { state: unknown; updatedAt: number }>();
  calls: string[] = [];
  /** The account cannot be reached: reads and writes fail. */
  down = false;
  /** The server's clock less the device's. */
  ahead = 0;
  /** The accounts a token is in hand for, and the ones whose token it has been told to let go of. */
  ready = new Set<string>();
  forgotten: string[] = [];
  /**
   * Writes that have been sent and not yet answered, when the test wants to answer them itself: as taken, as
   * refused, or as taken with the answer lost on its way back. One can also be made to land first and be answered
   * later, with another call.
   */
  held: ((how?: 'taken' | 'refused' | 'answer lost' | 'lands') => void)[] | null = null;
  /** The same for reads: each waits here to be answered. */
  heldReads: (() => void)[] | null = null;
  /** A write made as the page is left is sent and never heard of again. */
  silent = false;

  constructor(private readonly device: () => number) {}

  time(): number {
    return this.device() + this.ahead;
  }
  /** Puts a copy on an account as another device would have. */
  put(uid: string, text: string, mark: string, at = this.time()): void {
    this.docs.set(uid, { state: toCloud(text, mark, at), updatedAt: at });
  }
  /** The text of an account's copy. */
  text(uid: string): string | null {
    const found = this.docs.get(uid);
    return found ? (fromCloud(found.state)?.text ?? null) : null;
  }
  count(kind: 'load' | 'store' | 'storeNow' | 'prepare'): number {
    return this.calls.filter((call) => call.split(' ')[0] === kind).length;
  }

  store: AccountStore = {
    load: async (uid) => {
      this.calls.push(`load ${uid}`);
      if (this.heldReads) {
        const waiting = this.heldReads;
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      if (this.down) throw new Error('unreachable');
      const found = this.docs.get(uid);
      return found ? { state: JSON.parse(JSON.stringify(found.state)) as unknown, updatedAt: new Date(found.updatedAt).toISOString(), serverTime: new Date(this.time()).toISOString() } : null;
    },
    store: (uid, state) => {
      this.calls.push(`store ${uid}`);
      const write = (): void => {
        this.docs.set(uid, { state: JSON.parse(JSON.stringify(state)) as unknown, updatedAt: this.time() });
      };
      if (this.held) {
        const held = this.held;
        let landed = false;
        return new Promise<void>((resolve, reject) => {
          held.push((how = 'taken') => {
            if (how !== 'refused' && !landed) write();
            landed = true;
            if (how === 'lands') return;
            if (how === 'taken') resolve();
            else reject(new Error(how));
          });
        });
      }
      if (this.down) return Promise.reject(new Error('unreachable'));
      write();
      return Promise.resolve();
    },
    prepare: async (uid) => {
      this.calls.push(`prepare ${uid}`);
      if (!this.down) this.ready.add(uid);
    },
    forget: (uid) => {
      this.forgotten.push(uid);
      this.ready.delete(uid);
    },
    storeNow: (uid, state) => {
      if (!this.ready.has(uid)) return null;
      this.calls.push(`storeNow ${uid}`);
      if (this.silent) return new Promise<boolean>(() => undefined);
      if (this.down) return Promise.resolve(false);
      this.docs.set(uid, { state: JSON.parse(JSON.stringify(state)) as unknown, updatedAt: this.time() });
      return Promise.resolve(true);
    },
  };
}

/** Lets everything that has been promised happen. */
const settled = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const signedIn = (uid: string): Player => ({ uid, settled: true, expected: true });
/** The site still restoring a session it expects: nobody yet, and somebody expected. */
const RESTORING: Player = { uid: null, settled: false, expected: true };

const SLOT = 'machine';
/** What a new document is, when there is nothing to open with. */
const NEW = doc(0);

/**
 * A cabinet around the keeper, doing what the real one does: it opens with
 * what it is given or with a new document, saves at once, and when it is asked
 * to reopen it does so later, as React would, after saving what it had as left.
 */
function rig(options: { store?: boolean; settle?: (standing: Standing) => Verdict } = {}) {
  const clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) };
  const slots = new FakeSlots();
  const accounts = new FakeAccounts(() => clock.now);
  const statuses: Status[] = [];
  const table = { text: null as string | null, field: 0, reopens: 0, asked: false };
  let marks = 0;
  const kept: Kept = {
    slot: SLOT,
    current: () => table.text,
    reads: (text) => {
      try {
        return (JSON.parse(text) as { ok?: unknown }).ok === true;
      } catch {
        return false;
      }
    },
    print: (text) => String(booksIn(text)),
    settle: options.settle ?? decide,
    reopen: () => {
      table.asked = true;
    },
  };
  const sync: Sync = createSync({
    kept,
    store: options.store === false ? null : accounts.store,
    slots: () => slots,
    now: () => clock.now,
    mark: () => `mark-${++marks}`,
    onStatus: (status) => statuses.push(status),
  });
  const cabinet = {
    /** Switches the cabinet on for a player. */
    async start(player: Player = GUEST): Promise<void> {
      sync.player(player);
      table.text = sync.open() ?? NEW;
      sync.save('tick');
      await cabinet.rest();
    },
    /** Lets promises settle, and reopens as often as it has been asked to. */
    async rest(): Promise<void> {
      await settled();
      while (table.asked) {
        table.asked = false;
        table.reopens += 1;
        sync.save('left');
        table.text = sync.open() ?? NEW;
        sync.save('tick');
        await settled();
      }
    },
    /** The player does something that changes the books. */
    play(): void {
      table.text = doc((booksIn(table.text) ?? 0) + 1, ++table.field);
    },
    /** The machine runs on with nobody playing: the field changes and the books do not. */
    idle(): void {
      table.text = doc(booksIn(table.text) ?? 0, ++table.field);
    },
    /** Time passes, and the cabinet's own clock saves. */
    async tick(seconds = 5): Promise<void> {
      clock.now += seconds * 1000;
      sync.save('tick');
      await cabinet.rest();
    },
    async moment(): Promise<void> {
      sync.save('moment');
      await cabinet.rest();
    },
    async hide(): Promise<void> {
      sync.save('hidden');
      await cabinet.rest();
    },
    async leave(): Promise<void> {
      sync.save('left');
      await cabinet.rest();
    },
    async signs(player: Player): Promise<void> {
      sync.player(player);
      await cabinet.rest();
    },
    /** A reset: the old document is thrown away and a new one opened. */
    async reset(): Promise<void> {
      sync.fresh();
      table.asked = true;
      await cabinet.rest();
    },
  };
  /** An account's copy as the device holds it. */
  const copy = (uid: string): { text: string; dirty: boolean; known: string | null; sent: string | null; changedAt: number } | null => {
    const written = slots.map.get(slotFor(SLOT, uid));
    return written === undefined ? null : (JSON.parse(written) as { text: string; dirty: boolean; known: string | null; sent: string | null; changedAt: number });
  };
  const where = (): Status['where'] | undefined => statuses.at(-1)?.where;
  return { clock, slots, accounts, statuses, table, sync, cabinet, copy, where };
}

/** A device that has an account's copy on it already, in step with the account, and the cabinet switched off again. */
async function visited(uid = 'ann') {
  const first = rig();
  await first.cabinet.start(signedIn(uid));
  first.cabinet.play();
  await first.cabinet.tick();
  await first.cabinet.tick(SEND_EVERY);
  expect(first.copy(uid)).toMatchObject({ dirty: false });
  return first;
}

// ── The rule ────────────────────────────────────────────────────────────────

describe('which copy wins', () => {
  const NOW = 1_800_000_000_000;
  const theirs = (mark: string | null = 'theirs', updatedAt: number | null = NOW): Standing['account'] => ({ kind: 'save', text: 'ACCOUNT', mark, updatedAt });
  const ours = (over: Partial<NonNullable<Standing['device']>> = {}): Standing['device'] => ({ text: 'DEVICE', dirty: false, known: 'known', sent: null, sentIsLatest: false, changedAt: NOW, ...over });
  const TAKE: Verdict = { kind: 'take', text: 'ACCOUNT', send: false };
  const says = (account: Standing['account'], device: Standing['device'], skew = 0, guest: string | null = null): Verdict => decide({ account, device, guest, skew });

  it('holds when the account’s copy cannot be read, whatever the device has', () => {
    expect(says({ kind: 'unreadable' }, null)).toEqual({ kind: 'hold' });
    expect(says({ kind: 'unreadable' }, null, 0, 'GUEST')).toEqual({ kind: 'hold' });
    expect(says({ kind: 'unreadable' }, ours({ dirty: true }))).toEqual({ kind: 'hold' });
    expect(says({ kind: 'unreadable' }, ours({ dirty: false }))).toEqual({ kind: 'hold' });
  });

  it('gives an account with nothing on it the device’s copy, or what is on the table', () => {
    expect(says({ kind: 'none' }, ours())).toEqual({ kind: 'send' });
    expect(says({ kind: 'none' }, ours({ dirty: true }))).toEqual({ kind: 'send' });
    expect(says({ kind: 'none' }, null, 0, 'GUEST')).toEqual({ kind: 'adopt' });
    expect(says({ kind: 'none' }, null)).toEqual({ kind: 'adopt' });
  });

  it('takes the account’s copy when the device has none for it, and leaves a guest’s out of it', () => {
    expect(says(theirs(), null)).toEqual(TAKE);
    expect(says(theirs(), null, 0, 'GUEST')).toEqual(TAKE);
    expect(says(theirs(null, null), null, 0, 'GUEST')).toEqual(TAKE);
  });

  it('asks no clock when the account holds what this device last read', () => {
    // Whatever the clocks say, even a device a year out either way.
    for (const changedAt of [NOW - 3.2e10, NOW, NOW + 3.2e10]) {
      for (const skew of [-3.2e10, 0, 3.2e10]) {
        expect(says(theirs('known'), ours({ dirty: false, changedAt }), skew)).toEqual({ kind: 'in-step' });
        expect(says(theirs('known'), ours({ dirty: true, changedAt }), skew)).toEqual({ kind: 'send' });
      }
    }
  });

  it('asks no clock when the account holds what this device last sent as it left', () => {
    for (const skew of [-3.2e10, 0, 3.2e10]) {
      expect(says(theirs('sent'), ours({ dirty: true, sent: 'sent', sentIsLatest: true }), skew)).toEqual({ kind: 'in-step' });
      expect(says(theirs('sent'), ours({ dirty: true, sent: 'sent', sentIsLatest: false }), skew)).toEqual({ kind: 'send' });
    }
  });

  it('takes the account’s when somebody else has written and the device has nothing new', () => {
    expect(says(theirs('other'), ours({ dirty: false }))).toEqual(TAKE);
    // Even if the device’s clock says its copy is the later one: it has not changed, so it is only behind.
    expect(says(theirs('other', NOW - 1e9), ours({ dirty: false, changedAt: NOW }))).toEqual(TAKE);
  });

  it('lets the later of two changed copies win', () => {
    expect(says(theirs('other', NOW), ours({ dirty: true, changedAt: NOW + 1 }))).toEqual({ kind: 'send' });
    expect(says(theirs('other', NOW), ours({ dirty: true, changedAt: NOW - 1 }))).toEqual(TAKE);
    // A tie goes to the account, and so does a copy whose time is not known: what cannot be dated is not written over.
    expect(says(theirs('other', NOW), ours({ dirty: true, changedAt: NOW }))).toEqual(TAKE);
    expect(says(theirs('other', null), ours({ dirty: true, changedAt: NOW + 1e9 }))).toEqual(TAKE);
  });

  it('puts the device’s time on the server’s clock first, so a wrong clock is not believed', () => {
    const hour = 3_600_000;
    // The device’s clock is an hour fast. It played at ten to nine by the server; the account was written at nine.
    const fast = ours({ dirty: true, changedAt: NOW - 600_000 + hour });
    expect(says(theirs('other', NOW), fast, 0)).toEqual({ kind: 'send' });
    expect(says(theirs('other', NOW), fast, -hour)).toEqual(TAKE);
    // The device’s clock is a day slow. It played ten minutes after the account was written.
    const slow = ours({ dirty: true, changedAt: NOW + 600_000 - 24 * hour });
    expect(says(theirs('other', NOW), slow, 0)).toEqual(TAKE);
    expect(says(theirs('other', NOW), slow, 24 * hour)).toEqual({ kind: 'send' });
  });

  it('never matches a copy with no mark to a device that has none either', () => {
    expect(says(theirs(null), ours({ dirty: false, known: null, sent: null }))).toEqual(TAKE);
    expect(says(theirs(null, NOW), ours({ dirty: true, known: null, sent: null, changedAt: NOW - 1 }))).toEqual(TAKE);
  });

  it('holds to its rule over every standing there is', () => {
    const accounts: Standing['account'][] = [{ kind: 'none' }, { kind: 'unreadable' }, theirs('known'), theirs('sent'), theirs('other'), theirs(null), theirs('other', null), theirs('other', NOW - 5), theirs('other', NOW + 5)];
    const devices: Standing['device'][] = [null];
    for (const dirty of [false, true]) {
      for (const sent of [null, 'sent']) {
        for (const sentIsLatest of [false, true]) {
          for (const known of [null, 'known']) devices.push(ours({ dirty, sent, sentIsLatest, known }));
        }
      }
    }
    let seen = 0;
    for (const account of accounts) {
      for (const device of devices) {
        for (const guest of [null, 'GUEST']) {
          for (const skew of [-10, 0, 10]) {
            const verdict = decide({ account, device, guest, skew });
            seen += 1;
            // What cannot be read is left alone, and nothing else is.
            expect(verdict.kind === 'hold').toBe(account.kind === 'unreadable');
            // The table is only adopted for an account with nothing on it and a device with nothing for it.
            expect(verdict.kind === 'adopt').toBe(account.kind === 'none' && device === null);
            // Nothing is sent, and nothing is in step, without a copy of the account’s on the device.
            if (device === null) expect(['send', 'in-step']).not.toContain(verdict.kind);
            // What is taken is the account’s own text, and it is not sent back.
            if (verdict.kind === 'take') expect(verdict).toEqual({ kind: 'take', text: 'ACCOUNT', send: false });
            // A device with nothing new never writes over a copy it has not seen.
            if (device && !device.dirty && account.kind === 'save' && account.mark !== device.known && account.mark !== device.sent) expect(verdict.kind).toBe('take');
            // A guest’s copy changes nothing: the rule does not look at it.
            expect(verdict).toEqual(decide({ account, device, guest: null, skew }));
          }
        }
      }
    }
    expect(seen).toBe(9 * 17 * 2 * 3);
  });
});

// ── How a copy travels ──────────────────────────────────────────────────────

describe('a copy on its way to the account', () => {
  it('comes back as the text it was, with its mark', () => {
    const text = doc(7, 3);
    const state = toCloud(text, 'a-mark', 123);
    expect(state).toMatchObject({ format: CLOUD_FORMAT, mark: 'a-mark', changedAt: 123 });
    expect(typeof state?.data).toBe('string');
    // What the route stores is what comes back from it: an object, as JSON.
    expect(fromCloud(JSON.parse(JSON.stringify(state)))).toEqual({ text, mark: 'a-mark' });
  });

  it('is measured the way the route measures it, and is not made at all when it is too big', () => {
    expect(sizeOf({ a: 'é', b: '🪙' })).toBe(new TextEncoder().encode(JSON.stringify({ a: 'é', b: '🪙' })).length);
    // Text that does not pack: one long string.
    const fits = JSON.stringify({ blob: 'x'.repeat(ACCOUNT_LIMIT - 200) });
    const tooBig = JSON.stringify({ blob: 'x'.repeat(ACCOUNT_LIMIT) });
    expect(sizeOf(toCloud(fits, 'm', 0) as object)).toBeLessThanOrEqual(ACCOUNT_LIMIT);
    expect(toCloud(tooBig, 'm', 0)).toBeNull();
    expect(toCloud('not json', 'm', 0)).toBeNull();
  });

  const unreadable: [string, unknown][] = [
    ['nothing', null],
    ['a list', []],
    ['text', 'save'],
    ['an object of another game', { board: [1, 2, 3] }],
    ['a format this code does not know', { format: CLOUD_FORMAT + 1, mark: 'm', changedAt: 0, data: '{}' }],
    ['no format', { mark: 'm', data: '{}' }],
    ['data that is not text', { format: CLOUD_FORMAT, mark: 'm', data: { ok: true } }],
    ['data that is not packed', { format: CLOUD_FORMAT, mark: 'm', data: '{"$":"t"}' }],
    ['data cut short', { format: CLOUD_FORMAT, mark: 'm', data: '{"ok":tr' }],
  ];

  it.each(unreadable)('is not read from %s, and does not throw', (_name, state) => {
    expect(fromCloud(state)).toBeNull();
  });

  it('is read without a mark when the mark is not text: it is then nobody’s that this device knows', () => {
    expect(fromCloud({ format: CLOUD_FORMAT, mark: 5, data: '{"ok":true}' })).toEqual({ text: '{"ok":true}', mark: null });
  });
});

// ── A guest ─────────────────────────────────────────────────────────────────

describe('a guest’s copy', () => {
  it('is kept in the guest’s slot as it is, and the account is never asked', async () => {
    const { cabinet, slots, accounts, where, table } = rig();
    await cabinet.start();
    expect(table.text).toBe(NEW);
    cabinet.play();
    await cabinet.tick();
    expect(slots.map.get(SLOT)).toBe(table.text);
    await cabinet.hide();
    await cabinet.leave();
    await cabinet.tick(SEND_EVERY * 3);
    expect(accounts.calls).toEqual([]);
    expect(where()).toBe('device');
    expect([...slots.map.keys()]).toEqual([SLOT]);
  });

  it('is opened again as it was left', async () => {
    const first = rig();
    await first.cabinet.start();
    first.cabinet.play();
    first.cabinet.play();
    await first.cabinet.leave();
    const second = rig();
    second.slots.map = first.slots.map;
    await second.cabinet.start();
    expect(booksIn(second.table.text)).toBe(2);
  });

  it('is thrown away by a reset, and the new one kept in its place', async () => {
    const { cabinet, slots, table } = rig();
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    await cabinet.reset();
    expect(table.text).toBe(NEW);
    expect(slots.map.get(SLOT)).toBe(NEW);
  });

  it('stays thrown away by a reset even when the new one cannot be written', async () => {
    const { cabinet, slots, statuses } = rig();
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    expect(slots.map.has(SLOT)).toBe(true);
    // The device is full. The old machine must still not come back with the next visit.
    slots.full = true;
    await cabinet.reset();
    expect(slots.map.has(SLOT)).toBe(false);
    expect(statuses.at(-1)).toEqual({ where: 'device', kept: false });
  });

  it('plays on when the browser will not keep it, and says so', async () => {
    const { cabinet, slots, statuses, sync } = rig();
    slots.blocked = true;
    await cabinet.start();
    cabinet.play();
    expect(sync.save('tick')).toBe(false);
    await cabinet.hide();
    await cabinet.reset();
    expect(statuses.at(-1)).toEqual({ where: 'device', kept: false });
    slots.blocked = false;
    await cabinet.tick();
    expect(statuses.at(-1)).toEqual({ where: 'device', kept: true });
  });

  it('is all there is when the page has no account store to give', async () => {
    const { cabinet, slots, where, table } = rig({ store: false });
    await cabinet.start(signedIn('ann'));
    cabinet.play();
    await cabinet.tick(SEND_EVERY * 2);
    expect(where()).toBe('device');
    expect(slots.map.get(SLOT)).toBe(table.text);
    expect([...slots.map.keys()]).toEqual([SLOT]);
  });
});

// ── Signing in ──────────────────────────────────────────────────────────────

describe('signing in', () => {
  it('makes the guest’s copy the account’s when the account has none, and moves it out of the guest’s slot', async () => {
    const { cabinet, slots, accounts, where, table, copy } = rig();
    await cabinet.start();
    cabinet.play();
    cabinet.play();
    await cabinet.tick();
    const guests = table.text as string;

    await cabinet.signs(signedIn('ann'));
    // The same machine is still on the table: nothing was reopened.
    expect(table.reopens).toBe(0);
    expect(table.text).toBe(guests);
    expect(accounts.text('ann')).toBe(guests);
    expect(copy('ann')).toMatchObject({ text: guests, dirty: false, known: 'mark-1' });
    expect(slots.map.has(SLOT)).toBe(false);
    expect(where()).toBe('account');
    expect(accounts.calls.filter((call) => !call.startsWith('prepare'))).toEqual(['load ann', 'store ann']);
  });

  it('leaves the guest’s copy where it is when the cabinet is taken down before the account has answered', async () => {
    const { sync, table, accounts, slots, cabinet } = rig();
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    const guests = table.text as string;
    sync.player(signedIn('ann'));
    // The player goes to another page of the site: the machine is saved as left, and is on the table no more.
    sync.save('left');
    table.text = null;
    await cabinet.rest();
    expect(slots.map.get(SLOT)).toBe(guests);
    expect(slots.map.has(slotFor(SLOT, 'ann'))).toBe(false);
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
  });

  it('keeps the guest’s copy in its slot when the account’s slot cannot be written', async () => {
    const { cabinet, slots, table, accounts } = rig();
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    const guests = table.text as string;
    // The device has room for nothing new: only the guest's own slot can still be written over.
    const write = slots.setItem.bind(slots);
    slots.setItem = (key, value) => {
      if (key !== SLOT) throw new Error('full');
      write(key, value);
    };
    await cabinet.signs(signedIn('ann'));
    // It is the account's now, and was sent there; the device still has it, in the one slot it could keep it in.
    expect(accounts.text('ann')).toBe(guests);
    expect(slots.map.get(SLOT)).toBe(guests);
  });

  it('takes the account’s copy when it has one, and leaves the guest’s where it was', async () => {
    const { cabinet, slots, accounts, where, table, copy } = rig();
    accounts.put('ann', doc(40), 'from-the-other-device');
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    const guests = table.text as string;

    await cabinet.signs(signedIn('ann'));
    expect(table.reopens).toBe(1);
    expect(booksIn(table.text)).toBe(40);
    expect(copy('ann')).toMatchObject({ text: doc(40), dirty: false, known: 'from-the-other-device' });
    expect(slots.map.get(SLOT)).toBe(guests);
    expect(where()).toBe('account');
    // Nothing was written to the account: it was only read.
    expect(accounts.count('store')).toBe(0);
    expect(accounts.text('ann')).toBe(doc(40));
  });

  it('says it is looking until the account has answered, and writes nothing to it meanwhile', async () => {
    const { sync, table, accounts, statuses, cabinet } = rig();
    accounts.put('ann', doc(40), 'theirs');
    sync.player(signedIn('ann'));
    table.text = sync.open() ?? NEW;
    sync.save('tick');
    expect(statuses.at(-1)?.where).toBe('checking');
    // Played, hidden and left before the answer: none of it reaches the account.
    cabinet.play();
    sync.save('moment');
    sync.save('hidden');
    sync.save('left');
    expect(accounts.count('store')).toBe(0);
    await cabinet.rest();
    expect(statuses.at(-1)?.where).toBe('account');
    expect(booksIn(table.text)).toBe(40);
  });

  it('opens with the account’s copy on this device at once, and reads the account behind it', async () => {
    const first = await visited('ann');
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    second.sync.player(signedIn('ann'));
    // Before anything has been awaited, the machine is the one this device kept.
    expect(booksIn(second.sync.open())).toBe(1);
    second.table.text = first.copy('ann')?.text ?? null;
    await second.cabinet.rest();
    expect(second.where()).toBe('account');
    expect(second.table.reopens).toBe(0);
    expect(second.accounts.calls.filter((call) => !call.startsWith('prepare'))).toEqual(['load ann']);
  });

  it('takes the account’s copy over this device’s when another device has played since', async () => {
    const first = await visited('ann');
    first.accounts.put('ann', doc(99), 'elsewhere');
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(signedIn('ann'));
    expect(booksIn(second.table.text)).toBe(99);
    expect(second.copy('ann')).toMatchObject({ dirty: false, known: 'elsewhere' });
    expect(second.accounts.count('store')).toBe(0);
  });

  it('sends this device’s copy when it was played with the account out of reach', async () => {
    const first = await visited('ann');
    first.accounts.down = true;
    first.cabinet.play();
    first.cabinet.play();
    await first.cabinet.tick(SEND_EVERY);
    await first.cabinet.leave();
    expect(first.copy('ann')).toMatchObject({ dirty: true });
    expect(first.where()).toBe('offline');

    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(signedIn('ann'));
    expect(booksIn(second.table.text)).toBe(3);
    expect(booksIn(second.accounts.text('ann'))).toBe(3);
    expect(second.copy('ann')).toMatchObject({ dirty: false });
    expect(second.where()).toBe('account');
  });

  it('does not let an old copy played offline go over a newer one from another device', async () => {
    const first = await visited('ann');
    first.accounts.down = true;
    first.cabinet.play();
    await first.cabinet.tick(SEND_EVERY);
    await first.cabinet.leave();

    // A day later the other device plays, and the day after that this one comes back.
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    second.clock.now = first.clock.now + 48 * 3_600_000;
    second.accounts.put('ann', doc(500), 'elsewhere', first.clock.now + 24 * 3_600_000);
    await second.cabinet.start(signedIn('ann'));
    expect(booksIn(second.table.text)).toBe(500);
    expect(booksIn(second.accounts.text('ann'))).toBe(500);
    expect(second.accounts.count('store')).toBe(0);
  });

  it('is not fooled by a device whose clock is a week fast', async () => {
    const week = 7 * 24 * 3_600_000;
    const first = await visited('ann');
    // This device’s clock runs a week ahead of the server’s. It plays offline, by its own clock a week from now.
    first.accounts.ahead = -week;
    first.accounts.down = true;
    first.cabinet.play();
    await first.cabinet.tick(SEND_EVERY);
    await first.cabinet.leave();

    // An hour later, really, another device writes. This one comes back an hour after that.
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    second.accounts.ahead = -week;
    second.clock.now = first.clock.now + 2 * 3_600_000;
    second.accounts.put('ann', doc(500), 'elsewhere', first.clock.now - week + 3_600_000);
    await second.cabinet.start(signedIn('ann'));
    // By the raw clocks the device’s copy is six days the later. It is the older one, and it loses.
    expect(booksIn(second.table.text)).toBe(500);
    expect(second.accounts.count('store')).toBe(0);
  });
});

// ── Playing while signed in ─────────────────────────────────────────────────

describe('a copy that is being played', () => {
  it('goes to the account about once a minute while it is changing, not on every save', async () => {
    const { cabinet, accounts, table } = await visited();
    const before = accounts.count('store');
    // Ten minutes of play, saved on the device every five seconds.
    for (let i = 0; i < 120; i++) {
      cabinet.play();
      await cabinet.tick();
    }
    const sent = accounts.count('store') - before;
    expect(sent).toBeGreaterThanOrEqual(9);
    expect(sent).toBeLessThanOrEqual(10);
    expect(accounts.count('storeNow')).toBe(0);
    // And the account is never more than a minute behind.
    expect((booksIn(table.text) as number) - (booksIn(accounts.text('ann')) as number)).toBeLessThanOrEqual(SEND_EVERY / 5);
  });

  it('is not sent at all when nothing in its books has changed', async () => {
    const { cabinet, accounts } = await visited();
    const before = accounts.calls.filter((call) => !call.startsWith('prepare')).length;
    for (let i = 0; i < 120; i++) {
      cabinet.idle();
      await cabinet.tick();
    }
    await cabinet.hide();
    await cabinet.leave();
    expect(accounts.calls.filter((call) => !call.startsWith('prepare')).length).toBe(before);
  });

  it('is sent at a big moment without waiting for the minute, but not twice in a few seconds', async () => {
    const { cabinet, accounts } = await visited();
    const before = accounts.count('store');
    await cabinet.tick(MOMENT_GAP);
    cabinet.play();
    await cabinet.moment();
    expect(accounts.count('store')).toBe(before + 1);
    // A second jackpot two seconds later waits its turn.
    cabinet.play();
    await cabinet.tick(2);
    await cabinet.moment();
    expect(accounts.count('store')).toBe(before + 1);
    await cabinet.tick(MOMENT_GAP);
    expect(accounts.count('store')).toBe(before + 2);
  });

  it('is sent as the page is hidden, with what is in hand, and only once if the page is then left', async () => {
    const { cabinet, accounts, table, copy } = await visited();
    cabinet.play();
    await cabinet.tick();
    const before = accounts.count('store');
    await cabinet.hide();
    await cabinet.leave();
    await cabinet.leave();
    expect(accounts.count('storeNow')).toBe(1);
    expect(accounts.count('store')).toBe(before);
    expect(accounts.text('ann')).toBe(table.text);
    // It was heard to arrive, so the device knows the account has it.
    expect(copy('ann')).toMatchObject({ dirty: false, sent: null });
  });

  it('says a thing once as it leaves, however often it is told to go, until there is something new to say', async () => {
    const { cabinet, accounts } = await visited();
    // The answer to a write made on the way out is never heard: the page is hidden, then left, then taken down.
    accounts.silent = true;
    cabinet.play();
    await cabinet.tick();
    await cabinet.hide();
    await cabinet.leave();
    await cabinet.leave();
    expect(accounts.count('storeNow')).toBe(1);
    // The player comes back to the page and plays on: that is new, and is said when the page is hidden again.
    cabinet.play();
    await cabinet.tick();
    await cabinet.hide();
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(2);
  });

  it('writes down what it sent as it left, so that the next visit knows the account has it', async () => {
    const first = await visited('ann');
    first.cabinet.play();
    await first.cabinet.tick();
    // The page is gone before the answer comes back.
    first.sync.save('hidden');
    first.sync.close();
    await settled();
    const left = first.copy('ann');
    expect(left).toMatchObject({ dirty: true });
    expect(left?.sent).toMatch(/^mark-/);
    expect(first.accounts.text('ann')).toBe(left?.text);

    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(signedIn('ann'));
    // Nothing to take and nothing to send: the two are the same.
    expect(second.table.reopens).toBe(0);
    expect(second.accounts.count('store')).toBe(0);
    expect(second.copy('ann')).toMatchObject({ dirty: false, sent: null, known: left?.sent });
  });

  it('is not sent as the page is left when no token is in hand', async () => {
    const { cabinet, accounts, copy } = await visited();
    accounts.ready.clear();
    accounts.down = true;
    cabinet.play();
    await cabinet.tick();
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(0);
    expect(copy('ann')).toMatchObject({ dirty: true });
  });

  it('keeps one write in the air at a time on the clock, and sends what was waiting as soon as that one is answered', async () => {
    const { cabinet, accounts, table } = await visited();
    accounts.held = [];
    const before = accounts.count('store');
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    await cabinet.moment();
    expect(accounts.count('store')).toBe(before + 1);
    // It arrives, with what had been played by then left over to send: that goes at once, the minute being long over.
    accounts.held.splice(0).forEach((answer) => answer());
    await cabinet.rest();
    expect(accounts.count('store')).toBe(before + 2);
    accounts.held.splice(0).forEach((answer) => answer());
    accounts.held = null;
    await cabinet.rest();
    expect(accounts.text('ann')).toBe(table.text);
    cabinet.idle();
    await cabinet.tick(SEND_EVERY);
    expect(accounts.count('store')).toBe(before + 2);
    expect(accounts.count('storeNow')).toBe(0);
  });

  it('does not wait for a write in the air as the page is left, and sends the copy once more when the two have crossed', async () => {
    const { cabinet, accounts, table, copy, where } = await visited();
    accounts.held = [];
    const before = accounts.count('store');
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    const older = table.text as string;
    // Played on while that write is in the air, and the page is hidden: the page may be gone before it is answered.
    cabinet.play();
    await cabinet.hide();
    await cabinet.hide();
    await cabinet.leave();
    expect(accounts.count('storeNow')).toBe(1);
    expect(accounts.text('ann')).toBe(table.text);
    // The page was only hidden. The older write lands after the newer one: the account is a move behind, and
    // neither answer is taken for the last word.
    accounts.held.splice(0).forEach((answer) => answer());
    await settled();
    expect(accounts.text('ann')).toBe(older);
    expect(copy('ann')).toMatchObject({ dirty: true });
    // So the copy goes once more, by itself, without waiting for the minute.
    expect(accounts.count('store')).toBe(before + 2);
    accounts.held.splice(0).forEach((answer) => answer());
    accounts.held = null;
    await cabinet.rest();
    expect(accounts.text('ann')).toBe(table.text);
    expect(copy('ann')).toMatchObject({ text: table.text, dirty: false, sent: null });
    expect(where()).toBe('account');
    // And that is the end of it.
    await cabinet.tick(SEND_EVERY);
    expect(accounts.count('store')).toBe(before + 2);
  });

  it('takes neither of two writes that crossed for the last word, even when the copy is back as the first one carried it', async () => {
    const { cabinet, accounts, table, copy } = await visited();
    accounts.held = [];
    const before = accounts.count('store');
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    const first = table.text as string;
    const [older] = accounts.held;
    // The first write lands, but its answer is slow. Played on, the page is hidden: the second lands after it.
    older('lands');
    cabinet.play();
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(1);
    expect(booksIn(accounts.text('ann'))).toBe((booksIn(first) as number) + 1);
    // The copy goes back to what it was when the first write went, and then that write's answer comes: by its
    // looks the account has exactly this. It has not: the other one landed last.
    table.text = first;
    await cabinet.tick();
    accounts.held.splice(0).forEach((answer) => answer());
    await settled();
    expect(copy('ann')).toMatchObject({ dirty: true });
    expect(accounts.count('store')).toBe(before + 2);
    accounts.held.splice(0).forEach((answer) => answer());
    accounts.held = null;
    await cabinet.rest();
    expect(accounts.text('ann')).toBe(first);
    expect(copy('ann')).toMatchObject({ text: first, dirty: false });
  });

  it('knows an older write of its own on the next visit, when the page went before the two that crossed were answered', async () => {
    const first = await visited('ann');
    first.accounts.held = [];
    first.cabinet.play();
    await first.cabinet.tick(SEND_EVERY);
    first.cabinet.play();
    first.sync.save('hidden');
    first.sync.close();
    const latest = first.table.text as string;
    // The older write lands last, a few seconds later by the server's clock.
    first.clock.now += 4000;
    first.accounts.held.splice(0).forEach((answer) => answer());
    await settled();
    expect(booksIn(first.accounts.text('ann'))).toBe((booksIn(latest) as number) - 1);

    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    second.clock.now = first.clock.now + 3_600_000;
    await second.cabinet.start(signedIn('ann'));
    // No clock is asked, though the account's copy has the later time: it is this device's own, and the older.
    expect(second.table.text).toBe(latest);
    expect(second.table.reopens).toBe(0);
    expect(second.accounts.text('ann')).toBe(latest);
    expect(second.copy('ann')).toMatchObject({ text: latest, dirty: false });
  });

  it('takes a write made as the page is left that the account did not take for a failure', async () => {
    const { cabinet, accounts, table, copy, where, clock } = await visited();
    cabinet.play();
    await cabinet.tick();
    accounts.down = true;
    const stores = accounts.count('store');
    await cabinet.hide();
    await cabinet.leave();
    await cabinet.leave();
    // Sent once, and refused. The copy is still to be sent, and the player is told the account was not reached.
    expect(accounts.count('storeNow')).toBe(1);
    expect(copy('ann')).toMatchObject({ dirty: true });
    expect(where()).toBe('offline');

    // The page was only hidden. Nothing is tried again until the wait after a failure is over, however it is asked.
    accounts.down = false;
    const failedAt = clock.now;
    cabinet.play();
    await cabinet.tick(RETRY_AFTER[0] - 5);
    await cabinet.moment();
    await cabinet.hide();
    expect(accounts.count('store')).toBe(stores);
    expect(accounts.count('storeNow')).toBe(1);
    expect(where()).toBe('offline');
    // Then it goes: one failure, one wait, and the first wait at that.
    await cabinet.tick(5);
    await cabinet.moment();
    expect(clock.now - failedAt).toBe(RETRY_AFTER[0] * 1000);
    expect(accounts.count('store')).toBe(stores + 1);
    expect(accounts.text('ann')).toBe(table.text);
    expect(copy('ann')).toMatchObject({ dirty: false });
    expect(where()).toBe('account');
  });

  it('says it again as the page is left once the wait is over, when the first time came to nothing', async () => {
    const { cabinet, accounts, table, copy, where } = await visited();
    cabinet.play();
    await cabinet.tick();
    accounts.down = true;
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(1);
    accounts.down = false;
    const stores = accounts.count('store');
    // Nothing has been played since. Hidden again too soon, it is not tried; after the wait it is, and is taken.
    await cabinet.tick(RETRY_AFTER[0] - 5);
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(1);
    await cabinet.tick(5);
    await cabinet.hide();
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(2);
    expect(accounts.count('store')).toBe(stores);
    expect(accounts.text('ann')).toBe(table.text);
    expect(copy('ann')).toMatchObject({ dirty: false, sent: null });
    expect(where()).toBe('account');
  });

  it('takes having nothing to send it with as the page is left for a failure too, and counts it once', async () => {
    const { cabinet, accounts, table, copy, where, clock, sync } = await visited();
    cabinet.play();
    await cabinet.tick();
    // The token is gone: the player's session has run out, or it was never got ready.
    accounts.ready.clear();
    accounts.down = true;
    const stores = accounts.count('store');
    sync.save('hidden');
    sync.save('left');
    sync.save('left');
    await settled();
    expect(accounts.count('storeNow')).toBe(0);
    expect(copy('ann')).toMatchObject({ dirty: true, sent: null });
    expect(where()).toBe('offline');

    accounts.down = false;
    const failedAt = clock.now;
    cabinet.play();
    await cabinet.tick(RETRY_AFTER[0] - 5);
    await cabinet.moment();
    expect(accounts.count('store')).toBe(stores);
    // Hidden and then left twice was one failure, not three: the first wait is all there is.
    await cabinet.tick(5);
    await cabinet.moment();
    expect(clock.now - failedAt).toBe(RETRY_AFTER[0] * 1000);
    expect(accounts.count('store')).toBe(stores + 1);
    expect(accounts.text('ann')).toBe(table.text);
    expect(where()).toBe('account');
  });

  it('gives up waiting for a write made as the page was left after a minute without an answer', async () => {
    const { cabinet, accounts, table, where } = await visited();
    accounts.silent = true;
    cabinet.play();
    await cabinet.tick();
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(1);
    const stores = accounts.count('store');
    // The page was only hidden, and the answer never comes. While that write may still be in the air nothing goes
    // on the clock, so that it cannot land on top of a later one unnoticed.
    for (let i = 0; i < 11; i++) {
      cabinet.play();
      await cabinet.tick();
    }
    await cabinet.moment();
    expect(accounts.count('store')).toBe(stores);
    // After a minute it has landed or been lost, and the copy goes by the ordinary way.
    await cabinet.tick(10);
    expect(accounts.count('store')).toBe(stores + 1);
    expect(accounts.text('ann')).toBe(table.text);
    expect(where()).toBe('account');
  });
});

// ── Failing ─────────────────────────────────────────────────────────────────

describe('when the account cannot be reached', () => {
  it('plays on with the device’s copy, says so, and tries again after a while, and then a longer while', async () => {
    const { cabinet, accounts, where, clock } = await visited();
    accounts.down = true;
    const before = accounts.count('store');
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    expect(accounts.count('store')).toBe(before + 1);
    expect(where()).toBe('offline');

    // Each failure is followed by a longer wait: the tries are no closer together than the list says.
    const tries: number[] = [clock.now];
    for (let i = 0; i < 200 && tries.length < RETRY_AFTER.length + 2; i++) {
      const had = accounts.count('store');
      cabinet.play();
      await cabinet.tick();
      if (accounts.count('store') > had) tries.push(clock.now);
    }
    const gaps = tries.slice(1).map((time, index) => (time - tries[index]) / 1000);
    expect(gaps).toHaveLength(RETRY_AFTER.length + 1);
    gaps.forEach((gap, index) => {
      // No sooner than the wait for that many failures, and no sooner than the minute between any two writes.
      const wait = Math.max(SEND_EVERY, RETRY_AFTER[Math.min(index, RETRY_AFTER.length - 1)]);
      expect(gap).toBeGreaterThanOrEqual(wait);
      expect(gap).toBeLessThan(wait + 10);
    });

    accounts.down = false;
    await cabinet.tick(RETRY_AFTER[RETRY_AFTER.length - 1]);
    expect(where()).toBe('account');
    expect(accounts.text('ann')).not.toBeNull();
  });

  it('does not write to an account it has not been able to read, and reads it when it can', async () => {
    const { cabinet, accounts, where, table, slots } = rig();
    accounts.put('ann', doc(40), 'theirs');
    accounts.down = true;
    await cabinet.start(signedIn('ann'));
    expect(where()).toBe('offline');
    // The guest’s machine is still on the table, in the guest’s slot.
    for (let i = 0; i < 6; i++) {
      cabinet.play();
      await cabinet.tick();
    }
    await cabinet.moment();
    await cabinet.hide();
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
    expect(slots.map.get(SLOT)).toBe(table.text);
    expect(accounts.count('load')).toBe(2);

    accounts.down = false;
    await cabinet.tick(RETRY_AFTER[1]);
    expect(where()).toBe('account');
    expect(booksIn(table.text)).toBe(40);
    // What the guest had played in the meantime is still the guest’s.
    expect(booksIn(slots.map.get(SLOT) ?? null)).toBe(6);
  });

  it('keeps a copy that is too big for the account on the device, and tries again when it may be smaller', async () => {
    const { cabinet, accounts, where, table } = await visited();
    const before = accounts.count('store');
    table.text = JSON.stringify({ ok: true, books: 2, blob: 'x'.repeat(ACCOUNT_LIMIT) });
    await cabinet.tick(SEND_EVERY);
    expect(where()).toBe('offline');
    await cabinet.hide();
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(before);
    table.text = doc(3);
    await cabinet.tick(SEND_EVERY);
    expect(where()).toBe('account');
    expect(accounts.text('ann')).toBe(doc(3));
  });

  it('never throws into the cabinet, whatever the storage and the account do', async () => {
    const { cabinet, accounts, slots, sync, table } = rig();
    slots.blocked = true;
    accounts.down = true;
    await cabinet.start(signedIn('ann'));
    for (let i = 0; i < 30; i++) {
      cabinet.play();
      await cabinet.tick(SEND_EVERY);
    }
    await cabinet.moment();
    await cabinet.hide();
    await cabinet.reset();
    await cabinet.signs(GUEST);
    await cabinet.signs(signedIn('bob'));
    expect(() => sync.save('left')).not.toThrow();
    expect(table.text).not.toBeNull();
  });
});

describe('a copy on the account that cannot be read', () => {
  const cases: [string, (accounts: FakeAccounts) => void][] = [
    ['one written in a format this code does not know', (accounts) => accounts.docs.set('ann', { state: { format: CLOUD_FORMAT + 1, mark: 'new', data: 'H4sIAAAA' }, updatedAt: accounts.time() })],
    ['one of a newer version, which this code does not read', (accounts) => accounts.put('ann', JSON.stringify({ ok: false, version: 99 }), 'newer')],
    ['one that is damaged', (accounts) => accounts.docs.set('ann', { state: { format: CLOUD_FORMAT, mark: 'm', data: '{"$":"t","k":["x"]}' }, updatedAt: accounts.time() })],
    ['one that is another game’s altogether', (accounts) => accounts.docs.set('ann', { state: { board: 'lnsgkgsnl' }, updatedAt: accounts.time() })],
  ];

  it.each(cases)('is left exactly as it is: %s', async (_name, put) => {
    const { cabinet, accounts, where, table, slots } = rig();
    put(accounts);
    const theirs = JSON.stringify(accounts.docs.get('ann'));
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    await cabinet.signs(signedIn('ann'));
    expect(where()).toBe('unreadable');
    // The machine on the table plays on, on this device.
    for (let i = 0; i < 30; i++) {
      cabinet.play();
      await cabinet.tick(SEND_EVERY);
    }
    await cabinet.moment();
    await cabinet.hide();
    await cabinet.leave();
    expect(booksIn(table.text)).toBe(31);
    expect(slots.map.get(SLOT)).toBe(table.text);
    // Nothing was written to the account, and nothing deleted from it.
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
    expect(JSON.stringify(accounts.docs.get('ann'))).toBe(theirs);
    expect(where()).toBe('unreadable');
  });

  it('is left alone even when this device has a copy of its own with changes to send', async () => {
    const first = await visited('ann');
    first.accounts.down = true;
    first.cabinet.play();
    await first.cabinet.tick(SEND_EVERY);
    await first.cabinet.leave();
    first.accounts.put('ann', JSON.stringify({ ok: false, version: 99 }), 'newer');
    const theirs = JSON.stringify(first.accounts.docs.get('ann'));

    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(signedIn('ann'));
    second.cabinet.play();
    await second.cabinet.tick(SEND_EVERY * 5);
    await second.cabinet.hide();
    expect(second.where()).toBe('unreadable');
    expect(booksIn(second.table.text)).toBe(3);
    expect(JSON.stringify(second.accounts.docs.get('ann'))).toBe(theirs);
  });

  it('gives way to a reset, which is the player’s own word that the account’s machine is to go', async () => {
    const { cabinet, accounts, where, table } = rig();
    accounts.put('ann', JSON.stringify({ ok: false, version: 99 }), 'newer');
    await cabinet.start(signedIn('ann'));
    expect(where()).toBe('unreadable');
    await cabinet.reset();
    expect(table.text).toBe(NEW);
    expect(accounts.text('ann')).toBe(NEW);
    expect(where()).toBe('account');
  });

  it('is held, too, when the rule itself throws: nothing is decided, so nothing is written', async () => {
    const { cabinet, accounts, where } = rig({
      settle: () => {
        throw new Error('a rule gone wrong');
      },
    });
    accounts.put('ann', doc(40), 'theirs');
    await cabinet.start(signedIn('ann'));
    cabinet.play();
    await cabinet.tick(SEND_EVERY * 2);
    await cabinet.hide();
    expect(where()).toBe('unreadable');
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
    expect(accounts.text('ann')).toBe(doc(40));
  });
});

// ── Signing out, and two players at one computer ────────────────────────────

describe('signing out', () => {
  /** A player signed in on a device, with a change the account has and one it has not: the minute had not come round. */
  async function withUnsentPlay() {
    const it = rig();
    await it.cabinet.start();
    it.cabinet.play();
    await it.cabinet.tick();
    it.accounts.put('ann', doc(40), 'theirs');
    await it.cabinet.signs(signedIn('ann'));
    const guests = it.slots.map.get(SLOT) as string;
    // The first change goes up with the next save; the one after it waits for the minute.
    it.cabinet.play();
    await it.cabinet.tick();
    const synced = it.clock.now;
    it.cabinet.play();
    await it.cabinet.tick();
    const anns = it.table.text as string;
    expect(booksIn(it.accounts.text('ann'))).toBe(41);
    expect(booksIn(anns)).toBe(42);
    return { ...it, guests, anns, synced };
  }

  it('sends nothing once the player has signed out: what was not yet sent waits on this device for them', async () => {
    const { cabinet, accounts, where, table, copy, guests, anns } = await withUnsentPlay();
    const before = [...accounts.calls];

    await cabinet.signs(GUEST);
    // The guest's machine is back on the table, and the account's is in its own slot, marked as not yet sent.
    expect(table.text).toBe(guests);
    expect(where()).toBe('device');
    expect(copy('ann')).toMatchObject({ text: anns, dirty: true, sent: null });
    // Whatever the guest then does, for however long, and however the page is left: not one call of any kind
    // reaches the account, and the token that was in hand for it has been let go.
    for (let i = 0; i < 30; i++) {
      cabinet.play();
      await cabinet.tick(SEND_EVERY);
    }
    await cabinet.moment();
    await cabinet.hide();
    await cabinet.leave();
    await cabinet.reset();
    expect(accounts.calls).toEqual(before);
    expect(accounts.forgotten).toEqual(['ann']);
    expect(accounts.ready.has('ann')).toBe(false);
    expect(booksIn(accounts.text('ann'))).toBe(41);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: true });
  });

  it('writes down what is unsent at the moment of signing out, before the cabinet has done anything', async () => {
    const { cabinet, sync, table, copy, accounts } = await withUnsentPlay();
    // Played once more since the device last saved: its slot is a move behind.
    cabinet.play();
    const anns = table.text as string;
    expect(copy('ann')?.text).not.toBe(anns);
    const before = [...accounts.calls];
    sync.player(GUEST);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: true, sent: null });
    expect(accounts.calls).toEqual(before);
  });

  it('notices a move made since the device last saved, when the copy had been in step with the account', async () => {
    const { cabinet, sync, table, copy, accounts, clock } = await visited('ann');
    // One more move, and she signs out before the cabinet has saved anything.
    clock.now += 7000;
    cabinet.play();
    const anns = table.text as string;
    const before = [...accounts.calls];
    sync.player(GUEST);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: true, changedAt: clock.now });
    expect(accounts.calls).toEqual(before);
    // It is not lost for having been told to nobody: it goes up when she is back.
    await cabinet.rest();
    expect(accounts.calls).toEqual(before);
    await cabinet.signs(signedIn('ann'));
    expect(table.text).toBe(anns);
    expect(accounts.text('ann')).toBe(anns);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: false });
  });

  it('sends what was waiting when the same player signs in again on this device', async () => {
    const { cabinet, accounts, table, copy, where, anns, clock } = await withUnsentPlay();
    await cabinet.signs(GUEST);
    clock.now += 3 * 24 * 3_600_000;
    const stores = accounts.count('store');

    await cabinet.signs(signedIn('ann'));
    // Nobody else has written to the account, so no clock is asked: the device's copy is the newer, and goes up.
    expect(table.text).toBe(anns);
    expect(accounts.text('ann')).toBe(anns);
    expect(accounts.count('store')).toBe(stores + 1);
    expect(accounts.count('storeNow')).toBe(0);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: false });
    expect(where()).toBe('account');
  });

  it('lets the later copy win when the player has played elsewhere in between: the other device’s, if it is the later', async () => {
    const { cabinet, accounts, table, copy, clock } = await withUnsentPlay();
    await cabinet.signs(GUEST);
    // The next day they play on another device, signed in; the day after, they are back on this one.
    clock.now += 24 * 3_600_000;
    accounts.put('ann', doc(500), 'elsewhere');
    clock.now += 24 * 3_600_000;
    const stores = accounts.count('store');

    await cabinet.signs(signedIn('ann'));
    expect(booksIn(table.text)).toBe(500);
    expect(booksIn(accounts.text('ann'))).toBe(500);
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(stores);
    expect(copy('ann')).toMatchObject({ text: doc(500), dirty: false, known: 'elsewhere' });
  });

  it('lets the later copy win when the player has played elsewhere in between: this device’s, if it is the later', async () => {
    const { cabinet, accounts, table, copy, anns, synced } = await withUnsentPlay();
    // The other device was open at the same time, and wrote two seconds after this one last had; this one was
    // played on after that, and signed out before its minute came round.
    accounts.put('ann', doc(500), 'elsewhere', synced + 2000);
    await cabinet.signs(GUEST);
    const stores = accounts.count('store');

    await cabinet.signs(signedIn('ann'));
    expect(table.text).toBe(anns);
    expect(accounts.text('ann')).toBe(anns);
    expect(accounts.count('store')).toBe(stores + 1);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: false });
  });

  it('sends nothing for the player who is leaving when another signs in on the same page', async () => {
    const { cabinet, accounts, copy, anns, table } = await withUnsentPlay();
    const before = accounts.calls.filter((call) => call.endsWith(' ann'));

    await cabinet.signs(signedIn('bob'));
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    await cabinet.hide();
    // Everything since is Bob's: nothing was sent as Ann, and her copy waits for her, unsent.
    expect(accounts.calls.filter((call) => call.endsWith(' ann'))).toEqual(before);
    expect(accounts.forgotten).toEqual(['ann']);
    expect(booksIn(accounts.text('ann'))).toBe(41);
    expect(copy('ann')).toMatchObject({ text: anns, dirty: true });
    expect(accounts.text('bob')).toBe(table.text);
  });

  it('does not make the next player’s machine wait for the answer to a write of the one who left', async () => {
    const { cabinet, accounts, table, copy } = await withUnsentPlay();
    const held: (() => void)[] = [];
    accounts.held = held;
    await cabinet.tick(SEND_EVERY);
    // Ann's machine is in the air, unanswered, when Bob signs in on the same page. His writes are answered as usual.
    expect(held).toHaveLength(1);
    accounts.held = null;
    await cabinet.signs(signedIn('bob'));
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    expect(accounts.calls.filter((call) => call === 'store bob')).toHaveLength(2);
    // Her write lands and is answered: it changes nothing of his, and hers is known for hers when she is back.
    held.splice(0).forEach((answer) => answer());
    await cabinet.rest();
    expect(accounts.text('bob')).toBe(table.text);
    expect(copy('bob')).toMatchObject({ dirty: false });
    const anns = copy('ann');
    expect(anns).toMatchObject({ dirty: true });
    expect(anns?.sent).toMatch(/^mark-/);
    expect(accounts.text('ann')).toBe(anns?.text);
    // Back as Ann: the account holds what this device last sent as her, so there is nothing to take or to send.
    const sentAsAnn = accounts.calls.filter((call) => call.endsWith(' ann') && !call.startsWith('load') && !call.startsWith('prepare')).length;
    await cabinet.signs(signedIn('ann'));
    expect(table.text).toBe(anns?.text);
    expect(copy('ann')).toMatchObject({ dirty: false, sent: null, known: anns?.sent });
    expect(accounts.calls.filter((call) => call.endsWith(' ann') && !call.startsWith('load') && !call.startsWith('prepare'))).toHaveLength(sentAsAnn);
  });

  it('starts a new machine for a guest when there is none', async () => {
    const { cabinet, accounts, table, slots } = rig();
    accounts.put('ann', doc(40), 'theirs');
    await cabinet.start(signedIn('ann'));
    // The table was opened as a guest’s while the account was read: an untouched new machine is all the guest has.
    expect(slots.map.get(SLOT)).toBe(NEW);
    await cabinet.signs(GUEST);
    expect(table.text).toBe(NEW);
  });

  it('never mixes two players’ machines at one computer', async () => {
    const { cabinet, accounts, slots, table, copy } = rig();
    await cabinet.start();
    cabinet.play();
    await cabinet.tick();
    const guests = table.text as string;

    // Ann signs in for the first time: the guest’s machine becomes hers, and is the guest’s no longer.
    await cabinet.signs(signedIn('ann'));
    for (let i = 0; i < 4; i++) cabinet.play();
    await cabinet.tick(SEND_EVERY);
    const anns = table.text as string;
    await cabinet.signs(GUEST);
    expect(table.text).toBe(NEW);

    // Bob signs in for the first time on the same computer. He does not get Ann’s machine, nor the guest’s old one.
    await cabinet.signs(signedIn('bob'));
    expect(table.text).toBe(NEW);
    cabinet.play();
    await cabinet.tick(SEND_EVERY);
    const bobs = table.text as string;
    expect(booksIn(accounts.text('bob'))).toBe(1);
    expect(accounts.text('ann')).toBe(anns);
    expect(anns).not.toBe(guests);

    // Straight from Bob to Ann, and back to nobody: each finds their own.
    await cabinet.signs(signedIn('ann'));
    expect(table.text).toBe(anns);
    await cabinet.signs(signedIn('bob'));
    expect(table.text).toBe(bobs);
    await cabinet.signs(GUEST);
    expect(copy('ann')?.text).toBe(anns);
    expect(copy('bob')?.text).toBe(bobs);
    expect(accounts.text('ann')).toBe(anns);
    expect(accounts.text('bob')).toBe(bobs);
    expect([...slots.map.keys()].sort()).toEqual([SLOT, slotFor(SLOT, 'ann'), slotFor(SLOT, 'bob')].sort());
  });

  it('does not send a copy the account’s newer one is about to replace, if the player signs out first', async () => {
    const first = await visited('ann');
    first.accounts.down = true;
    first.cabinet.play();
    // Played with the account out of reach, and the page then lost without a word: nothing was sent as it went.
    await first.cabinet.tick(SEND_EVERY);
    expect(first.copy('ann')).toMatchObject({ dirty: true });
    expect(first.accounts.count('storeNow')).toBe(0);

    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    second.clock.now = first.clock.now + 48 * 3_600_000;
    second.accounts.put('ann', doc(500), 'elsewhere', first.clock.now + 24 * 3_600_000);
    second.sync.player(signedIn('ann'));
    second.table.text = second.sync.open();
    second.sync.save('tick');
    await second.accounts.store.prepare('ann');
    // The account has answered and its copy is to be taken, but the cabinet has not got round to reopening.
    await settled();
    expect(second.table.asked).toBe(true);
    second.sync.player(GUEST);
    second.sync.save('hidden');
    second.sync.save('left');
    expect(second.accounts.count('store') + second.accounts.count('storeNow')).toBe(0);
    expect(booksIn(second.accounts.text('ann'))).toBe(500);
  });

  it('takes an answer for the player it was asked about, and never for the one who signed in after', async () => {
    const { sync, table, accounts, cabinet } = rig();
    accounts.put('ann', doc(40), 'anns');
    accounts.heldReads = [];
    await cabinet.start(signedIn('ann'));
    // Ann's account has not answered when Bob signs in instead.
    await cabinet.signs(signedIn('bob'));
    expect(accounts.heldReads).toHaveLength(2);
    const [anns, bobs] = accounts.heldReads;
    accounts.heldReads = null;
    // Bob's answers first: he has nothing, so the machine on the table becomes his.
    bobs();
    await cabinet.rest();
    expect(accounts.text('bob')).toBe(NEW);
    // Then Ann's answer comes, with her machine in it. It is not Bob's.
    anns();
    await cabinet.rest();
    expect(table.text).toBe(NEW);
    expect(table.reopens).toBe(0);
    expect(accounts.text('bob')).toBe(NEW);
    expect(accounts.text('ann')).toBe(doc(40));
    sync.save('left');
    expect(accounts.text('bob')).toBe(NEW);
  });

  it('ignores an answer from the account that comes after its player has gone', async () => {
    const { sync, table, accounts, cabinet, slots } = rig();
    accounts.put('ann', doc(40), 'theirs');
    sync.player(signedIn('ann'));
    table.text = sync.open() ?? NEW;
    sync.save('tick');
    // Signed out before the read came back.
    sync.player(GUEST);
    await cabinet.rest();
    expect(table.reopens).toBe(0);
    expect(table.text).toBe(NEW);
    expect(slots.map.has(slotFor(SLOT, 'ann'))).toBe(false);
  });
});

describe('while the site is still finding out who is playing', () => {
  it('opens with the machine of the player who was here last, and touches no account until it is sure', async () => {
    const first = await visited('ann');
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(RESTORING);
    expect(booksIn(second.table.text)).toBe(1);
    second.cabinet.play();
    await second.cabinet.tick(SEND_EVERY * 2);
    await second.cabinet.hide();
    expect(second.accounts.calls).toEqual([]);
    expect(second.where()).toBe('device');

    // The site is sure: it is her. The same machine stays on the table, and what was played goes up.
    await second.cabinet.signs(signedIn('ann'));
    expect(second.table.reopens).toBe(0);
    expect(booksIn(second.accounts.text('ann'))).toBe(2);
    expect(second.where()).toBe('account');
  });

  it('goes back to the guest’s machine when nobody turns out to be signed in, and forgets who was', async () => {
    const first = await visited('ann');
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(RESTORING);
    expect(booksIn(second.table.text)).toBe(1);
    await second.cabinet.signs(GUEST);
    expect(second.table.text).toBe(NEW);
    expect(second.accounts.calls).toEqual([]);

    // The next visit does not open with her machine: she signed out, or her session ran out.
    const third = rig();
    third.slots.map = first.slots.map;
    await third.cabinet.start(RESTORING);
    expect(third.table.text).toBe(NEW);
  });

  it('opens as a guest once the site is sure there is nobody, whoever it had expected', async () => {
    const first = await visited('ann');
    const second = rig();
    second.slots.map = first.slots.map;
    await second.cabinet.start({ uid: null, settled: true, expected: true });
    expect(second.table.text).toBe(NEW);
    expect(second.accounts.calls).toEqual([]);
  });

  it('opens as a guest when the site expects nobody, or nobody has played here signed in', async () => {
    const first = await visited('ann');
    const second = rig();
    second.slots.map = first.slots.map;
    await second.cabinet.start({ uid: null, settled: false, expected: false });
    expect(second.table.text).toBe(NEW);

    const fresh = rig();
    await fresh.cabinet.start(RESTORING);
    expect(fresh.table.text).toBe(NEW);
    expect([...fresh.slots.map.keys()]).toEqual([SLOT]);
  });
});

// ── Reset ───────────────────────────────────────────────────────────────────

describe('a reset by a player who is signed in', () => {
  it('puts a new machine on the account in place of the old one, at once', async () => {
    const { cabinet, accounts, table, copy, where } = await visited();
    const before = accounts.count('store');
    await cabinet.reset();
    expect(table.text).toBe(NEW);
    expect(accounts.text('ann')).toBe(NEW);
    expect(accounts.count('store')).toBe(before + 1);
    expect(copy('ann')).toMatchObject({ text: NEW, dirty: false });
    expect(where()).toBe('account');
  });

  it('does not send the old machine on its way out', async () => {
    const { cabinet, accounts } = await visited();
    cabinet.play();
    await cabinet.tick();
    await cabinet.reset();
    expect(accounts.count('storeNow')).toBe(0);
    expect(accounts.text('ann')).toBe(NEW);
  });

  it('is sent when the account can be reached again, and wins over what the account still holds', async () => {
    const first = await visited('ann');
    first.accounts.down = true;
    await first.cabinet.reset();
    expect(first.where()).toBe('offline');
    expect(booksIn(first.accounts.text('ann'))).toBe(1);
    await first.cabinet.leave();

    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    await second.cabinet.start(signedIn('ann'));
    expect(second.table.text).toBe(NEW);
    expect(second.accounts.text('ann')).toBe(NEW);
  });

  /** A player's machine on its way to the account, the write not yet answered, and the machine then reset. */
  async function resetDuringASend() {
    const it = await visited('ann');
    it.accounts.held = [];
    it.cabinet.play();
    await it.cabinet.tick(SEND_EVERY);
    const held = it.accounts.held;
    expect(held).toHaveLength(1);
    const old = it.table.text as string;
    const stores = it.accounts.count('store');
    await it.cabinet.reset();
    expect(it.table.text).toBe(NEW);
    // The new machine cannot go by the ordinary way while the old one is in the air.
    it.cabinet.idle();
    await it.cabinet.tick();
    await it.cabinet.moment();
    expect(it.accounts.count('store')).toBe(stores);
    expect(it.copy('ann')).toMatchObject({ dirty: true, sent: null });
    return { ...it, held, old, stores };
  }

  /** The same device opened again later, by the same player. */
  async function nextVisit(first: Awaited<ReturnType<typeof resetDuringASend>>) {
    const second = rig();
    second.slots.map = first.slots.map;
    second.accounts.docs = first.accounts.docs;
    second.clock.now = first.clock.now + 24 * 3_600_000;
    await second.cabinet.start(signedIn('ann'));
    return second;
  }

  it('waits behind an old machine that is still on its way, and goes the moment that one is answered', async () => {
    const { cabinet, accounts, table, copy, where, held, old, stores } = await resetDuringASend();
    held.splice(0).forEach((answer) => answer());
    await settled();
    // The old machine has landed, and its answer has marked nothing as sent: the new one is behind it already.
    expect(accounts.text('ann')).toBe(old);
    expect(copy('ann')).toMatchObject({ dirty: true });
    expect(accounts.count('store')).toBe(stores + 1);
    held.splice(0).forEach((answer) => answer());
    await cabinet.rest();
    expect(accounts.text('ann')).toBe(table.text);
    expect(booksIn(accounts.text('ann'))).toBe(0);
    expect(copy('ann')).toMatchObject({ text: table.text, dirty: false });
    expect(where()).toBe('account');
  });

  it('is not taken for sent by the old machine’s answer, even when the two machines have the same books', async () => {
    // A machine that had only just become the account's, and is reset before that first write has been answered:
    // by its books the old one cannot be told from the new.
    const { cabinet, accounts, copy, table } = rig();
    accounts.held = [];
    await cabinet.start(signedIn('ann'));
    expect(accounts.held).toHaveLength(1);
    await cabinet.reset();
    expect(booksIn(table.text)).toBe(0);
    accounts.held.splice(0).forEach((answer) => answer());
    await settled();
    expect(copy('ann')).toMatchObject({ dirty: true });
    expect(accounts.count('store')).toBe(2);
    accounts.held.splice(0).forEach((answer) => answer());
    accounts.held = null;
    await cabinet.rest();
    expect(copy('ann')).toMatchObject({ dirty: false, known: 'mark-2' });
  });

  it('is said as the page is left even when the old machine, with the same books, has only just been said', async () => {
    const { cabinet, accounts, copy } = rig();
    accounts.held = [];
    await cabinet.start(signedIn('ann'));
    expect(accounts.held).toHaveLength(1);
    await cabinet.reset();
    // By its books the new machine is what is already in the air. It is not: it is said all the same.
    await cabinet.hide();
    await cabinet.leave();
    expect(accounts.count('storeNow')).toBe(1);
    accounts.held.splice(0).forEach((answer) => answer());
    await settled();
    // The two crossed, so it goes once more by itself.
    expect(accounts.count('store')).toBe(2);
    accounts.held.splice(0).forEach((answer) => answer());
    accounts.held = null;
    await cabinet.rest();
    expect(copy('ann')).toMatchObject({ dirty: false, known: 'mark-3' });
  });

  it('is sent as the page is left though the old machine is still in the air, and survives that one landing last', async () => {
    const first = await resetDuringASend();
    await first.cabinet.hide();
    first.sync.save('left');
    first.sync.close();
    expect(first.accounts.count('storeNow')).toBe(1);
    expect(first.accounts.text('ann')).toBe(first.table.text);
    // The page is gone. The old machine lands after the new one, with the later time on the server's clock.
    first.clock.now += 5000;
    first.held.splice(0).forEach((answer) => answer());
    await settled();
    expect(first.accounts.text('ann')).toBe(first.old);

    // The next visit knows the machine on the account for the one it sent before the reset, and sends the reset.
    const second = await nextVisit(first);
    expect(second.table.text).toBe(first.table.text);
    expect(second.table.reopens).toBe(0);
    expect(booksIn(second.accounts.text('ann'))).toBe(0);
    expect(second.copy('ann')).toMatchObject({ dirty: false });
    expect(second.where()).toBe('account');
  });

  it('survives the old machine landing after it when nothing could be sent as the page was left, or the page was simply gone', async () => {
    for (const going of ['no token in hand', 'no word at all'] as const) {
      const first = await resetDuringASend();
      if (going === 'no token in hand') {
        // Nor can one be fetched: the account is out of reach of this page, though the write in the air still lands.
        first.accounts.ready.clear();
        first.accounts.down = true;
        first.sync.save('hidden');
        first.sync.save('left');
      }
      first.sync.close();
      expect(first.accounts.count('storeNow')).toBe(0);
      first.clock.now += 5000;
      first.held.splice(0).forEach((answer) => answer());
      await settled();
      expect(first.accounts.text('ann')).toBe(first.old);

      const second = await nextVisit(first);
      expect(second.table.text).toBe(first.table.text);
      expect(second.table.reopens).toBe(0);
      expect(booksIn(second.accounts.text('ann'))).toBe(0);
      expect(second.copy('ann')).toMatchObject({ dirty: false });
    }
  });

  it('is still to be sent when the old machine’s write fails, and goes after the wait', async () => {
    const { cabinet, accounts, table, copy, where, held, stores, clock } = await resetDuringASend();
    const before = accounts.text('ann');
    const failedAt = clock.now;
    held.splice(0).forEach((answer) => answer('refused'));
    await settled();
    expect(accounts.text('ann')).toBe(before);
    expect(copy('ann')).toMatchObject({ dirty: true });
    expect(where()).toBe('offline');
    expect(accounts.count('store')).toBe(stores);
    await cabinet.tick(RETRY_AFTER[0] - 5);
    expect(accounts.count('store')).toBe(stores);
    await cabinet.tick(5);
    expect(clock.now - failedAt).toBe(RETRY_AFTER[0] * 1000);
    expect(accounts.count('store')).toBe(stores + 1);
    held.splice(0).forEach((answer) => answer());
    await cabinet.rest();
    expect(accounts.text('ann')).toBe(table.text);
    expect(booksIn(accounts.text('ann'))).toBe(0);
    expect(copy('ann')).toMatchObject({ dirty: false });
    expect(where()).toBe('account');
  });

  it('is still to be sent when the old machine’s write landed and only its answer was lost, on this visit or the next', async () => {
    const first = await resetDuringASend();
    first.held.splice(0).forEach((answer) => answer('answer lost'));
    await settled();
    expect(first.accounts.text('ann')).toBe(first.old);
    expect(first.copy('ann')).toMatchObject({ dirty: true });
    // The page goes before the wait is over.
    first.sync.close();
    const second = await nextVisit(first);
    expect(second.table.text).toBe(first.table.text);
    expect(booksIn(second.accounts.text('ann'))).toBe(0);
    expect(second.copy('ann')).toMatchObject({ dirty: false });
  });

  it('is sent once more when the old machine and the new both arrived, the old one last', async () => {
    const { cabinet, accounts, table, copy, where, held, old, stores } = await resetDuringASend();
    // Hidden with the old machine still in the air: the new one goes at once, and is taken.
    await cabinet.hide();
    expect(accounts.count('storeNow')).toBe(1);
    expect(accounts.text('ann')).toBe(table.text);
    expect(copy('ann')).toMatchObject({ dirty: true });
    // Then the old one lands, and is taken too. The account holds the old machine, and both writes were answered well.
    held.splice(0).forEach((answer) => answer());
    await settled();
    expect(accounts.text('ann')).toBe(old);
    expect(copy('ann')).toMatchObject({ dirty: true });
    // The page was only hidden: the new machine goes again, by itself, and is then the last thing written.
    expect(accounts.count('store')).toBe(stores + 1);
    held.splice(0).forEach((answer) => answer());
    accounts.held = null;
    await cabinet.rest();
    expect(accounts.text('ann')).toBe(table.text);
    expect(booksIn(accounts.text('ann'))).toBe(0);
    expect(copy('ann')).toMatchObject({ dirty: false, sent: null });
    expect(where()).toBe('account');
    await cabinet.tick(SEND_EVERY);
    expect(accounts.count('store')).toBe(stores + 1);
  });

  it('ignores the account’s answer to a read that the reset overtook', async () => {
    const { sync, table, accounts, cabinet } = rig();
    accounts.put('ann', doc(40), 'theirs');
    sync.player(signedIn('ann'));
    table.text = sync.open() ?? NEW;
    sync.save('tick');
    await cabinet.reset();
    expect(table.text).toBe(NEW);
    expect(accounts.text('ann')).toBe(NEW);
    expect(table.reopens).toBe(1);
  });
});

// ── A second document ───────────────────────────────────────────────────────

describe('a copy on the table that is not the account’s own', () => {
  it('is never written to the account, whatever the rule called it', async () => {
    const { cabinet, accounts, slots, table } = rig({ settle: () => ({ kind: 'in-step' }) });
    accounts.put('ann', doc(40), 'theirs');
    await cabinet.start(signedIn('ann'));
    for (let i = 0; i < 4; i++) {
      cabinet.play();
      await cabinet.tick(SEND_EVERY);
    }
    await cabinet.moment();
    await cabinet.hide();
    await cabinet.leave();
    // It is still the guest's machine, in the guest's slot, and the account still has its own.
    expect(slots.map.get(SLOT)).toBe(table.text);
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
    expect(accounts.text('ann')).toBe(doc(40));
  });
});

describe('a second document, with a slot and a rule of its own', () => {
  /** A book of stamps: the two copies are not rivals, and are merged. */
  const book = (stamps: number[]): string => JSON.stringify({ ok: true, books: [...stamps].sort((a, b) => a - b).join('+') });
  const stampsIn = (text: string | null): number[] =>
    text === null
      ? []
      : (JSON.parse(text) as { books: string }).books
          .split('+')
          .filter(Boolean)
          .map(Number);
  const merge = ({ account, device, guest }: Standing): Verdict => {
    if (account.kind === 'unreadable') return { kind: 'hold' };
    const here = stampsIn(device?.text ?? guest);
    if (account.kind === 'none') return device ? { kind: 'send' } : { kind: 'adopt' };
    const there = stampsIn(account.text);
    const both = book([...new Set([...here, ...there])]);
    if (both === account.text) return device && device.text === both ? { kind: 'in-step' } : { kind: 'take', text: both, send: false };
    return { kind: 'take', text: both, send: true };
  };

  it('is kept by the same keeper: the union of both copies goes onto the device and onto the account', async () => {
    const clock = { now: 5_000_000 };
    const slots = new FakeSlots();
    const accounts = new FakeAccounts(() => clock.now);
    accounts.put('ann', book([1, 2, 3]), 'theirs');
    slots.map.set('stamps', book([3, 4]));
    const table = { text: null as string | null, asked: false };
    const sync = createSync({
      kept: {
        slot: 'stamps',
        current: () => table.text,
        reads: (text) => text.includes('"ok":true'),
        print: (text) => text,
        settle: merge,
        reopen: () => {
          table.asked = true;
        },
      },
      store: accounts.store,
      slots: () => slots,
      now: () => clock.now,
      mark: () => 'merged',
      onStatus: () => undefined,
    });
    sync.player(signedIn('ann'));
    table.text = sync.open();
    expect(stampsIn(table.text)).toEqual([3, 4]);
    await settled();
    expect(table.asked).toBe(true);
    sync.save('left');
    table.text = sync.open();
    sync.save('tick');
    await settled();
    expect(stampsIn(table.text)).toEqual([1, 2, 3, 4]);
    expect(stampsIn(accounts.text('ann'))).toEqual([1, 2, 3, 4]);
    // The machine’s slots are not touched by it, nor its by the machine’s.
    expect([...slots.map.keys()].every((key) => key.startsWith('stamps'))).toBe(true);
  });
});
