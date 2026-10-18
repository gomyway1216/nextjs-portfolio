import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { TIMEOUT, playOf, type Draw } from '@/components/game/CoinMaze/engine';
import { COIN_MAZE_GAME, PLAY_KEY, createTable, parsePlay, playId, playKey, serializePlay, type PlayRecord, type Staked } from '@/components/game/CoinMaze/medalTable';
import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Candy Shop Medal Maze plays with the medal center's medals: a play's medal is taken once, what it wins comes back
// once, and none of it is lost or doubled by a reload, another tab, a reset or a browser that dies between two writes.
// A play left unfinished is finished by the next page that holds the card: its flicks as written down, the rest blind
// at the windows drawn with it. The bank here is the real one (MedalCenter/bank.ts) in a fake browser (bankFakes.ts);
// nothing is fetched and no account is real.

/**
 * A play drawn so: every gate on its first setting (window 1 open at all four), the pins right, right, left, left (the
 * middle pocket, WIN, 2 medals), and a blind flick at window 1 too, so that a play finished blind ends as one flicked
 * at window 1 does.
 */
const draw = (over: Partial<Draw> = {}): Draw => ({ gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [1, 1, 1, 1], pins: [true, true, false, false], ...over });
const WIN_PLAY = draw();
const BIG_PLAY = draw({ pins: [true, true, true, true] });
/** Blind flicks that would all hit a shut gate (window 7 is shut on every gate's first setting). */
const SHUT_BLIND = draw({ blinds: [7, 7, 7, 7] });
const OPEN = 1;
const SHUT = 7;

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): PlayRecord | null => parsePlay(browser.storage.get(playKey(owner)) ?? null);
const out = (browser: FakeBrowser) => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a play under way is finished as the card goes. */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('play') });
  seat.current = page.bank.sit(COIN_MAZE_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      yielded.push(why);
      if (running && !running.paid && !running.void) table.settle(running);
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (running) running.void = true;
    table.clear();
    page.bank.restarted(COIN_MAZE_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** DROP: the play is drawn (here: given) and the medal taken. */
    drop(d: Draw = WIN_PLAY): Staked | null {
      const outcome = table.stake(d);
      running = outcome.kind === 'staked' ? outcome.staked : null;
      return running;
    },
    /** The lever, at the gate the medal waits at. */
    flick(window: number) {
      return running ? table.flick(running, running.record.flicks.length, window) : 'gone';
    },
    /** The medal comes to rest on this page (or Skip is pressed). */
    stop() {
      const ran = running;
      running = null;
      return ran ? table.settle(ran) : null;
    },
    running: () => running,
  };
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

const finishLeft = (machine: ReturnType<typeof machineOn>) => {
  const left = machine.table.leftover();
  return left ? { left, settled: machine.table.settle({ record: left, stored: true, paid: false, void: false }) } : null;
};

describe('a play, once', () => {
  it('names a play so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => playId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('takes the medal once at DROP, writes each flick down, and pays once as the medal comes to rest', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    const staked = machine.drop(WIN_PLAY);
    expect(staked?.record).toMatchObject({ owner: null, era: 0, flicks: [], paid: false });
    expect(stored(browser)).toBe(WELCOME - 1);
    expect(out(browser)).toEqual([COIN_MAZE_GAME]);
    for (let s = 0; s < 4; s++) {
      expect(machine.flick(OPEN)).toBe('kept');
      expect(record(browser)?.flicks).toHaveLength(s + 1);
    }
    // No fifth gate.
    expect(machine.flick(OPEN)).toBe('gone');
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 2);
    expect(record(browser)).toMatchObject({ flicks: [OPEN, OPEN, OPEN, OPEN], paid: true });
    expect(out(browser)).toEqual([]);
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 1 + 2);
    // The next play pays the BIG WIN, and lets go of the last one's receipts.
    machine.drop(BIG_PLAY);
    for (let s = 0; s < 4; s++) machine.flick(OPEN);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 2 - 1 + 5);
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.every((id) => id.startsWith(`${COIN_MAZE_GAME}:${record(browser)!.id}:`))).toBe(true);
  });

  it('ends at a shut gate or a medal left too long, pays nothing, and lets the medal out no longer', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.drop(WIN_PLAY);
    machine.flick(OPEN);
    expect(machine.flick(SHUT)).toBe('kept');
    // The medal fell OUT at gate 2: no more flicks.
    expect(machine.flick(OPEN)).toBe('gone');
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1);
    expect(out(browser)).toEqual([]);
    expect(playOf(record(browser)!.draw, record(browser)!.flicks).outAt).toBe(1);
    machine.drop(WIN_PLAY);
    expect(machine.flick(TIMEOUT)).toBe('kept');
    expect(machine.stop()).toBe('paid');
    expect(record(browser)?.flicks).toEqual([TIMEOUT]);
    expect(stored(browser)).toBe(WELCOME - 2);
  });

  it('finishes a play left mid-way with the flicks made and the rest blind, at the windows drawn with it', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.drop(draw({ blinds: [1, 1, SHUT, 1] }));
    machine.flick(OPEN);
    expect(machine.stop()).toBe('paid');
    expect(record(browser)).toMatchObject({ flicks: [OPEN, 1, SHUT], paid: true });
    expect(stored(browser)).toBe(WELCOME - 1);
  });

  it('takes nothing it should not: a draw it could not make, a medal the player does not have, a page without the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake({ ...WIN_PLAY, gates: [8, 0, 0, 0] }).kind).toBe('short');
    expect(one.table.stake({ ...WIN_PLAY, pins: [true] }).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake(WIN_PLAY).kind).toBe('away');
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
  });

  it('plays no second play while one of these medals is unfinished: it is finished first', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    first.drop(WIN_PLAY);
    crash(browser, killed);
    const next = machineOn(browser.open());
    await quiet(browser);
    expect(next.table.stake(WIN_PLAY).kind).toBe('unfinished');
    expect(finishLeft(next)?.settled).toBe('paid');
    expect(next.table.stake(WIN_PLAY).kind).toBe('staked');
  });
});

