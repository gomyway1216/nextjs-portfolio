import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BEST_LEFT, BEST_RIGHT, FATE_SLOTS, LEND_BALLS, LEND_MEDALS, attackerOpen, busy, copyMachine, drawBall, newMachine, tick, type BallDraw, type Machine } from '@/components/game/Pachinko/engine';
import {
  PACHINKO_GAME,
  QUEUE,
  SESSION_KEY,
  createTable,
  parseSession,
  roundId,
  sameSkip,
  serializeSession,
  sessionKey,
  type SessionRecord,
  type Table,
} from '@/components/game/Pachinko/medalTable';
import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger, take } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Goldfish Lantern Pachinko lends balls for the medal center's medals and counts them back: a lend's five medals are
// taken once, a count's medals come back once, and a hit's rounds are paid in full, once, whatever happens to the page:
// a reload, another tab, a reset, or a browser that dies between two writes. The bank here is the real one
// (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is fetched and no account is real.

const ball = (fate: number, lot = 65_535, split = 99, show = 1_023, seed = 7): BallDraw => ({ fate, lot, split, show, seed });
/** A ball into the ヘソ at the best strength whose hold is a hit in any mode: from the ヘソ's split, 4 rounds and ST. */
const HIT = ball(0, 0, 10, 0, 12_345);
/** A ball into the ヘソ whose hold misses, a plain spin. */
const MISS = ball(0);
/** A ball that goes OUT at the best left strength. */
const OUT = ball(FATE_SLOTS - 1);
/** The balls the rounds of a 4-round hit leave in the tray, net: ten fired and a hundred paid a round. */
const FOUR_ROUNDS_NET = 4 * (100 - 10);

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const session = (browser: FakeBrowser, owner: string | null = null): SessionRecord | null => parseSession(browser.storage.get(sessionKey(owner)) ?? null);
const out = (browser: FakeBrowser) => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);

/** Random numbers for the balls drawn outside a press, the same every time. */
const seededRandom = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a hit's rounds are played out as the card goes. */
function machineOn(page: FakePage) {
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table: Table = createTable({
    bank: page.bank,
    storage: page.env,
    holding: () => seat.current?.holding() ?? false,
    newId: () => page.browser.name('r'),
    random: seededRandom(99),
    draw: drawBall,
  });
  let now: SessionRecord | null = null;
  seat.current = page.bank.sit(PACHINKO_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      yielded.push(why);
      now = table.leaving() ?? now;
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    table.clear();
    now = null;
    page.bank.restarted(PACHINKO_GAME);
  });
  const machine = {
    table,
    seat: seat.current,
    yielded,
    /** The session as the page holds it, read first when it has none. */
    now(): SessionRecord | null {
      now ??= table.open();
      return now;
    },
    lend(draws: BallDraw[] = []) {
      const outcome = table.lend(draws);
      now = table.session();
      return outcome;
    },
    count() {
      const medals = table.count();
      now = table.session();
      return medals;
    },
    /** One slot: a ball at `strength` (none for null), then the machine. */
    step(strength: number | null) {
      const at = machine.now();
      if (!at) return null;
      const done = table.step(strength, at);
      if (done) now = done.record;
      return done;
    },
    /** Plays on as perfect play does until nothing is left to come: right while the attacker is open, nothing otherwise. */
    playOut(limit = 2_000) {
      for (let i = 0; i < limit; i++) {
        const at = machine.now();
        if (!at || !busy(at.machine)) return at;
        machine.step(attackerOpen(at.machine) ? BEST_RIGHT : null);
      }
      return machine.now();
    },
  };
  return machine;
}

/** A page that is killed without a word: no `pagehide`, the card let go by the browser. */
function crash(browser: FakeBrowser, page: FakePage): void {
  page.closed = true;
  page.watchers = null;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
  const next = browser.queue.shift();
  if (next) browser.tasks.push(() => browser.give2(next));
}

