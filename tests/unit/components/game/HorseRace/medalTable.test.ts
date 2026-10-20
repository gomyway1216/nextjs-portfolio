import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { raceCard } from '@/components/game/HorseRace/card';
import {
  BET_STEPS,
  HORSE_GAME,
  MIN_BET,
  RACE_KEY,
  RACE_STAKE_MOST,
  TICKET_MAX,
  createTable,
  parseRace,
  raceId,
  raceKey,
  readTicket,
  serializeRace,
  tapAmount,
  winningsOf,
  type PlacedTicket,
  type RaceRecord,
  type Staked,
} from '@/components/game/HorseRace/medalTable';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// The horse-racing machine plays with the medal center's medals: a race's tickets are paid for once, what they win
// comes back once, and neither is lost or doubled by a reload, another tab, a reset or a browser that dies between two
// writes. The bank here is the real one (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is fetched and
// no account is real.

const CARD = raceCard('testdevice01', 1);
/** Ten medals on gate 1 to win, and two on the quinella 1-2. */
const WIN1: PlacedTicket = { key: 'win:1', amount: 10, odds: CARD.winOdds[0] };
const Q12: PlacedTicket = { key: 'quinella:1-2', amount: 2, odds: CARD.quinellaOdds[0] };
/** 1 then 2: both tickets win. 2 then 1: the quinella only. 3 then 4: neither. */
const ONE_TWO = [1, 2, 3, 4, 5, 6];
const TWO_ONE = [2, 1, 3, 4, 5, 6];
const LOSE = [3, 4, 5, 6, 1, 2];
const BOTH = WIN1.amount * WIN1.odds + Q12.amount * Q12.odds;
const QUINELLA = Q12.amount * Q12.odds;

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): RaceRecord | null => parseRace(browser.storage.get(raceKey(owner)) ?? null);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a race still running is settled as the card goes. */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('race') });
  seat.current = page.bank.sit(HORSE_GAME, {
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
    page.bank.restarted(HORSE_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** START: the order is drawn (here: given) and the tickets are bought. */
    start(bets: PlacedTicket[], order: number[]): Staked | null {
      running = table.stake(CARD, bets, order);
      return running;
    },
    /** The horses cross the line on this page. */
    finish() {
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

describe('the machine’s limits and its arithmetic', () => {
  it('takes one to 99 medals a ticket, a tap adding its step or what still fits, and at most every ticket full a race', () => {
    expect(MIN_BET).toBe(1);
    expect(TICKET_MAX).toBe(99);
    expect(BET_STEPS).toEqual([1, 5, 10]);
    expect(RACE_STAKE_MOST).toBe(21 * 99);
    expect(tapAmount(5, 0, 100)).toBe(5);
    expect(tapAmount(10, 95, 100)).toBe(4);
    expect(tapAmount(10, 99, 100)).toBe(0);
    expect(tapAmount(10, 0, 3)).toBe(3);
  });

  it('pays each winning ticket its odds times its medals, the medals on it included', () => {
    expect(winningsOf([WIN1, Q12], ONE_TWO)).toBe(BOTH);
    expect(winningsOf([WIN1, Q12], TWO_ONE)).toBe(QUINELLA);
    expect(winningsOf([WIN1, Q12], LOSE)).toBe(0);
  });

  it('names a race so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => raceId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,64}$/);
  });
});

describe('a race, once', () => {
  it('takes the tickets’ medals once at the off and gives the winnings back once at the line', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);

    const staked = machine.start([WIN1, Q12], ONE_TWO);
    expect(staked?.record).toMatchObject({ wagered: 12, won: BOTH, paid: false, owner: null, era: 0, race: 1 });
    expect(stored(browser)).toBe(WELCOME - 12);
    expect(record(browser)).toMatchObject({ id: staked?.record.id, paid: false, order: ONE_TWO });

    expect(machine.finish()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 12 + BOTH);
    expect(record(browser)).toMatchObject({ paid: true });
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 12 + BOTH);
    // The next race is the next number.
    expect(machine.table.nextRace()).toBe(2);
  });

  it('takes a losing race’s medals and gives nothing back', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start([WIN1], LOSE);
    expect(machine.finish()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 10);
    expect(machine.table.last()).toMatchObject({ order: LOSE, won: 0, wagered: 10 });
  });

  it('sells nothing the board does not: wrong odds, too many medals, a ticket twice, no tickets, or medals it does not have', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.start([{ ...WIN1, odds: WIN1.odds + 1 }], ONE_TWO)).toBeNull();
    expect(machine.start([{ ...WIN1, amount: 100 }], ONE_TWO)).toBeNull();
    expect(machine.start([WIN1, WIN1], ONE_TWO)).toBeNull();
    expect(machine.start([], ONE_TWO)).toBeNull();
    expect(machine.start([{ ...WIN1, amount: 99 }, { ...Q12, amount: 2 }], ONE_TWO)).toBeNull();
    expect(machine.start([{ key: 'exacta:1-2', amount: 1, odds: 10 }], ONE_TWO)).toBeNull();
    expect(machine.start([WIN1], [1, 1, 2, 3, 4, 5])).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(RACE_KEY)).toBe(false);
  });

  it('takes nothing on a page that does not hold the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.start([WIN1], ONE_TWO)).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('a reload while the horses are running', () => {
  it('settles the race as the page is left, so the reloaded page finds it paid and shows it as the last race', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    const staked = machine.start([WIN1, Q12], TWO_ONE);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - 12 + QUINELLA);

    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.table.last()).toMatchObject({ id: staked?.record.id, order: TWO_ONE, won: QUINELLA });
    expect(machine.finish()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 12 + QUINELLA);
  });

  it('finishes a race whose page was killed before it could settle: the next page runs it again to the same result and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    const staked = machine.start([WIN1, Q12], ONE_TWO);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - 12);

    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, order: ONE_TWO, wagered: 12, won: BOTH, paid: false });
    // The same race number again: it is that race being finished, not a new one.
    expect(reopened.table.nextRace()).toBe(1);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 12 + BOTH);
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.table.nextRace()).toBe(2);
  });

  it('does not start a new race over one still to be finished', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    expect(first.start([WIN1], ONE_TWO)).not.toBeNull();
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.start([WIN1], LOSE)).toBeNull();
    expect(stored(browser)).toBe(WELCOME - 10);
  });
});

