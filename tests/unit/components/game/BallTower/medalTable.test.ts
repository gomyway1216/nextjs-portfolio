import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { JACKPOT, drawFor, runOf, wonOf, type Bet, type Draw } from '@/components/game/BallTower/engine';
import { BALL_TOWER_GAME, RUN_KEY, createTable, parseRun, runId, runKey, serializeRun, type RunRecord, type Staked } from '@/components/game/BallTower/medalTable';
import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger, take } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Firework Ball Tower plays with the medal center's medals: a ball's bet is taken once, what its pocket pays comes back
// once, and none of it is lost or doubled by a reload, another tab, a reset or a browser that dies between two writes. A
// run left unfinished is finished, as it was drawn, by the next page that holds the card; a moment's loan of the card
// finishes nothing. The bank here is the real one (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is
// fetched and no account is real.

/** Down to the second disc and into ×3: 3 a medal bet. */
const PAYS_3 = drawFor(['up', 'pay'], 3);
/** UP all the way, and JP: the jackpot. */
const JACKPOT_RUN = drawFor(['up', 'up', 'up', 'up', 'jackpot']);
/** OUT on the top disc. */
const OUT_RUN = drawFor(['out']);
const BET: Bet = 2;

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): RunRecord | null => parseRun(browser.storage.get(runKey(owner)) ?? null);
const out = (browser: FakeBrowser) => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);

/**
 * A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a run under
 * way is finished as the page is hidden or left (marked so), never for a moment's loan of the card.
 */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('run') });
  seat.current = page.bank.sit(BALL_TOWER_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      yielded.push(why);
      if (why !== 'moment' && running && !running.paid && !running.void) table.settle(running, true);
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (running) running.void = true;
    table.clear();
    page.bank.restarted(BALL_TOWER_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** START: the run is drawn (here: given) and the bet taken. */
    start(d: Draw = PAYS_3, bet: Bet = BET): Staked | null {
      const outcome = table.stake(bet, d);
      running = outcome.kind === 'staked' ? outcome.staked : null;
      return running;
    },
    /** The ball comes to rest on this page (or Skip is pressed). */
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
  return left ? { left, settled: machine.table.settle({ record: left, stored: true, paid: false, void: false }, true) } : null;
};

describe('the draws used here', () => {
  it('play as they say: ×3 on the second disc, the jackpot, and OUT', () => {
    expect(wonOf(runOf(PAYS_3), BET)).toBe(6);
    expect(wonOf(runOf(JACKPOT_RUN), BET)).toBe(JACKPOT * BET);
    expect(wonOf(runOf(OUT_RUN), BET)).toBe(0);
  });
});

describe('a run, once', () => {
  it('names a run so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => runId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('takes the bet at START, and pays the pocket once as the ball comes to rest', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    const staked = machine.start(PAYS_3, BET);
    expect(staked?.record).toMatchObject({ owner: null, era: 0, bet: BET, paid: false });
    expect(stored(browser)).toBe(WELCOME - BET);
    expect(out(browser)).toEqual([BALL_TOWER_GAME]);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 6);
    expect(record(browser)).toMatchObject({ paid: true });
    expect(record(browser)).not.toHaveProperty('away');
    expect(out(browser)).toEqual([]);
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BET + 6);
    // The next run pays the jackpot on a bet of 10, and lets go of the last one's receipts.
    machine.start(JACKPOT_RUN, 10);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 6 - 10 + 3_000);
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.every((id) => id.startsWith(`${BALL_TOWER_GAME}:${record(browser)!.id}:`))).toBe(true);
  });

  it('pays nothing for OUT, and lets its medals out no longer', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start(OUT_RUN, 5);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 5);
    expect(out(browser)).toEqual([]);
  });

  it('takes nothing it should not: a bet or a draw it could not make, more than the medals, a page without the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake(4 as Bet, PAYS_3).kind).toBe('short');
    expect(one.table.stake(BET, { ...PAYS_3, pockets: [18, 0, 0, 0, 0] }).kind).toBe('short');
    expect(one.table.stake(BET, { ...PAYS_3, lamps: [1, 0, 0, 0, 0] }).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake(BET, PAYS_3).kind).toBe('away');
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(RUN_KEY)).toBe(false);
  });

  it('takes no ball of a bet bigger than the medals left: a smaller bet plays them', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(BANK_KEY, serializeLedger(take(createLedger('fewmedals01'), WELCOME - 3)!));
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(stored(browser)).toBe(3);
    expect(machine.table.stake(5, OUT_RUN).kind).toBe('short');
    expect(browser.storage.has(RUN_KEY)).toBe(false);
    expect(machine.table.stake(3, OUT_RUN).kind).toBe('staked');
    expect(stored(browser)).toBe(0);
  });

  it('plays no second run while one of these medals is unfinished: it is finished first', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    first.start(PAYS_3);
    crash(browser, killed);
    const next = machineOn(browser.open());
    await quiet(browser);
    expect(next.table.stake(BET, PAYS_3).kind).toBe('unfinished');
    expect(finishLeft(next)?.settled).toBe('paid');
    expect(next.table.stake(BET, PAYS_3).kind).toBe('staked');
  });
});