describe('lending and counting', () => {
  it('names a lend so that no two share a name, within the length a round allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => roundId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('lends 50 balls for 5 medals, keeps the medals out while balls are left, and counts them back ten to a medal, rounded down', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    expect(machine.lend([OUT, OUT, OUT])).toBe('lent');
    expect(stored(browser)).toBe(WELCOME - LEND_MEDALS);
    expect(session(browser)).toMatchObject({ tray: LEND_BALLS, pending: null });
    expect(session(browser)?.queue).toHaveLength(3);
    expect(out(browser)).toEqual([PACHINKO_GAME]);
    // Three balls OUT: 47 left, 4 medals at the counter and 7 balls stay in the tray.
    for (let i = 0; i < 3; i++) expect(machine.step(BEST_LEFT)?.slot.ball?.fired.pocket).toBe('out');
    expect(session(browser)?.tray).toBe(LEND_BALLS - 3);
    expect(machine.count()).toBe(4);
    expect(stored(browser)).toBe(WELCOME - LEND_MEDALS + 4);
    expect(session(browser)?.tray).toBe(7);
    expect(out(browser)).toEqual([PACHINKO_GAME]);
    // Too few balls for a medal: nothing to count.
    expect(machine.count()).toBeNull();
    // The last seven balls fired, all OUT: nothing is left, so no medals are out, and no receipt of the machine's is kept.
    machine.table.topUp(Array.from({ length: 7 }, () => OUT));
    for (let i = 0; i < 7; i++) machine.step(BEST_LEFT);
    expect(session(browser)).toMatchObject({ tray: 0, lent: null });
    expect(out(browser)).toEqual([]);
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.filter((id) => id.startsWith(`${PACHINKO_GAME}:`))).toEqual([]);
  });

  it('takes nothing it should not: too few medals, a page without the card', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(BANK_KEY, serializeLedger(take(createLedger('fewmedals01'), WELCOME - 3)!));
    const one = machineOn(browser.open());
    await quiet(browser);
    expect(one.lend()).toBe('short');
    expect(stored(browser)).toBe(3);
    expect(browser.storage.has(SESSION_KEY)).toBe(false);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.lend([])).toBe('away');
    expect(stored(browser)).toBe(3);
  });

  it('keeps the medals out while a hold or a spin is left with the tray empty, and lets them out when it is done', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.lend([MISS, ...Array.from({ length: QUEUE - 1 }, () => OUT)]);
    // The first ball into the ヘソ (a hold, and 3 balls), then every ball counted out but two, which go OUT.
    machine.step(BEST_LEFT);
    expect(machine.count()).toBe(5);
    expect(session(browser)?.tray).toBe(2);
    machine.step(BEST_LEFT);
    machine.step(BEST_LEFT);
    let at = session(browser)!;
    expect(at.tray).toBe(0);
    if (busy(at.machine)) {
      expect(out(browser)).toEqual([PACHINKO_GAME]);
      at = machine.playOut()!;
    }
    expect(at).toMatchObject({ tray: 0, lent: null });
    expect(out(browser)).toEqual([]);
  });

  it('draws ahead in the press: the next balls fired use the draws it was given, and the queue keeps no more than its length', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.lend([MISS]);
    const first = machine.step(BEST_LEFT)!;
    expect(first.slot.ball?.draw).toEqual(MISS);
    expect(first.slot.ball?.fired).toMatchObject({ pocket: 'heso', paid: 3, held: 1 });
    machine.table.topUp(Array.from({ length: QUEUE + 5 }, () => OUT));
    expect(session(browser)?.queue).toHaveLength(QUEUE);
  });
});

