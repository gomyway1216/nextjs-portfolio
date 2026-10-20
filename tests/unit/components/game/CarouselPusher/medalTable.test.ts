import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LOTTERY } from '@/components/game/CarouselPusher/lottery';
import { atRest, busy, freshMachine, step } from '@/components/game/CarouselPusher/engine';
import { CAROUSEL_GAME, LEND, SESSION_KEY, createTable, live, parseSession, roundId, seedFor, serializeSession, sessionKey, type SessionRecord, type Table } from '@/components/game/CarouselPusher/medalTable';
import { BANK_KEY, ledgerKey } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger, take } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Cherry Blossom Carousel plays with the medal center's medals: a handful goes into its slot once, the tray's medals
// come back once, and what is left in the slot goes back once, whatever happens to the page: a reload, another tab, a
// reset, or a browser that dies between two writes. The bank here is the real one (MedalCenter/bank.ts) in a fake
// browser (bankFakes.ts); nothing is fetched and no account is real.

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const session = (browser: FakeBrowser, owner: string | null = null): SessionRecord | null => parseSession(browser.storage.get(sessionKey(owner)) ?? null);
const out = (browser: FakeBrowser) => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and writes the session down as the card goes. */
function machineOn(page: FakePage) {
  const seat: { current: ReturnType<FakePage['bank']['sit']> | null } = { current: null };
  const table: Table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('r') });
  let now: SessionRecord | null = null;
  seat.current = page.bank.sit(CAROUSEL_GAME, {
    granted: () => undefined,
    yielding: () => {
      if (now) now = table.save(now);
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    table.clear();
    now = null;
    page.bank.restarted(CAROUSEL_GAME);
  });
  const machine = {
    table,
    seat: seat.current,
    now(): SessionRecord | null {
      now ??= table.session();
      return now;
    },
    lend() {
      const done = table.lend(machine.now()!);
      now = done.record;
      return done.outcome;
    },
    feed(u = 0.5, v = 0.5, ticket = 0.9) {
      return table.feed(machine.now()!, u, v, ticket);
    },
    /** The machine stepped on until nothing more is on its way to the player. */
    settle(limit = 4_000) {
      const m = machine.now()!.machine;
      for (let i = 0; i < limit && (busy(m) || !atRest(m)); i++) step(m, LOTTERY);
    },
    collect() {
      const done = table.collect(machine.now()!);
      if (done) now = done;
      return done;
    },
    giveBack() {
      const done = table.giveBack(machine.now()!);
      if (done) now = done;
      return done;
    },
    save() {
      now = table.save(machine.now()!);
      return now;
    },
  };
  return machine;
}