describe('the re-entrancy of the bank', () => {
  it('never takes the run being staked for one left unfinished: the bank tells its listeners inside START', async () => {
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
    machine.start(JACKPOT_RUN);
    inside = false;
    // The bank told its listeners as the medals went in and as the last run's receipts were let go of: none found a run to finish.
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((id) => id === null)).toBe(true);
    // And the medals are still out on the run: a look from inside the press settled nothing.
    expect(out(browser)).toEqual([BALL_TOWER_GAME]);
    expect(record(browser)?.paid).toBe(false);
    expect(machine.stop()).toBe('paid');
  });
});

describe('a reload, another tab, a page killed mid-run', () => {
  it('finishes a run as the page is left, marked as finished away, so the reloaded page finds it paid, once', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    machine.start(JACKPOT_RUN);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - BET + JACKPOT * BET);
    expect(record(browser)).toMatchObject({ paid: true, away: true });
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.table.last()).toMatchObject({ paid: true, away: true });
    expect(machine.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BET + JACKPOT * BET);
  });

  it('finishes a run as the page is hidden, and the page shown again finds it paid', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start(PAYS_3);
    page.hide('hidden');
    expect(machine.yielded).toEqual(['hidden']);
    expect(stored(browser)).toBe(WELCOME - BET + 6);
    page.show();
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    expect(machine.table.leftover()).toBeNull();
    expect(machine.stop()).toBe('already');
  });

  it('finds the same run after a page killed mid-run, finishes it as drawn, and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    const staked = first.start(JACKPOT_RUN);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - BET);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, paid: false });
    expect(out(browser)).toEqual([BALL_TOWER_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false }, true)).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + JACKPOT * BET);
    expect(record(browser)).toMatchObject({ paid: true, away: true });
    expect(out(browser)).toEqual([]);
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BET + JACKPOT * BET);
  });

  it('finishes nothing for a moment’s loan of the card: the day’s bonus taken in another tab leaves the run the player’s', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start(PAYS_3);
    const before = stored(browser)!;
    hub.bank.claimBonus();
    await quiet(browser);
    // The card went for a moment and came back: the run is as it was, its bet out, nothing paid.
    expect(machine.yielded).toEqual(['moment']);
    expect(machine.seat.holding()).toBe(true);
    expect(record(browser)).toMatchObject({ paid: false });
    expect(out(browser)).toEqual([BALL_TOWER_GAME]);
    const bonus = stored(browser)! - before;
    expect(bonus).toBeGreaterThan(0);
    // The ball comes to rest on this page, as it was coming down: paid once, and not as finished away.
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(before + bonus + 6);
    expect(record(browser)).not.toHaveProperty('away');
  });

  it('leaves the run on record as another tab’s machine takes the medals; that tab finishes it, and pays it once', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.start(PAYS_3);
    const two = machineOn(browser.open());
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    // Not finished by the page that lent the card: the page that has it now finds it left, and finishes it.
    expect(stored(browser)).toBe(WELCOME - BET);
    expect(finishLeft(two)?.settled).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 6);
    expect(record(browser)).toMatchObject({ paid: true, away: true });
    // The first page's ball comes to rest later: the run is paid already.
    expect(one.stop()).toBe('later');
    expect(two.start(PAYS_3)).not.toBeNull();
  });
});

describe('the medal center’s reset', () => {
  it('voids a run under way: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start(JACKPOT_RUN);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(BALL_TOWER_GAME)).toBe(false);
    expect(browser.storage.has(RUN_KEY)).toBe(false);
    expect(machine.stop()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('throws away a run left unfinished before a reset', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    before.start(JACKPOT_RUN);
    crash(browser, killed);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(browser.storage.has(RUN_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s unfinished run along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const staked = before.start(JACKPOT_RUN)!;
    crash(browser, killed);
    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - BET });
    const left = after.table.leftover();
    expect(left).toMatchObject({ owner: UID, id: staked.record.id, paid: false });
    expect(record(browser, UID)?.id).toBe(staked.record.id);
    expect(browser.storage.has(RUN_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false }, true)).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - BET + JACKPOT * BET);
    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
  });

  it('never moves a guest’s run onto an account that has medals of its own: it waits for the guest', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start(PAYS_3);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.stop()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(finishLeft(machine)?.settled).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 6);
    expect(stored(browser, UID)).toBe(500);
  });
});

