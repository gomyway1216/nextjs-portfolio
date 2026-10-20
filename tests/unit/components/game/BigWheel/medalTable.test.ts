import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { LAMPS, WHEEL, type Spin, type Spot } from '@/components/game/BigWheel/engine';
import {
  BET_STEPS,
  BIG_WHEEL_GAME,
  MIN_BET,
  SPIN_KEY,
  SPIN_STAKE_MOST,
  SPOT_MAX,
  createTable,
  parseSpinRecord,
  readBet,
  serializeSpinRecord,
  spinId,
  spinKey,
  tapAmount,
  winningsOf,
  type PlacedBet,
  type SpinRecord,
  type Staked,
} from '@/components/game/BigWheel/medalTable';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// The big wheel plays with the medal center's medals: a spin's medals are taken once, what they win comes back once,
// and neither is lost or doubled by a reload, another tab, a reset or a browser that dies between two writes. The bank
// here is the real one (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is fetched and no account is real.

/** Five medals on ×10 and three on ×2. */
const TEN: PlacedBet = { spot: 10, amount: 5 };
const TWO: PlacedBet = { spot: 2, amount: 3 };
const at = (spot: Spot): number => WHEEL.indexOf(spot);
const BONUS = WHEEL.indexOf('bonus');
/** The wheel stops on ×10: the ten pays 50. On ×2: the two pays 6. On ×4: nothing. */
const HIT_TEN: Spin = { stop: at(10), lamp: null, second: null };
const HIT_TWO: Spin = { stop: at(2), lamp: null, second: null };
const LOSE: Spin = { stop: at(4), lamp: null, second: null };
/** BONUS, the lamps on ×3, and the second chance on ×10: the ten pays 5 × 10 × 3 = 150. */
const SECOND_TEN: Spin = { stop: BONUS, lamp: LAMPS.indexOf(3), second: at(10) };
const TEN_WINS = 50;
const TWO_WINS = 6;
const BONUS_WINS = 150;
const BOTH = TEN.amount + TWO.amount;

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): SpinRecord | null => parseSpinRecord(browser.storage.get(spinKey(owner)) ?? null);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a spin still running is settled as the card goes. */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('spin') });
  seat.current = page.bank.sit(BIG_WHEEL_GAME, {
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
    page.bank.restarted(BIG_WHEEL_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** SPIN: the spin is drawn (here: given) and the medals on the board are taken. */
    spin(bets: PlacedBet[], spin: Spin): Staked | null {
      running = table.stake(bets, spin);
      return running;
    },
    /** The wheel stops on this page. */
    stop() {
      const ran = running;
      running = null;
      return ran ? table.settle(ran) : null;
    },
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

describe('the board’s limits and its arithmetic', () => {
  it('takes one to 99 medals a number, a tap adding its step or what still fits, and at most every number full a spin', () => {
    expect(MIN_BET).toBe(1);
    expect(SPOT_MAX).toBe(99);
    expect(BET_STEPS).toEqual([1, 5, 10]);
    expect(SPIN_STAKE_MOST).toBe(7 * 99);
    expect(tapAmount(5, 0, 100)).toBe(5);
    expect(tapAmount(10, 95, 100)).toBe(4);
    expect(tapAmount(10, 99, 100)).toBe(0);
    expect(tapAmount(10, 0, 3)).toBe(3);
  });

  it('pays the number the wheel stops on, its medals times its number, and a second chance times the lamp too', () => {
    expect(winningsOf([TEN, TWO], HIT_TEN)).toBe(TEN_WINS);
    expect(winningsOf([TEN, TWO], HIT_TWO)).toBe(TWO_WINS);
    expect(winningsOf([TEN, TWO], LOSE)).toBe(0);
    expect(winningsOf([TEN, TWO], SECOND_TEN)).toBe(BONUS_WINS);
  });

  it('names a spin so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => spinId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });
});

describe('a spin, once', () => {
  it('takes the board’s medals once at SPIN and gives the winnings back once as the wheel stops', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);

    const staked = machine.spin([TEN, TWO], HIT_TEN);
    expect(staked?.record).toMatchObject({ wagered: BOTH, won: TEN_WINS, paid: false, owner: null, era: 0 });
    expect(stored(browser)).toBe(WELCOME - BOTH);
    expect(record(browser)).toMatchObject({ id: staked?.record.id, paid: false, spin: HIT_TEN });

    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS);
    expect(record(browser)).toMatchObject({ paid: true });
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS);
    expect(machine.table.last()).toMatchObject({ id: staked?.record.id, won: TEN_WINS });
  });

  it('pays a second chance its number times the lamp, once', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.spin([TEN], SECOND_TEN);
    expect(stored(browser)).toBe(WELCOME - TEN.amount);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - TEN.amount + BONUS_WINS);
  });

  it('takes a losing spin’s medals and gives nothing back', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.spin([TEN], LOSE);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - TEN.amount);
    expect(machine.table.last()).toMatchObject({ spin: LOSE, won: 0, wagered: TEN.amount });
  });

  it('takes nothing the board does not: too many medals, a number twice, no medals, a number not on it, medals it does not have, a spin it could not draw', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.spin([{ ...TEN, amount: 100 }], HIT_TEN)).toBeNull();
    expect(machine.spin([TEN, TEN], HIT_TEN)).toBeNull();
    expect(machine.spin([], HIT_TEN)).toBeNull();
    expect(machine.spin([{ spot: 3 as Spot, amount: 1 }], HIT_TEN)).toBeNull();
    expect(machine.spin([{ ...TEN, amount: 99 }, { ...TWO, amount: 2 }], HIT_TEN)).toBeNull();
    expect(machine.spin([TEN], { stop: at(10), lamp: 3, second: null })).toBeNull();
    expect(machine.spin([TEN], { stop: BONUS, lamp: 0, second: BONUS })).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
  });

  it('takes nothing on a page that does not hold the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.spin([TEN], HIT_TEN)).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('a reload while the wheel turns', () => {
  it('settles the spin as the page is left, so the reloaded page finds it paid and shows it as the last spin', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    const staked = machine.spin([TEN, TWO], SECOND_TEN);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - BOTH + BONUS_WINS);

    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.table.last()).toMatchObject({ id: staked?.record.id, spin: SECOND_TEN, won: BONUS_WINS });
    expect(machine.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BOTH + BONUS_WINS);
  });

  it('finishes a spin whose page was killed before it could settle: the next page spins it again to the same stop and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    const staked = machine.spin([TEN, TWO], HIT_TEN);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - BOTH);

    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, spin: HIT_TEN, wagered: BOTH, won: TEN_WINS, paid: false });
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS);
    expect(reopened.table.leftover()).toBeNull();
  });

  it('does not take a new spin over one still to be finished', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    expect(first.spin([TEN], HIT_TEN)).not.toBeNull();
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.spin([TEN], LOSE)).toBeNull();
    expect(stored(browser)).toBe(WELCOME - TEN.amount);
  });
});

