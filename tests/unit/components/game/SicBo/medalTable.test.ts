import { describe, expect, it } from 'vitest';

import { type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, medalsOutAt, parseLedger, receiptsOf } from '@/components/game/MedalCenter/ledger';
import { recordsOf } from '@/components/game/MedalCenter/history';
import { BET_IDS, type Dice } from '@/components/game/SicBo/engine';
import {
  HISTORY_LIMIT,
  ROLL_STAKE_MOST,
  SIC_BO_GAME,
  SPOT_MAX,
  TABLE_KEY,
  createTable,
  freshTable,
  onTable,
  parseTable,
  pressAmount,
  purseOf,
  serializeTable,
  tableKey,
  unreadKey,
  type MedalTable,
  type Table,
  type TableStorage,
} from '@/components/game/SicBo/medalTable';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// The Sic Bo table on the medal center's floor, played against the real medal bank in a fake browser (one storage the
// pages share, the one card, the channel between the pages). Nothing is fetched and no account is named.

/** A page's own storage, as the table is given it. */
const storageOf = (page: FakePage): TableStorage => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text), remove: (key) => page.env.remove(key) });

/** A page with the table on it, seated at the medal center as the game seats it. */
function sicBoOn(page: FakePage, storage: TableStorage = storageOf(page)) {
  const held: { seat: Seat | null } = { seat: null };
  const table: MedalTable = createTable(purseOf(page.bank), storage, () => held.seat?.holding() ?? false);
  held.seat = page.bank.sit(SIC_BO_GAME, { granted: () => table.sync(), yielding: () => undefined });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (held.seat?.holding()) table.sync();
    else table.resetSeen();
  });
  return { table, seat: held.seat };
}

const storedMedals = (browser: FakeBrowser): number => {
  const ledger = parseLedger(browser.storage.get('medal-center-bank') ?? null);
  return ledger ? balanceOf(ledger) : -1;
};
const storedTable = (browser: FakeBrowser, owner: string | null = null): Table | null => parseTable(browser.storage.get(tableKey(owner)) ?? null);
const unmarked = (table: Table | null): Omit<Table, 'mark'> | null => {
  if (!table) return null;
  const { mark: _mark, ...rest } = table;
  return rest;
};
/** Every medal the player has: in hand and on the layout. */
const everything = (page: FakePage, table: MedalTable): number => page.bank.balance() + onTable(table.table());
/** Medals in hand and on the layout, against the start and what the rolls brought back and took. */
const squared = (page: FakePage, table: MedalTable): number => everything(page, table) - (WELCOME + table.table().stats.won - table.table().stats.played);

async function opened() {
  const browser = new FakeBrowser();
  const page = browser.open();
  const sicBo = sicBoOn(page);
  await quiet(browser);
  return { browser, page, ...sicBo };
}