describe('the re-entrancy of the bank', () => {
  it('never squares the lend being made: the bank tells its listeners inside the press, and the balls go in once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const seen: (number | null)[] = [];
    let inside = false;
    page.bank.subscribe(() => {
      if (inside) seen.push(machine.table.open()?.tray ?? null);
    });
    inside = true;
    expect(machine.table.lend([])).toBe('lent');
    expect(machine.table.count()).toBe(LEND_BALLS / 10);
    inside = false;
    expect(seen.length).toBeGreaterThan(0);
    expect(session(browser)?.tray).toBe(0);
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('a hit, whatever happens to the page', () => {
  /** Lends, fires the hit ball, and waits for its spin to stop: the fanfare of a 4-round hit has begun. */
  const toTheHit = (machine: ReturnType<typeof machineOn>) => {
    machine.lend([HIT]);
    machine.step(BEST_LEFT);
    for (let i = 0; i < 500 && !machine.now()?.machine.bonus; i++) machine.step(null);
    expect(machine.now()?.machine.bonus).toMatchObject({ kind: { rounds: 4, after: 'st' }, stage: 'fanfare' });
  };

  it('pays a hit played on the page: four rounds of ten balls, a hundred each, and ST after them', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    toTheHit(machine);
    const after = machine.playOut()!;
    expect(after.tray).toBe(LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET);
    expect(after.machine).toMatchObject({ mode: 'st', left: 30, bonus: null });
    expect(after.away).toBeNull();
  });

  it('plays out the rounds as the page is left, at strength 6, and says so on return; the reloaded page pays nothing twice', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    toTheHit(machine);
    // Partway into round 1.
    for (let i = 0; i < 12; i++) machine.step(attackerOpen(machine.now()!.machine) ? BEST_RIGHT : null);
    const left = machine.now()!.tray;
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    // The note tells what the tray gained while the page was away: the balls paid less the balls fired into the attacker.
    expect(session(browser)).toMatchObject({ tray: LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET, away: { rounds: 4, balls: LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET - left }, machine: { mode: 'st', bonus: null } });
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.now()).toMatchObject({ tray: LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET, away: { rounds: 4 } });
    reloaded.table.told();
    expect(session(browser)?.away).toBeNull();
    expect(stored(browser)).toBe(WELCOME - LEND_MEDALS);
  });

  it('plays out the rounds of a page killed mid-hit as the next page opens, once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    toTheHit(first);
    crash(browser, killed);
    expect(session(browser)?.machine.bonus).not.toBeNull();
    const next = machineOn(browser.open());
    await quiet(browser);
    expect(next.now()).toMatchObject({ tray: LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET, away: { rounds: 4, balls: FOUR_ROUNDS_NET }, machine: { bonus: null, mode: 'st' } });
    const again = machineOn(browser.open());
    await quiet(browser);
    expect(again.now()?.tray).toBe(LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET);
  });

  it('fires the machine’s own balls at the open attacker when the tray is empty, taken back out of what it pays', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    toTheHit(machine);
    // No counting during a hit. Nothing in the tray as round 1 opens.
    const tray = machine.now()!.tray;
    expect(machine.count()).toBeNull();
    machine.now()!.tray = 0;
    for (let i = 0; i < 20 && !attackerOpen(machine.now()!.machine); i++) machine.step(null);
    const credit = machine.step(BEST_LEFT)!;
    expect(credit.slot.ball).toMatchObject({ strength: BEST_RIGHT, credit: true, fired: { pocket: 'attacker' } });
    expect(credit.record.tray).toBe(9);
    expect(tray).toBeGreaterThan(0);
  });
});

describe('the medal center’s reset', () => {
  it('voids the session: the balls and holds go with the medals', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.lend([HIT]);
    machine.step(BEST_LEFT);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(SESSION_KEY)).toBe(false);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.now()).toBeNull();
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
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
    expect(page.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - LEND_MEDALS });
    expect(machine.table.open()).toMatchObject({ owner: UID, tray: LEND_BALLS });
    expect(session(browser, UID)?.tray).toBe(LEND_BALLS);
    expect(browser.storage.has(SESSION_KEY)).toBe(false);
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(machine.table.open()).toBeNull();
  });
});

describe('a browser that dies between two writes', () => {
  // The session and the medals are separate writes: the browser is killed at every moment between them and started
  // again, and the next page squares what it left. Every lend is made once or never, every count paid once, and a hit's
  // rounds are paid once, in full.
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

  it('lends once or not at all, and counts once, wherever the browser dies', async () => {
    const writes = await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.table.lend([]);
        machine.table.count();
      },
      async (after, reached) => {
        const machine = await reopened(after);
        const medals = stored(after)!;
        const tray = machine.now()?.tray ?? 0;
        // Medals and balls together are what the player had: nothing lost, nothing made.
        expect(medals * 10 + tray, `died after ${reached} writes`).toBe(WELCOME * 10);
        expect(machine.now()?.pending ?? null, `died after ${reached} writes`).toBeNull();
      },
    );
    expect(writes).toBeGreaterThanOrEqual(4);
  });

  it('pays a hit’s rounds once, in full, wherever the browser dies from the lend to the end of the rounds', async () => {
    let full: number | null = null;
    const writes = await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.table.lend([HIT]);
        let at = machine.table.open();
        // The hit ball, its spin, and the rounds played on the page.
        for (let i = 0; i < 400 && at; i++) {
          const strength = i === 0 ? BEST_LEFT : attackerOpen(at.machine) ? BEST_RIGHT : null;
          const done = machine.table.step(strength, at);
          if (!done) break;
          at = done.record;
          if (i > 0 && !busy(at.machine)) break;
        }
      },
      async (after, reached) => {
        const machine = await reopened(after);
        const lent = stored(after) === WELCOME - LEND_MEDALS;
        if (!lent) {
          expect(stored(after), `died after ${reached} writes`).toBe(WELCOME);
          expect(machine.now()?.tray ?? 0).toBe(0);
          return;
        }
        // Played on the same way to the end: the hit ball fired if it was not, and every round paid.
        let at = machine.now()!;
        if (at.tray === LEND_BALLS && !busy(at.machine)) at = machine.step(BEST_LEFT)!.record;
        at = machine.playOut()!;
        full ??= at.tray;
        expect(at.tray, `died after ${reached} writes`).toBe(full);
        expect(at.tray).toBe(LEND_BALLS - 1 + 3 + FOUR_ROUNDS_NET);
      },
    );
    // The lend's two, the hit ball's, every slot of its spin and of the four rounds, and the medals let out at the end.
    expect(writes).toBeGreaterThan(60);
  });
});