describe('a page looking at the medals while SPIN stakes', () => {
  // The bank tells the page of every move it makes as it makes it, SPIN's own stake among them, and the page then looks
  // for a spin left unfinished to finish. While SPIN is staking, the spin on record is that press's own: the page is
  // told of none, and nothing is settled under it. (Before, it was handed the spin being staked; the page began it as
  // one resumed and SPIN began it again in the same press, which React drew as one. Nothing a player saw changed.)
  it('is told of no spin left unfinished while SPIN stakes, and the spin’s medals stay out', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const seen: (string | null)[] = [];
    const out: (readonly string[])[] = [];
    page.bank.subscribe(() => {
      seen.push(machine.table.leftover()?.id ?? null);
      out.push(page.bank.getState().out);
    });
    const staked = machine.spin([TEN], HIT_TEN)!;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toEqual(seen.map(() => null));
    expect(out[out.length - 1]).toEqual([BIG_WHEEL_GAME]);
    // Once SPIN is done, a spin on record still to be finished is one to finish, as for a page opened after a reload.
    expect(machine.table.leftover()?.id).toBe(staked.record.id);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - TEN.amount + TEN_WINS);
  });
});

describe('the medals out on a spin', () => {
  it('are out from SPIN until the wheel stops, a losing spin included, and stay out over a page killed while it turns', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    const out = () => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);
    expect(machine.spin([TEN], LOSE)).not.toBeNull();
    expect(out()).toEqual([BIG_WHEEL_GAME]);
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ won: 0, paid: false });
    expect(out()).toEqual([BIG_WHEEL_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(out()).toEqual([]);
  });

  it('are out no more once a page that settled a spin died before it could say so: the next page finds it settled', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.spin([TEN], LOSE);
    browser.storage.set(spinKey(null), serializeSpinRecord({ ...record(browser)!, paid: true }));
    crash(browser, page);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!)).toEqual([]);
  });
});