describe('bets come out of the medals and go back into them, once each', () => {
  it('takes a bet’s medals as it is put on, and gives back every winning bet with its win at the roll', async () => {
    const { browser, page, table } = await opened();
    expect(table.place('small', 5)).toEqual({ ok: true, value: true });
    expect(table.place('total-10', 2).ok).toBe(true);
    expect(table.place('single-4', 3).ok).toBe(true);
    expect(table.place('triple-6', 1).ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 11);
    expect(storedMedals(browser)).toBe(WELCOME - 11);
    expect(storedTable(browser)?.bets).toEqual({ small: 5, 'total-10': 2, 'single-4': 3, 'triple-6': 1 });

    // 2 4 4: Small 1:1, total 10 6:1, the 4 on two dice 2:1; the triple loses.
    const rolled = table.roll([2, 4, 4], 77);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10 + 14 + 9);
    expect(page.bank.balance()).toBe(WELCOME - 11 + 33);
    expect(storedMedals(browser)).toBe(WELCOME + 22);
    // The layout is clear after the roll, the roll on the board, its bets kept for Same bets.
    expect(table.table().bets).toEqual({});
    expect(table.table().history).toEqual([[2, 4, 4]]);
    expect(table.table().last).toEqual({ bets: { small: 5, 'total-10': 2, 'single-4': 3, 'triple-6': 1 }, dice: [2, 4, 4], seed: 77 });
    expect(table.table().lastRound).toEqual({ small: 5, 'total-10': 2, 'single-4': 3, 'triple-6': 1 });
    expect(table.table().stats).toEqual({ rolls: 1, played: 11, won: 33, biggest: 33, triples: 0 });
    // No bets, no roll.
    expect(table.roll([1, 2, 3], 1)).toEqual({ ok: false, error: 'nothing' });
  });

  it('keeps every medal of a losing roll, and counts a triple', async () => {
    const { page, table } = await opened();
    table.place('small', 10);
    table.place('big', 10);
    // A triple: Small and Big both lose.
    const rolled = table.roll([3, 3, 3], 5);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(0);
    expect(page.bank.balance()).toBe(WELCOME - 20);
    expect(table.table().stats).toMatchObject({ rolls: 1, played: 20, won: 0, triples: 1 });
    expect(squared(page, table)).toBe(0);
  });

  it('gives back exactly what Undo and Clear take off, and Same bets puts the last roll back, all of it or none', async () => {
    const { page, table } = await opened();
    table.place('big', 10);
    table.place('pair-1-6', 5);
    table.place('big', 5);
    expect(table.undo().ok).toBe(true);
    expect(table.table().bets).toEqual({ big: 10, 'pair-1-6': 5 });
    expect(page.bank.balance()).toBe(WELCOME - 15);
    expect(table.clear().ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME);
    expect(table.clear()).toEqual({ ok: false, error: 'nothing' });
    expect(table.undo()).toEqual({ ok: false, error: 'nothing' });
    table.place('big', 40);
    table.place('any-triple', 20);
    table.roll([1, 2, 6], 1); // Big loses (9), any triple loses.
    expect(page.bank.balance()).toBe(WELCOME - 60);
    expect(table.repeat()).toEqual({ ok: false, error: 'noMedals' });
    expect(table.table().bets).toEqual({});
    page.bank.give(100);
    expect(table.repeat().ok).toBe(true);
    expect(table.table().bets).toEqual({ big: 40, 'any-triple': 20 });
    expect(page.bank.balance()).toBe(WELCOME + 100 - 120);
    expect(table.repeat()).toEqual({ ok: false, error: 'nothing' });
    // Undo takes the whole of Same bets' last area back, one at a time.
    expect(table.undo().ok).toBe(true);
    expect(table.table().bets).toEqual({ big: 40 });
  });

  it('holds at most 99 medals on an area, and no more than the player has', async () => {
    const { page, table } = await opened();
    page.bank.give(100);
    expect(table.place('small', 99).ok).toBe(true);
    expect(table.place('small', 1)).toEqual({ ok: false, error: 'spotLimit' });
    expect(table.place('big', 300)).toEqual({ ok: false, error: 'spotLimit' });
    expect(table.place('big', 0)).toEqual({ ok: false, error: 'bad' });
    expect(table.place('nope' as never, 1)).toEqual({ ok: false, error: 'bad' });
    expect(table.place('big', 99).ok).toBe(true);
    expect(table.place('total-4', 99)).toEqual({ ok: false, error: 'noMedals' });
    expect(pressAmount(50, 60, 1_000)).toBe(SPOT_MAX - 60);
    expect(pressAmount(10, 0, 3)).toBe(3);
    expect(pressAmount(5, SPOT_MAX, 100)).toBe(0);
    expect(ROLL_STAKE_MOST).toBe(BET_IDS.length * SPOT_MAX);
  });

  it('keeps the board to the last 20 rolls, the latest first', async () => {
    const { table } = await opened();
    for (let i = 0; i < 25; i++) {
      table.place('single-1', 1);
      table.roll([((i % 6) + 1) as 1, 2, 3], i);
    }
    expect(table.table().history).toHaveLength(HISTORY_LIMIT);
    expect(table.table().history[0]).toEqual([1, 2, 3]); // the 25th roll: 24 % 6 + 1
    expect(table.table().stats.rolls).toBe(25);
  });
});