describe('the slot, the tray and the medals', () => {
  it('names a move so that no two share a name, within the length a round allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => roundId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('opens the same untouched machine for a device until it is played', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    const first = machine.now()!;
    expect(first.credit).toBe(0);
    expect(first.machine).toEqual(freshMachine(seedFor(first.ledger, first.era)));
    expect(browser.storage.has(SESSION_KEY)).toBe(false);
  });

  it('puts a handful into the slot, feeds from it, counts the tray in, gives the rest back, and lets the medals out when nothing is left', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.lend()).toBe('lent');
    expect(stored(browser)).toBe(WELCOME - LEND);
    expect(session(browser)).toMatchObject({ credit: LEND, pending: null });
    expect(out(browser)).toEqual([CAROUSEL_GAME]);
    for (let i = 0; i < 3; i++) expect(machine.feed()).toBe(true);
    expect(machine.now()!.credit).toBe(LEND - 3);
    machine.settle();
    // Whatever came back off the field and from the counter is in the tray; it goes into the medals at once.
    const tray = machine.now()!.machine.tray;
    machine.collect();
    expect(stored(browser)).toBe(WELCOME - LEND + tray);
    expect(machine.now()!.machine.tray).toBe(0);
    expect(out(browser)).toEqual([CAROUSEL_GAME]);
    // The slot's last seven back: nothing left in it, in the tray or on the way, so no medals are out.
    machine.giveBack();
    expect(stored(browser)).toBe(WELCOME - 3 + tray);
    expect(session(browser)).toMatchObject({ credit: 0, lent: null });
    expect(out(browser)).toEqual([]);
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.filter((id) => id.startsWith(`${CAROUSEL_GAME}:`))).toEqual([]);
  });

  it('puts in what is left when fewer than a handful, takes nothing from none, and nothing without the card', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(BANK_KEY, serializeLedger(take(createLedger('fewmedals02'), WELCOME - 3)!));
    const one = machineOn(browser.open());
    await quiet(browser);
    expect(one.lend()).toBe('lent');
    expect(one.now()!.credit).toBe(3);
    expect(stored(browser)).toBe(0);
    expect(one.lend()).toBe('short');
    for (let i = 0; i < 3; i++) expect(one.feed()).toBe(true);
    expect(one.feed()).toBe(false);
    // Another tab takes the card: this page can neither put medals in nor feed nor count the tray in.
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.lend(one.now()!).outcome).toBe('away');
    expect(one.table.feed(one.now()!, 0.5, 0.5, 0.5)).toBe(false);
    expect(one.table.collect(one.now()!)).toBeNull();
  });

  it('keeps the medals out while a medal is on its way or a spin is to come, with the slot and the tray empty', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.lend();
    machine.feed();
    const rest = machine.now()!.credit;
    for (let i = 0; i < rest; i++) machine.feed();
    expect(machine.now()!.credit).toBe(0);
    machine.save();
    expect(live(machine.now()!)).toBe(true);
    expect(out(browser)).toEqual([CAROUSEL_GAME]);
    machine.settle();
    machine.collect();
    machine.save();
    expect(live(machine.now()!)).toBe(false);
    expect(out(browser)).toEqual([]);
  });

  it('keeps the field where it was through a reload: the next page opens the machine as it was written down', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    machine.lend();
    for (let i = 0; i < 5; i++) machine.feed(i / 5, 0.5);
    machine.settle();
    machine.collect();
    const kept = machine.save()!.machine;
    before.hide('left');
    before.close();
    const after = machineOn(browser.open());
    await quiet(browser);
    const back = after.now()!.machine;
    expect(back.ids).toEqual(kept.ids);
    expect(back.step).toBe(kept.step);
    for (let i = 0; i < kept.xy.length; i++) expect(Math.abs(back.xy[i] - kept.xy[i])).toBeLessThanOrEqual(5e-5);
  });
});

describe('the re-entrancy of the bank', () => {
  it('never squares the move being made: the bank tells its listeners inside the press, and `leftover` finds nothing then', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const seen: (SessionRecord | null)[] = [];
    let inside = false;
    page.bank.subscribe(() => {
      if (inside) seen.push(machine.table.leftover());
    });
    inside = true;
    expect(machine.lend()).toBe('lent');
    machine.feed();
    machine.now()!.machine.tray = 4;
    machine.collect();
    machine.giveBack();
    inside = false;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((left) => left === null)).toBe(true);
    // Each move made once: the handful in, four from the tray, and nine back from the slot.
    expect(stored(browser)).toBe(WELCOME - LEND + 4 + (LEND - 1));
  });

  it('squares a session another page left half-made, once', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.lend();
    const record = machine.now()!;
    // A page wrote down a handful into the tray and died before the medals moved.
    browser.storage.set(sessionKey(null), serializeSession({ ...record, pending: { kind: 'pay', id: 'leftover1', medals: 6 } }));
    const left = machine.table.leftover();
    expect(left).toMatchObject({ pending: null, credit: LEND });
    expect(stored(browser)).toBe(WELCOME - LEND + 6);
    expect(machine.table.leftover()).toBeNull();
    expect(stored(browser)).toBe(WELCOME - LEND + 6);
  });
});

describe('the medal center’s reset', () => {
  it('voids the session: the slot, the field and the dish go with the medals', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.lend();
    machine.feed();
    machine.save();
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(SESSION_KEY)).toBe(false);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.now()).toMatchObject({ credit: 0, lent: null });
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-7';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s session along when the first sign-in moves the medals into the account', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.lend();
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - LEND });
    expect(machine.table.session()).toMatchObject({ owner: UID, credit: LEND });
    expect(session(browser, UID)?.credit).toBe(LEND);
    expect(browser.storage.has(SESSION_KEY)).toBe(false);
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(machine.table.session()).toMatchObject({ owner: null, credit: 0 });
  });
});