describe('a page looking at the medals while START stakes', () => {
  // The bank tells the page of every move it makes as it makes it, START's own stake among them, and the page then looks
  // for a race left unfinished to finish. While START is staking, the race on record is that press's own: the page is
  // told of none, and nothing is settled under it. (Before, it was handed the race being staked; the page began it as
  // one resumed and START began it again in the same press, which React drew as one. Nothing a player saw changed.)
  it('is told of no race left unfinished while START stakes, and the race’s medals stay out', async () => {
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
    const staked = machine.start([WIN1, Q12], ONE_TWO)!;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toEqual(seen.map(() => null));
    expect(out[out.length - 1]).toEqual([HORSE_GAME]);
    // Once START is done, a race on record still to be finished is one to finish, as for a page opened after a reload.
    expect(machine.table.leftover()?.id).toBe(staked.record.id);
    expect(machine.finish()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - WIN1.amount - Q12.amount + BOTH);
  });
});

describe('the medals out on a race', () => {
  it('are out from the off until the line, a losing race included, and stay out over a page killed while it runs', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    const out = () => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);
    expect(machine.start([WIN1], LOSE)).not.toBeNull();
    expect(out()).toEqual([HORSE_GAME]);
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ won: 0, paid: false });
    expect(out()).toEqual([HORSE_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(out()).toEqual([]);
  });

  it('are out no more once a page that settled a race died before it could say so: the next page finds it settled', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start([WIN1], LOSE);
    browser.storage.set(raceKey(null), serializeRace({ ...record(browser)!, paid: true }));
    crash(browser, page);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!)).toEqual([]);
  });
});

describe('another tab', () => {
  it('settles the race as another tab takes the medals, and the line crossed afterwards pays nothing more', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.start([WIN1, Q12], ONE_TWO);
    const second = browser.open();
    const two = machineOn(second);
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(stored(browser)).toBe(WELCOME - 12 + BOTH);
    expect(two.table.leftover()).toBeNull();
    expect(one.finish()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 12 + BOTH);
    two.start([WIN1], LOSE);
    expect(two.finish()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 22 + BOTH);
    one.seat.play();
    await quiet(browser);
    expect(one.seat.holding()).toBe(true);
    expect(first.bank.getState().balance).toBe(WELCOME - 22 + BOTH);
  });

  it('lends the card to the medal center for a moment mid-race: the race is settled, the bonus paid, and both counted once', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.start([Q12], ONE_TWO);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(machine.yielded).toEqual(['moment']);
    expect(machine.seat.holding()).toBe(true);
    const bonus = (hub.bank.getState().balance ?? 0) - (WELCOME - 2 + QUINELLA);
    expect(bonus).toBeGreaterThan(0);
    expect(machine.finish()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 2 + QUINELLA + bonus);
  });
});

describe('the medal center’s reset', () => {
  it('settles a running race before the reset, then starts the machine over at race 1: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start([Q12], ONE_TWO);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(HORSE_GAME)).toBe(false);
    expect(browser.storage.has(RACE_KEY)).toBe(false);
    expect(machine.finish()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
    expect(machine.table.nextRace()).toBe(1);
  });

  it('throws away a race left unfinished before a reset: its stake went with every other medal', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    expect(before.start([Q12], ONE_TWO)).not.toBeNull();
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
    expect(browser.storage.has(RACE_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });

  it('pays nothing into the new medals for a race bet before the reset, even if nobody voided it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const staked = machine.table.stake(CARD, [Q12], ONE_TWO)!;
    page.bank.reset();
    await quiet(browser);
    expect(machine.table.settle({ ...staked, paid: false, void: false })).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s unfinished race along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const staked = before.start([WIN1, Q12], ONE_TWO)!;
    const guestLedger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!.device;
    crash(browser, killed);

    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - 12 });
    const left = after.table.leftover();
    expect(left).toMatchObject({ id: staked.record.id, owner: UID, ledger: guestLedger, paid: false });
    expect(record(browser, UID)?.id).toBe(staked.record.id);
    expect(browser.storage.has(RACE_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - 12 + BOTH);

    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
  });

  it('never pays a guest’s race into an account that has medals of its own, and pays it to the guest once they are back', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.start([Q12], ONE_TWO);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.finish()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    const left = machine.table.leftover();
    expect(left).toMatchObject({ owner: null, paid: false });
    expect(machine.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 2 + QUINELLA);
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

  it('leaves no race on record whose stake the bank could not write: a page that dies then makes no medals', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    refuseLedger(killed);
    const staked = machine.start([Q12], ONE_TWO)!;
    expect(staked.stored).toBe(false);
    expect(browser.storage.has(RACE_KEY)).toBe(false);
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
    const staked = machine.start([WIN1], ONE_TWO);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - 10);
    expect(machine.finish()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - 10 + WIN1.amount * WIN1.odds);
    expect(machine.table.settle(staked!)).toBe('already');
  });
});