describe('the table is kept with its bets on it', () => {
  it('finds the same bets and the same last roll after a reload, and every medal is where it was', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = sicBoOn(first);
    await quiet(browser);
    one.table.place('small', 5);
    one.table.roll([1, 1, 2], 9);
    one.table.place('total-12', 7);
    one.table.place('double-6', 3);
    const before = one.table.table();
    const medals = first.bank.balance();
    first.close();
    await quiet(browser);

    const again = browser.open();
    const two = sicBoOn(again);
    await quiet(browser);
    expect(two.table.table()).toEqual(before);
    expect(two.table.table().bets).toEqual({ 'total-12': 7, 'double-6': 3 });
    expect(again.bank.balance()).toBe(medals);
    expect(squared(again, two.table)).toBe(0);
    // The bets play on from there: 6 6 5 wins the double 6, and the total 12 loses.
    expect(two.table.roll([6, 6, 7] as unknown as Dice, 1)).toEqual({ ok: false, error: 'bad' });
    const won = two.table.roll([6, 6, 5], 1);
    expect(won.ok && won.value.resolution.returned).toBe(3 * 11);
    expect(again.bank.balance()).toBe(medals + 33);
  });

  it('reads back exactly what it writes, and nothing that is not a table of this version', () => {
    const table: Table = {
      ...freshTable(),
      bets: { small: 10, 'pair-2-5': 3 },
      placed: [{ id: 'pair-2-5', amount: 3 }],
      lastRound: { big: 5 },
      stats: { rolls: 3, played: 30, won: 12, biggest: 10, triples: 1 },
      history: [
        [1, 2, 3],
        [4, 4, 4],
      ],
      last: { bets: { big: 5 }, dice: [1, 2, 3], seed: 42 },
      id: 'abc123def0',
      seq: 4,
    };
    expect(parseTable(serializeTable(table))).toEqual(table);
    const fresh = serializeTable(freshTable());
    const wrong = (change: (raw: Record<string, unknown>) => void): string => {
      const raw = JSON.parse(fresh) as Record<string, unknown>;
      change(raw);
      return JSON.stringify(raw);
    };
    for (const text of [
      null,
      42,
      '',
      'not json',
      '[]',
      wrong((raw) => (raw.v = 2)),
      wrong((raw) => (raw.bets = { small: -5 })),
      wrong((raw) => (raw.bets = { small: 2.5 })),
      wrong((raw) => (raw.bets = { small: 100 })),
      wrong((raw) => (raw.bets = { 'total-3': 5 })),
      wrong((raw) => (raw.placed = [{ id: 'small', amount: 5 }])),
      wrong((raw) => (raw.stats = { rolls: 1 })),
      wrong((raw) => (raw.history = [[7, 1, 1]])),
      wrong((raw) => (raw.history = Array.from({ length: 21 }, () => [1, 2, 3]))),
      wrong((raw) => (raw.last = { bets: {}, dice: [1, 2], seed: 1 })),
      wrong((raw) => (raw.last = { bets: {}, dice: [1, 2, 3], seed: -1 })),
      'x'.repeat(40_000),
    ])
      expect(parseTable(text)).toBeNull();
    expect(parseTable(fresh)).toEqual(freshTable());
  });

  it('opens a fresh table over one it cannot read, puts that aside, and moves no medals for it', async () => {
    const browser = new FakeBrowser();
    const unreadable = JSON.stringify({ bankroll: 1000, bets: { small: 25 } });
    browser.storage.set(TABLE_KEY, unreadable);
    const page = browser.open();
    const { table } = sicBoOn(page);
    await quiet(browser);
    expect(table.table()).toEqual(freshTable());
    expect(browser.storage.get(unreadKey(null))).toBe(unreadable);
    expect(table.place('small', 5).ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 5);
  });
});