describe('a browser that dies between two writes', () => {
  // The session and the medals are separate writes: the browser is killed at every moment between them and started
  // again, and the next page squares what it left. Every handful into the slot is made once or never, and every handful
  // into the tray, or back from the slot, is paid once.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  const setUp = async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machines.set(browser, machine);
    return browser;
  };
  const reopened = async (after: FakeBrowser) => {
    const machine = machineOn(after.open());
    await quiet(after);
    machine.now();
    return machine;
  };

  it('puts a handful in once or not at all, and gives the slot back once, wherever the browser dies', async () => {
    const writes = await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.lend();
        machine.giveBack();
      },
      async (after, reached) => {
        const machine = await reopened(after);
        const record = machine.now()!;
        expect(stored(after)! + record.credit, `died after ${reached} writes`).toBe(WELCOME);
        expect(record.pending, `died after ${reached} writes`).toBeNull();
      },
    );
    expect(writes).toBeGreaterThanOrEqual(4);
  });

  it('pays the tray once, wherever the browser dies between feeding, writing the field down, counting the tray in and giving the slot back', async () => {
    const writes = await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.lend();
        for (let i = 0; i < 3; i++) machine.feed();
        // As though seven medals had come back off the field.
        machine.now()!.machine.tray += 7;
        machine.save();
        machine.collect();
        machine.giveBack();
      },
      async (after, reached) => {
        const machine = await reopened(after);
        const record = machine.now()!;
        const total = stored(after)! + record.credit + record.machine.tray;
        // Either the field was never written down with its three medals fed and seven won (and the slot still holds the
        // handful), or it was, and nothing is lost or made after it, however far the moves went.
        // The machine counts the medals fed towards its dish: three, once the field was written down with them.
        const written = record.machine.toStock === 3;
        expect(total, `died after ${reached} writes`).toBe(written ? WELCOME - 3 + 7 : WELCOME);
        expect(record.pending, `died after ${reached} writes`).toBeNull();
      },
    );
    expect(writes).toBeGreaterThanOrEqual(7);
  });
});

describe('reading a session back', () => {
  it('reads back only a session it could have written: every field checked', () => {
    const good: SessionRecord = { v: 1, owner: null, ledger: 'device00001', era: 0, credit: 7, machine: freshMachine(3), pending: null, lent: 'abc' };
    const read = parseSession(serializeSession(good))!;
    expect(read.credit).toBe(7);
    expect(read.still).toBe(false);
    expect(parseSession(serializeSession({ ...good, still: true }))?.still).toBe(true);
    expect(read.machine.ids).toEqual(good.machine.ids);
    const machine = good.machine;
    const bad: unknown[] = [
      null,
      'not json',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, credit: -1 }),
      JSON.stringify({ ...good, credit: 1_000 }),
      JSON.stringify({ ...good, still: 'yes' }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      JSON.stringify({ ...good, pending: { kind: 'steal', id: 'x', medals: 1 } }),
      JSON.stringify({ ...good, machine: { ...machine, xy: machine.xy.slice(1) } }),
      JSON.stringify({ ...good, machine: { ...machine, xy: [Number.NaN, ...machine.xy.slice(1)] } }),
      JSON.stringify({ ...good, machine: { ...machine, holds: 5 } }),
      JSON.stringify({ ...good, machine: { ...machine, stock: 10 } }),
      JSON.stringify({ ...good, machine: { ...machine, tickets: [1.5] } }),
      JSON.stringify({ ...good, machine: { ...machine, ids: machine.ids.map(() => 1) } }),
      JSON.stringify({ ...good, machine: { ...machine, spin: { outcome: 0, digits: [1, 2, 3], from: 0, stops: [36, 54, 150], at: 210 } } }),
      JSON.stringify({ ...good, machine: { ...machine, air: [{ k: 'teleport', id: 99_999, from: 0, at: 1 }] } }),
    ];
    for (const text of bad) expect(parseSession(text)).toBeNull();
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts', 'lottery.ts', 'published.ts', 'sim.ts', 'save.ts', 'view.ts', 'draw.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/CarouselPusher', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