describe('reading a race back', () => {
  it('reads back only a race it could have written: every field checked, what it bet and won worked out again', () => {
    const good: RaceRecord = {
      v: 1,
      id: 'race1',
      owner: null,
      ledger: 'device00001',
      era: 0,
      race: 3,
      field: CARD.field.map((horse) => horse.id),
      order: ONE_TWO,
      bets: [WIN1, Q12],
      wagered: 12,
      won: BOTH,
      paid: false,
    };
    expect(parseRace(serializeRace(good))).toEqual(good);
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, won: BOTH + 1 }),
      JSON.stringify({ ...good, wagered: 11 }),
      JSON.stringify({ ...good, order: [1, 2, 3, 4, 5, 5] }),
      JSON.stringify({ ...good, order: [1, 2, 3, 4, 5] }),
      JSON.stringify({ ...good, field: [...good.field.slice(0, 5), 'secretariat'] }),
      JSON.stringify({ ...good, field: [...good.field.slice(0, 5), good.field[0]] }),
      JSON.stringify({ ...good, bets: [] }),
      JSON.stringify({ ...good, bets: [WIN1, WIN1], wagered: 20, won: 2 * WIN1.amount * WIN1.odds }),
      JSON.stringify({ ...good, bets: [{ ...WIN1, amount: 100 }], wagered: 100, won: 100 * WIN1.odds }),
      JSON.stringify({ ...good, bets: [{ ...WIN1, odds: 1 }], wagered: 10, won: 10 }),
      JSON.stringify({ ...good, race: 0 }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, paid: 'yes' }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
    ];
    for (const text of bad) expect(parseRace(text)).toBeNull();
    expect(readTicket({ key: 'quinella:1-2', amount: 1, odds: 999 })).toEqual({ key: 'quinella:1-2', amount: 1, odds: 999 });
    expect(readTicket({ key: 'win:1', amount: 1, odds: 100 })).toBeNull();
    expect(readTicket({ key: 'quinella:2-1', amount: 1, odds: 10 })).toBeNull();
  });

  it('clears anything at the race’s place that is not a race, and starts at race 1', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(RACE_KEY, '{"v":0,"horses":[1,2,3]}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(machine.table.last()).toBeNull();
    expect(browser.storage.has(RACE_KEY)).toBe(false);
    expect(machine.table.nextRace()).toBe(1);
  });
});

describe('a browser that dies between two writes', () => {
  // The race's record and the medals are two writes: the browser is killed at every moment between them and started
  // again, and the machine finishes whatever it left. Every race is paid exactly once, or, if its stake never went in,
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

  for (const [what, order, won] of [
    ['a race both tickets win', ONE_TWO, BOTH],
    ['a race only the quinella wins', TWO_ONE, QUINELLA],
    ['a losing race', LOSE, 0],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies between the off and the line`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.start([WIN1, Q12], [...order]);
          machine.finish();
        },
        async (after, reached) => {
          const staked = spentIn(after) === 12;
          const machine = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? WELCOME - 12 + won : WELCOME);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          const left = record(after);
          expect(left === null || left.paid, `died after ${reached} writes`).toBe(true);
          // The next race buys and pays as ever, and the races before it let go of their receipts.
          const next = machine.start([WIN1], ONE_TWO);
          expect(next, `died after ${reached} writes`).not.toBeNull();
          expect(machine.finish()).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.id;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${HORSE_GAME}:${id}:pay`, `${HORSE_GAME}:${id}:stake`]);
          expect(stored(after)).toBe((staked ? WELCOME - 12 + won : WELCOME) - 10 + WIN1.amount * WIN1.odds);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(won > 0 ? 4 : 3);
    });
  }

  it('pays a race exactly once wherever the browser dies while the page going settles it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        machines.get(browser)!.start([WIN1, Q12], ONE_TWO);
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === 12;
        await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? WELCOME - 12 + BOTH : WELCOME);
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
    machine.start([WIN1, Q12], ONE_TWO);
    finishing = true;
    expect(machine.finish()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(WELCOME - 12 + BOTH);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'card.ts', 'race.ts', 'fraction.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/HorseRace', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