describe('another tab', () => {
  it('settles the spin as another tab takes the medals, and the wheel stopping afterwards pays nothing more', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.spin([TEN, TWO], HIT_TEN);
    const second = browser.open();
    const two = machineOn(second);
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS);
    expect(two.table.leftover()).toBeNull();
    expect(one.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS);
    two.spin([TEN], LOSE);
    expect(two.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS - TEN.amount);
    one.seat.play();
    await quiet(browser);
    expect(one.seat.holding()).toBe(true);
    expect(first.bank.getState().balance).toBe(WELCOME - BOTH + TEN_WINS - TEN.amount);
  });

  it('lends the card to the medal center for a moment mid-spin: the spin is settled, the bonus paid, and both counted once', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.spin([TWO], HIT_TWO);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(machine.yielded).toEqual(['moment']);
    expect(machine.seat.holding()).toBe(true);
    const bonus = (hub.bank.getState().balance ?? 0) - (WELCOME - TWO.amount + TWO_WINS);
    expect(bonus).toBeGreaterThan(0);
    expect(machine.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - TWO.amount + TWO_WINS + bonus);
  });
});

describe('the medal center’s reset', () => {
  it('settles a spin under way before the reset, then starts the machine over: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.spin([TEN], SECOND_TEN);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(BIG_WHEEL_GAME)).toBe(false);
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    expect(machine.stop()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
    expect(machine.table.last()).toBeNull();
  });

  it('throws away a spin left unfinished before a reset: its stake went with every other medal', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    expect(before.spin([TEN], HIT_TEN)).not.toBeNull();
    crash(browser, killed);
    expect(record(browser)).toMatchObject({ paid: false, era: 0 });
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });

  it('pays nothing into the new medals for a spin bet before the reset, even if nobody voided it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const staked = machine.table.stake([TEN], HIT_TEN)!;
    page.bank.reset();
    await quiet(browser);
    expect(machine.table.settle({ ...staked, paid: false, void: false })).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s unfinished spin along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const staked = before.spin([TEN, TWO], HIT_TEN)!;
    const guestLedger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!.device;
    crash(browser, killed);

    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - BOTH });
    const left = after.table.leftover();
    expect(left).toMatchObject({ id: staked.record.id, owner: UID, ledger: guestLedger, paid: false });
    expect(record(browser, UID)?.id).toBe(staked.record.id);
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - BOTH + TEN_WINS);

    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
  });

  it('never pays a guest’s spin into an account that has medals of its own, and pays it to the guest once they are back', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.spin([TWO], HIT_TWO);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.stop()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    const left = machine.table.leftover();
    expect(left).toMatchObject({ owner: null, paid: false });
    expect(machine.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - TWO.amount + TWO_WINS);
    expect(stored(browser, UID)).toBe(500);
  });
});

describe('when storage refuses the bank’s writes', () => {
  const refuseLedger = (page: FakePage, uid: string | null = null) => {
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === ledgerKey(uid)) throw new Error('quota');
      write(key, text);
    };
    return () => {
      page.env.write = write;
    };
  };

  it('leaves no spin on record whose stake the bank could not write: a page that dies then makes no medals', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    refuseLedger(killed);
    const staked = machine.spin([TWO], HIT_TWO)!;
    expect(staked.stored).toBe(false);
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
  });

  it('plays from memory where storage is blocked: the stake taken and the winnings given once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = machine.spin([TEN], HIT_TEN);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - TEN.amount);
    expect(machine.stop()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - TEN.amount + TEN_WINS);
    expect(machine.table.settle(staked!)).toBe('already');
  });
});