describe('reading a session back', () => {
  it('reads back only a session it could have written: every field checked', () => {
    const good: SessionRecord = {
      v: 1,
      owner: null,
      ledger: 'device00001',
      era: 0,
      tray: 12,
      machine: { mode: 'normal', left: 0, q1: [{ lot: 1, split: 2, show: 3, seed: 4 }], q2: [], spin: null, bonus: null, rush: null },
      queue: [OUT],
      pending: null,
      lent: 'abc',
      away: null,
    };
    expect(parseSession(serializeSession(good))).toEqual(good);
    const bad: unknown[] = [
      null,
      'not json',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, tray: -1 }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      JSON.stringify({ ...good, machine: { ...good.machine, mode: 'st', left: 0 } }),
      JSON.stringify({ ...good, machine: { ...good.machine, q1: Array.from({ length: 5 }, () => good.machine.q1[0]) } }),
      JSON.stringify({ ...good, queue: Array.from({ length: QUEUE + 1 }, () => OUT) }),
      JSON.stringify({ ...good, queue: [{ ...OUT, fate: FATE_SLOTS }] }),
      JSON.stringify({ ...good, pending: { kind: 'steal', id: 'x', medals: 1, balls: 1 } }),
      JSON.stringify({ ...good, machine: { ...good.machine, spin: { from: 1, hold: { lot: 0, split: 0, show: 0, seed: 0 }, mode: 'normal', hit: false, kind: 'plain', phase: 0, age: 1 } } }),
    ];
    for (const text of bad) expect(parseSession(text)).toBeNull();
  });
});

describe('Skip, and the screen a ball’s flight behind the rules', () => {
  const hold = { lot: 0, split: 10, show: 0, seed: 9 };
  const reach = (seed = hold.seed): Machine => ({ ...newMachine(), spin: { from: 1, hold: { ...hold, seed }, mode: 'normal', hit: true, kind: 'nr', phase: 1, age: 2 } });

  it('cuts short what the screen shows only while the rules are still at it', () => {
    const shown = reach();
    expect(sameSkip(shown, reach())).toBe(true);
    // The rules two slots on: the reach has stopped, and the hit's fanfare begun.
    const fanfare = copyMachine(shown);
    tick(fanfare, () => true);
    expect(fanfare.bonus?.stage).toBe('fanfare');
    expect(sameSkip(shown, fanfare)).toBe(false);
    // Another spin's reach is not the one shown.
    expect(sameSkip(shown, reach(10))).toBe(false);
    // The fanfare shown, and the rules still in it: cut short. The rules' round open: nothing to cut.
    expect(sameSkip(fanfare, copyMachine(fanfare))).toBe(true);
    const open = copyMachine(fanfare);
    while (open.bonus?.stage === 'fanfare') tick(open);
    expect(sameSkip(fanfare, open)).toBe(false);
    // A plain spin shown: nothing to cut.
    expect(sameSkip({ ...newMachine(), spin: { ...reach().spin!, hit: false, kind: 'plain', phase: 0 } }, reach())).toBe(false);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts', 'analysis.ts', 'published.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/Pachinko', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