describe('the re-entrancy of the bank', () => {
  it('never takes the play being staked for one left unfinished: the bank tells its listeners inside DROP', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const found: (string | null)[] = [];
    let inside = false;
    page.bank.subscribe(() => {
      if (inside) found.push(machine.table.leftover()?.id ?? null);
    });
    inside = true;
    const staked = machine.drop(WIN_PLAY);
    inside = false;
    // The bank told its listeners as the medal went in and as the last play's receipts were let go of: none found a play to finish.
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((id) => id === null)).toBe(true);
    // And the medal is still out on the play: a look from inside the press settled nothing.
    expect(out(browser)).toEqual([COIN_MAZE_GAME]);
    expect(staked?.record.flicks).toEqual([]);
    expect(machine.flick(OPEN)).toBe('kept');
  });
});

describe('a reload, another tab, a page killed mid-play', () => {
  it('finishes a play as the page is left, so the reloaded page finds it paid, once', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    machine.drop(BIG_PLAY);
    machine.flick(OPEN);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
    expect(record(browser)).toMatchObject({ flicks: [OPEN, 1, 1, 1], paid: true });
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.table.last()?.paid).toBe(true);
    expect(machine.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
  });

  it('finds the same play after a page killed mid-roll, finishes it with the flicks written down, and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    const staked = first.drop(BIG_PLAY);
    first.flick(OPEN);
    first.flick(OPEN);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - 1);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, flicks: [OPEN, OPEN], paid: false });
    expect(out(browser)).toEqual([COIN_MAZE_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
    expect(record(browser)).toMatchObject({ flicks: [OPEN, OPEN, 1, 1], paid: true });
    expect(out(browser)).toEqual([]);
    // A page that finds it again finds it paid.
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
  });

  it('is no free retry: a flick at a shut gate stands, though the blind flick drawn would have got through', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    first.drop(WIN_PLAY);
    first.flick(SHUT);
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(finishLeft(reopened)).toMatchObject({ settled: 'paid', left: { flicks: [SHUT] } });
    expect(stored(browser)).toBe(WELCOME - 1);
  });

  it('finishes the play as another tab takes the medals; that tab finds nothing left to finish', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.drop(WIN_PLAY);
    one.flick(OPEN);
    const two = machineOn(browser.open());
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(stored(browser)).toBe(WELCOME - 1 + 2);
    expect(two.table.leftover()).toBeNull();
    // The first page's lever does nothing more.
    expect(one.flick(OPEN)).toBe('gone');
    expect(one.stop()).toBe('already');
    expect(two.drop(WIN_PLAY)).not.toBeNull();
  });
});

describe('the medal center’s reset', () => {
  it('voids a play under way: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.drop(BIG_PLAY);
    machine.flick(OPEN);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(COIN_MAZE_GAME)).toBe(false);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    expect(machine.stop()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('throws away a play left unfinished before a reset', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    before.drop(BIG_PLAY);
    crash(browser, killed);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s unfinished play along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const staked = before.drop(BIG_PLAY)!;
    before.flick(OPEN);
    crash(browser, killed);
    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - 1 });
    const left = after.table.leftover();
    expect(left).toMatchObject({ owner: UID, id: staked.record.id, flicks: [OPEN], paid: false });
    expect(record(browser, UID)?.id).toBe(staked.record.id);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - 1 + 5);
    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
  });

  it('never moves a guest’s play onto an account that has medals of its own: it waits for the guest', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.drop(WIN_PLAY);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.stop()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(finishLeft(machine)?.settled).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 2);
    expect(stored(browser, UID)).toBe(500);
  });
});