describe('one page plays at a time', () => {
  it('stops taking bets when another tab takes the medals, and plays that tab’s table when it has them back', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = sicBoOn(first);
    await quiet(browser);
    one.table.place('big', 5);

    const second = browser.open();
    const two = sicBoOn(second);
    await quiet(browser);
    expect(first.bank.getState().card).toBe('away');
    expect(one.table.place('small', 5)).toEqual({ ok: false, error: 'notHere' });
    expect(one.table.roll([4, 5, 6], 1)).toEqual({ ok: false, error: 'notHere' });
    expect(two.table.table().bets).toEqual({ big: 5 });
    two.table.place('total-15', 2);
    two.table.roll([4, 5, 6], 3); // Big and the total 15 win: 10 + 36
    expect(second.bank.balance()).toBe(WELCOME - 7 + 46);

    one.seat.play();
    await quiet(browser);
    expect(one.table.table().history).toEqual([[4, 5, 6]]);
    expect(first.bank.balance()).toBe(WELCOME + 39);
    expect(two.table.place('small', 1)).toEqual({ ok: false, error: 'notHere' });
  });
});

describe('a reset at the Medal Game Center', () => {
  it('clears the table, whose bets went with the medals, once', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table } = sicBoOn(page);
    await quiet(browser);
    table.place('small', 20);
    table.roll([1, 2, 3], 1);
    table.place('big', 30);
    hub.bank.reset();
    await quiet(browser);
    expect(page.bank.balance()).toBe(WELCOME);
    expect(table.table()).toEqual(freshTable());
    expect(unmarked(storedTable(browser))).toEqual(freshTable());
    expect(page.bank.restartDue(SIC_BO_GAME)).toBe(false);
    table.place('single-2', 5);
    table.sync();
    expect(table.table().bets).toEqual({ 'single-2': 5 });
  });
});

describe('storage that will not keep the table', () => {
  it('makes no bet the table cannot write down, and plays on in the page alone where nothing can be kept', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const failing: TableStorage = {
      ...storageOf(page),
      write: (key) => {
        if (key.startsWith(TABLE_KEY)) throw new Error('full');
      },
    };
    const { table } = sicBoOn(page, failing);
    await quiet(browser);
    expect(table.place('small', 5)).toEqual({ ok: false, error: 'notKept' });
    expect(page.bank.balance()).toBe(WELCOME);

    const blocked = new FakeBrowser();
    blocked.blocked = true;
    const alone = blocked.open();
    const solo = sicBoOn(alone);
    await quiet(blocked);
    expect(solo.table.place('big', 5).ok).toBe(true);
    const rolled = solo.table.roll([6, 5, 4], 1);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10);
    expect(alone.bank.balance()).toBe(WELCOME + 5);
  });

  it('leaves the table as it was when the medals a roll gives back are not kept: neither lost nor made twice', async () => {
    const { browser, page, table } = await opened();
    table.place('small', 5);
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === 'medal-center-bank') throw new Error('full');
      write(key, text);
    };
    expect(table.roll([1, 2, 3], 1)).toEqual({ ok: false, error: 'notKept' });
    expect(table.table().bets).toEqual({ small: 5 });
    expect(table.table().stats.rolls).toBe(0);
    expect(storedMedals(browser)).toBe(WELCOME - 5);
    page.env.write = write;
    expect(table.roll([1, 2, 3], 1).ok).toBe(true);
    expect(storedMedals(browser)).toBe(WELCOME + 5);
  });
});