describe('when storage will not keep things', () => {
  it('plays no run it cannot write down, where storage can be read: nothing is taken', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === RUN_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.table.stake(BET, PAYS_3).kind).toBe('unsaved');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('plays from memory where storage is blocked: the bet taken and the pocket paid once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = machine.start(JACKPOT_RUN);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - BET);
    expect(machine.stop()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - BET + JACKPOT * BET);
    expect(machine.table.settle(staked!)).toBe('already');
  });
});

describe('reading a run back', () => {
  it('reads back only a run it could have written: every field checked, finished away only once paid', () => {
    const good: RunRecord = { v: 1, id: 'run1', owner: null, ledger: 'device00001', era: 0, bet: 3, draw: PAYS_3, paid: false };
    expect(parseRun(serializeRun(good))).toEqual(good);
    const away: RunRecord = { ...good, paid: true, away: true };
    expect(parseRun(serializeRun(away))).toEqual(away);
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, id: 'Not An Id!' }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      JSON.stringify({ ...good, era: -1 }),
      JSON.stringify({ ...good, bet: 4 }),
      JSON.stringify({ ...good, bet: '3' }),
      JSON.stringify({ ...good, draw: { ...PAYS_3, pockets: [18, 0, 0, 0, 0] } }),
      JSON.stringify({ ...good, draw: { pockets: PAYS_3.pockets } }),
      JSON.stringify({ ...good, paid: 'yes' }),
      JSON.stringify({ ...good, away: true }),
      JSON.stringify({ ...away, away: 'yes' }),
      'x'.repeat(2_000),
    ];
    for (const text of bad) expect(parseRun(text)).toBeNull();
  });

  it('clears anything at the run’s place that is not a run', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(RUN_KEY, '{"v":0,"ball":99}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(browser.storage.has(RUN_KEY)).toBe(false);
  });
});

describe('a browser that dies between two writes', () => {
  // The run's record and the medals are separate writes: the browser is killed at every moment between them and
  // started again, and the machine finishes whatever it left. Every run is paid exactly once, or, if its medals never
  // went in, never happened at all.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  /** A browser with one run already played (×3 on a bet of 2). */
  const setUp = async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start(PAYS_3);
    machine.stop();
    machines.set(browser, machine);
    return browser;
  };
  const AFTER_SET_UP = WELCOME - BET + 6;
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

  for (const [what, d, bet, won] of [
    ['the jackpot on a bet of 10', JACKPOT_RUN, 10, 3_000],
    ['×3 on a bet of 2', PAYS_3, 2, 6],
    ['OUT', OUT_RUN, 5, 0],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies from START to the ball at rest`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.start(d, bet);
          machine.stop();
        },
        async (after, reached) => {
          const staked = spentIn(after) === BET + bet;
          const machine = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - bet + won : AFTER_SET_UP);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          // The next run takes and pays as ever, and the runs before it let go of their receipts.
          const next = machine.start(PAYS_3);
          expect(machine.stop(), `died after ${reached} writes`).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.id;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${BALL_TOWER_GAME}:${id}:pay`, `${BALL_TOWER_GAME}:${id}:stake`]);
          expect(medalsOutAt(ledger)).toEqual([]);
        },
      );
      // The run's record, its medals, the record marked paid, and its winnings (when it won).
      expect(writes).toBeGreaterThanOrEqual(won > 0 ? 4 : 3);
    });
  }

  it('pays a run exactly once wherever the browser dies while the page going away finishes it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.start(JACKPOT_RUN);
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === 2 * BET;
        await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - BET + JACKPOT * BET : AFTER_SET_UP);
      },
    );
  });

  it('is marked paid before its winnings go in, so a page that looks for a run to finish as the medals move never finds it', async () => {
    const browser = await setUp();
    const machine = machines.get(browser)!;
    const found: string[] = [];
    let finishing = false;
    browser.pages[0].bank.subscribe(() => {
      const left = finishing ? machine.table.leftover() : null;
      if (left) found.push(left.id);
    });
    machine.start(JACKPOT_RUN);
    finishing = true;
    expect(machine.stop()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(AFTER_SET_UP - BET + JACKPOT * BET);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts', 'published.ts', 'scene.ts', 'draw.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/BallTower', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