describe('reading a spin back', () => {
  it('reads back only a spin it could have written: every field checked, what it bet and won worked out again', () => {
    const good: SpinRecord = { v: 1, id: 'spin1', owner: null, ledger: 'device00001', era: 0, spin: SECOND_TEN, bets: [TEN, TWO], wagered: BOTH, won: BONUS_WINS, paid: false };
    expect(parseSpinRecord(serializeSpinRecord(good))).toEqual(good);
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, won: BONUS_WINS + 1 }),
      JSON.stringify({ ...good, wagered: BOTH - 1 }),
      JSON.stringify({ ...good, spin: { stop: BONUS, lamp: null, second: null } }),
      JSON.stringify({ ...good, spin: { stop: 60, lamp: null, second: null } }),
      JSON.stringify({ ...good, bets: [] }),
      JSON.stringify({ ...good, bets: [TEN, TEN], wagered: 10 }),
      JSON.stringify({ ...good, bets: [{ spot: 10, amount: 100 }], wagered: 100, won: 3_000 }),
      JSON.stringify({ ...good, bets: [{ spot: 7, amount: 1 }], wagered: 1, won: 0 }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, paid: 'yes' }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      'x'.repeat(9_000),
    ];
    for (const text of bad) expect(parseSpinRecord(text)).toBeNull();
    expect(readBet({ spot: 40, amount: 99 })).toEqual({ spot: 40, amount: 99 });
    expect(readBet({ spot: 40, amount: 0 })).toBeNull();
    expect(readBet({ spot: 'bonus', amount: 1 })).toBeNull();
  });

  it('clears anything at the spin’s place that is not a spin', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(SPIN_KEY, '{"v":0,"wheel":[1,2,3]}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(machine.table.last()).toBeNull();
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
  });
});

describe('a browser that dies between two writes', () => {
  // The spin's record and the medals are two writes: the browser is killed at every moment between them and started
  // again, and the machine finishes whatever it left. Every spin is paid exactly once, or, if its stake never went in,
  // never happened at all.
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
    const left = machine.table.leftover();
    if (left) machine.table.settle({ record: left, stored: true, paid: false, void: false });
    return machine;
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, spin, won] of [
    ['a spin that stops on the ten', HIT_TEN, TEN_WINS],
    ['a second chance that pays the ten times three', SECOND_TEN, BONUS_WINS],
    ['a losing spin', LOSE, 0],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies between SPIN and the stop`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.spin([TEN, TWO], spin);
          machine.stop();
        },
        async (after, reached) => {
          const staked = spentIn(after) === BOTH;
          const machine = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? WELCOME - BOTH + won : WELCOME);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          const left = record(after);
          expect(left === null || left.paid, `died after ${reached} writes`).toBe(true);
          // The next spin takes and pays as ever, and the spins before it let go of their receipts.
          const next = machine.spin([TEN], HIT_TEN);
          expect(next, `died after ${reached} writes`).not.toBeNull();
          expect(machine.stop()).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.id;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${BIG_WHEEL_GAME}:${id}:pay`, `${BIG_WHEEL_GAME}:${id}:stake`]);
          expect(stored(after)).toBe((staked ? WELCOME - BOTH + won : WELCOME) - TEN.amount + TEN_WINS);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(won > 0 ? 4 : 3);
    });
  }

  it('pays a spin exactly once wherever the browser dies while the page going settles it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        machines.get(browser)!.spin([TEN, TWO], SECOND_TEN);
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === BOTH;
        await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? WELCOME - BOTH + BONUS_WINS : WELCOME);
      },
    );
  });

  it('is marked paid before its winnings go in, so a page that looks at the machine as the medals move never finds it to finish', async () => {
    const browser = await setUp();
    const machine = machines.get(browser)!;
    const found: string[] = [];
    let finishing = false;
    browser.pages[0].bank.subscribe(() => {
      const left = finishing ? machine.table.leftover() : null;
      if (left) found.push(left.id);
    });
    machine.spin([TEN, TWO], HIT_TEN);
    finishing = true;
    expect(machine.stop()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(WELCOME - BOTH + TEN_WINS);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts', 'physics.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/BigWheel', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