describe('a browser that dies between two writes', () => {
  const tables = new Map<FakeBrowser, { page: FakePage; table: MedalTable }>();
  const setUp = async () => {
    const at = await opened();
    tables.set(at.browser, at);
    return at.browser;
  };

  it('loses no medal and makes none, wherever the browser dies in an evening of bets, rolls, undo and Same bets', async () => {
    const evening = (table: MedalTable) => {
      table.place('small', 5);
      table.place('pair-2-4', 2);
      table.place('total-9', 1);
      table.undo(); // the total 9 comes back
      table.roll([2, 4, 4], 11); // Small and the pair win: 10 + 12
      table.repeat(); // Small 5 and the pair 2 again
      table.place('triple-1', 1);
      table.roll([6, 6, 6], 12); // all lose
      table.place('big', 3);
      table.clear();
    };
    const writes = await atEveryWrite(
      setUp,
      (browser) => evening(tables.get(browser)!.table),
      async (after, reached) => {
        const page = after.open();
        const { table } = sicBoOn(page);
        await quiet(after);
        table.sync();
        expect(squared(page, table), `died after ${reached} writes`).toBe(0);
        expect(storedMedals(after) + onTable(table.table()), `died after ${reached} writes`).toBe(WELCOME + table.table().stats.won - table.table().stats.played);
        // Medals are out at the table while bets lie on it, and only then, wherever the browser died.
        const out = () => medalsOutAt(parseLedger(after.storage.get('medal-center-bank') ?? null)!);
        expect(out(), `died after ${reached} writes`).toEqual(onTable(table.table()) > 0 ? [SIC_BO_GAME] : []);
        // It plays on, and once a move is made only its receipt is kept.
        expect(table.place('single-5', 1).ok).toBe(true);
        expect(squared(page, table), `died after ${reached} writes`).toBe(0);
        const ledger = parseLedger(after.storage.get('medal-center-bank') ?? null)!;
        const round = `${SIC_BO_GAME}:${table.table().id}-${table.table().seq}`;
        expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${round}:move`, `${round}:out`]);
      },
    );
    expect(writes).toBeGreaterThanOrEqual(16);
  });

  it('gives back exactly what a winning roll owes, once, wherever the browser dies in it', async () => {
    await atEveryWrite(
      async () => {
        const browser = await setUp();
        const { table } = tables.get(browser)!;
        table.place('small', 5);
        table.place('double-1', 2);
        return browser;
      },
      (browser) => {
        tables.get(browser)!.table.roll([1, 1, 5], 3);
      },
      async (after, reached) => {
        const page = after.open();
        const { table } = sicBoOn(page);
        await quiet(after);
        table.sync();
        // Either the roll never happened (the bets still on the layout) or it did, and its 10 + 22 came back once.
        const rolled = table.table().stats.rolls === 1;
        expect(storedMedals(after), `died after ${reached} writes`).toBe(rolled ? WELCOME - 7 + 32 : WELCOME - 7);
        expect(onTable(table.table())).toBe(rolled ? 0 : 7);
      },
    );
  });
});

describe('the medals’ history and the floor', () => {
  it('counts each roll as one round of the table, with what it took and what came back, and not the medals going on and off', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = sicBoOn(page);
    page.bank.watchHistory(() => undefined);
    await quiet(browser);
    table.place('small', 5);
    table.place('big', 5);
    table.place('single-6', 9);
    expect(table.undo().ok).toBe(true);
    table.roll([1, 2, 3], 1); // Small wins 10
    browser.clock += 1000;
    table.place('single-6', 2);
    table.roll([1, 2, 3], 2); // loses
    const rounds = page.bank.historyState().history!.entries.filter((entry) => entry.g === SIC_BO_GAME);
    expect(rounds.map((entry) => [entry.bet, entry.won])).toEqual([
      [2, 0],
      [10, 10],
    ]);
    expect(recordsOf(page.bank.historyState().history!).find((record) => record.game === SIC_BO_GAME)).toMatchObject({ rounds: 2, bet: 12, won: 10, top: 10 });
  });
});

describe('a guest who signs in', () => {
  it('takes the table along when the guest’s medals become a new account’s, and leaves nothing behind for the next guest', async () => {
    const UID = 'test-player-1';
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    const { table } = sicBoOn(page);
    await quiet(browser);
    table.place('big', 5);
    table.place('total-16', 2);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 7 });
    table.sync();
    expect(table.table().bets).toEqual({ big: 5, 'total-16': 2 });
    expect(storedTable(browser, UID)?.bets).toEqual({ big: 5, 'total-16': 2 });
    expect(browser.storage.has(TABLE_KEY)).toBe(false);
    // The bets play on with the account's medals: 4 6 6 is Big and 16.
    const rolled = table.roll([4, 6, 6], 2);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10 + 62);
    // Signed out, the next guest has a new member's medals and a layout with nothing on it.
    page.bank.attend({ uid: null, settled: true, expected: false }, accounts.store);
    await quiet(browser);
    table.sync();
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(table.table().bets).toEqual({});
    expect(table.clear()).toEqual({ ok: false, error: 'nothing' });
  });
});