describe('when storage will not keep things', () => {
  it('plays no play it cannot write down, where storage can be read: nothing is taken', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === PLAY_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.table.stake(WIN_PLAY).kind).toBe('unsaved');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('plays on from memory when storage stops taking the flicks: the play leaves storage, and is paid once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const staked = machine.drop(WIN_PLAY)!;
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === PLAY_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.flick(OPEN)).toBe('kept');
    expect(staked.stored).toBe(false);
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
    for (let s = 1; s < 4; s++) expect(machine.flick(OPEN)).toBe('kept');
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 2);
    expect(machine.table.settle(staked)).toBe('already');
  });

  it('plays from memory where storage is blocked: the medal taken and the winnings given once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = machine.drop(BIG_PLAY);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - 1);
    for (let s = 0; s < 4; s++) expect(machine.flick(OPEN)).toBe('kept');
    expect(machine.stop()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - 1 + 5);
    expect(machine.table.settle(staked!)).toBe('already');
  });
});

describe('reading a play back', () => {
  it('reads back only a play it could have written: every field checked, no flick after OUT, paid only when ended', () => {
    const good: PlayRecord = { v: 1, id: 'play1', owner: null, ledger: 'device00001', era: 0, draw: WIN_PLAY, flicks: [OPEN, OPEN], paid: false };
    expect(parsePlay(serializePlay(good))).toEqual(good);
    const ended: PlayRecord = { ...good, flicks: [OPEN, SHUT], paid: true };
    expect(parsePlay(serializePlay(ended))).toEqual(ended);
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      JSON.stringify({ ...good, draw: { ...WIN_PLAY, blinds: [8, 1, 1, 1] } }),
      JSON.stringify({ ...good, flicks: [9] }),
      // A flick after the medal fell OUT.
      JSON.stringify({ ...good, flicks: [SHUT, OPEN] }),
      JSON.stringify({ ...good, flicks: [1, 1, 1, 1, 1] }),
      // Paid before it ended.
      JSON.stringify({ ...good, flicks: [OPEN], paid: true }),
      JSON.stringify({ ...good, paid: 'yes' }),
      'x'.repeat(3_000),
    ];
    for (const text of bad) expect(parsePlay(text)).toBeNull();
  });

  it('clears anything at the play’s place that is not a play', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(PLAY_KEY, '{"v":0,"gate":99}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(browser.storage.has(PLAY_KEY)).toBe(false);
  });
});

describe('a browser that dies between two writes', () => {
  // The play's record and the medals are separate writes: the browser is killed at every moment between them and
  // started again, and the machine finishes whatever it left. Every play is paid exactly once, or, if its medal never
  // went in, never happened at all. The blind flicks drawn are the player's own (window 1), so that a play finished
  // blind ends as the one the player was flicking.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  /** A browser with one play already played (a WIN). */
  const setUp = async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.drop(WIN_PLAY);
    for (let s = 0; s < 4; s++) machine.flick(OPEN);
    machine.stop();
    machines.set(browser, machine);
    return browser;
  };
  const AFTER_SET_UP = WELCOME - 1 + 2;
  const reopened = async (after: FakeBrowser) => {
    const machine = machineOn(after.open());
    await quiet(after);
    finishLeft(machine);
    return machine;
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, d, flicks, won] of [
    ['a BIG WIN flicked through all four gates', BIG_PLAY, [OPEN, OPEN, OPEN, OPEN], 5],
    ['a play skipped after one flick, the rest blind', WIN_PLAY, [OPEN], 2],
    ['a play OUT at a shut gate', SHUT_BLIND, [OPEN, SHUT], 0],
    ['a play OUT through the pins', draw({ pins: [true, false, false, false] }), [OPEN, OPEN, OPEN, OPEN], 0],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies from DROP to the end`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.drop(d);
          for (const window of flicks) machine.flick(window);
          machine.stop();
        },
        async (after, reached) => {
          const staked = spentIn(after) === 2;
          const machine = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - 1 + won : AFTER_SET_UP);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          // The next play takes and pays as ever, and the plays before it let go of their receipts.
          const next = machine.drop(WIN_PLAY);
          for (let s = 0; s < 4; s++) machine.flick(OPEN);
          expect(machine.stop(), `died after ${reached} writes`).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.id;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${COIN_MAZE_GAME}:${id}:pay`, `${COIN_MAZE_GAME}:${id}:stake`]);
          expect(medalsOutAt(ledger)).toEqual([]);
        },
      );
      // The play's record, its medal, each flick, the record marked paid, and its winnings (when it won).
      expect(writes).toBeGreaterThanOrEqual(2 + flicks.length + (won > 0 ? 2 : 1));
    });
  }

  it('pays a play exactly once wherever the browser dies while the page going away finishes it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.drop(BIG_PLAY);
        machine.flick(OPEN);
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === 2;
        await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - 1 + 5 : AFTER_SET_UP);
      },
    );
  });

  it('is marked paid before its winnings go in, so a page that looks for a play to finish as the medals move never finds it', async () => {
    const browser = await setUp();
    const machine = machines.get(browser)!;
    const found: string[] = [];
    let finishing = false;
    browser.pages[0].bank.subscribe(() => {
      const left = finishing ? machine.table.leftover() : null;
      if (left) found.push(left.id);
    });
    machine.drop(BIG_PLAY);
    for (let s = 0; s < 4; s++) machine.flick(OPEN);
    finishing = true;
    expect(machine.stop()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(AFTER_SET_UP - 1 + 5);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/CoinMaze', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
