import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, parseLedger } from '@/components/game/MedalCenter/ledger';
import { ROULETTE_RESULTS_STORAGE_KEY, parseStoredResults } from '@/components/game/Roulette/resultsStore';
import {
  BET_STEPS,
  MIN_BET,
  ROULETTE_GAME,
  SPIN_KEY,
  SPOT_MAX,
  createTable,
  parseSpin,
  readBet,
  serializeSpin,
  spinId,
  spinKey,
  tapAmount,
  winningsOf,
  type PlacedBet,
  type SpinRecord,
  type Staked,
} from '@/components/game/Roulette/medalTable';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';

// The roulette table plays with the medal center's medals: a spin's stake is taken once, its winnings are given back
// once, and neither is lost or doubled by a reload, another tab, a reset or old saved state. The bank here is the real
// one (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is fetched and no account is real.

const RED: PlacedBet = { bet: { kind: 'red' }, amount: 10 };
const SEVENTEEN: PlacedBet = { bet: { kind: 'straight', number: 17 }, amount: 2 };
// 17 is black, 18 red.
const HITS_17 = 17;
const HITS_RED = 18;

/** The medals this browser keeps for a player, as the bank reads them. */
const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): SpinRecord | null => parseSpin(browser.storage.get(spinKey(owner)) ?? null);

/**
 * A page with the roulette table on it, wired as PlayTab wires it: it sits at the medal center for the card, and a
 * spin still rolling is settled as the card goes; a reset starts the table over.
 */
function rouletteOn(page: FakePage) {
  let rolling: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('spin') });
  seat.current = page.bank.sit(ROULETTE_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      yielded.push(why);
      if (rolling && !rolling.paid && !rolling.void) table.settle(rolling);
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (rolling) rolling.void = true;
    table.clear();
    page.bank.restarted(ROULETTE_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** SPIN: the number is drawn (here: given) and the bets are staked. */
    spin(bets: PlacedBet[], result: number): Staked | null {
      rolling = table.stake(bets, result);
      return rolling;
    },
    /** The ball stops on this page. */
    stop() {
      const spun = rolling;
      rolling = null;
      return spun ? table.settle(spun) : null;
    },
    get rolling() {
      return rolling;
    },
  };
}

/** A page that is killed (the tab crashes, the phone drops it) without a word: no `pagehide`, the card let go by the browser. */
function crash(browser: FakeBrowser, page: FakePage): void {
  page.closed = true;
  page.watchers = null;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
  const next = browser.queue.shift();
  if (next) browser.tasks.push(() => browser.give2(next));
}

describe('the table’s limits and its arithmetic', () => {
  it('takes at least one medal a bet and at most 99 on a spot, a tap adding its step or what still fits', () => {
    expect(MIN_BET).toBe(1);
    expect(SPOT_MAX).toBe(99);
    expect(BET_STEPS).toEqual([1, 5, 10, 50]);
    expect(tapAmount(5, 0, 100)).toBe(5);
    expect(tapAmount(50, 90, 100)).toBe(9);
    expect(tapAmount(10, 99, 100)).toBe(0);
    expect(tapAmount(10, 0, 3)).toBe(3);
    expect(tapAmount(1, 0, 0)).toBe(0);
  });

  it('pays what the published odds say, the bet coming back with it', () => {
    expect(winningsOf([RED], HITS_RED)).toBe(20);
    expect(winningsOf([RED], HITS_17)).toBe(0);
    expect(winningsOf([SEVENTEEN], HITS_17)).toBe(2 * 36);
    expect(winningsOf([RED, SEVENTEEN], 0)).toBe(0);
    expect(winningsOf([{ bet: { kind: 'straight', number: 0 }, amount: 1 }], 0)).toBe(36);
    expect(winningsOf([{ bet: { kind: 'corner', numbers: [1, 2, 4, 5] }, amount: 3 }], 5)).toBe(27);
  });

  it('names a spin so that no two spins share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => spinId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,64}$/);
  });
});

describe('a spin, once', () => {
  it('takes the stake once when the wheel spins and gives the winnings back once when the ball stops', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    expect(roulette.seat.holding()).toBe(true);

    const staked = roulette.spin([RED, SEVENTEEN], HITS_17);
    expect(staked?.record).toMatchObject({ wagered: 12, won: 72, paid: false, owner: null, era: 0 });
    // Written down, then taken: the record is there before the medals are gone.
    expect(stored(browser)).toBe(WELCOME - 12);
    expect(record(browser)).toMatchObject({ id: staked?.record.id, paid: false });

    expect(roulette.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 12 + 72);
    expect(record(browser)).toMatchObject({ id: staked?.record.id, paid: true });
    // Settling it again pays nothing more.
    expect(roulette.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 12 + 72);
  });

  it('takes a losing spin’s stake and gives nothing back', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    roulette.spin([RED], HITS_17);
    expect(roulette.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 10);
    expect(roulette.table.last()).toMatchObject({ result: HITS_17, won: 0, wagered: 10 });
  });

  it('takes nothing and writes nothing down for bets the medals do not cover, or for no bets at all', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    expect(roulette.spin([{ bet: { kind: 'red' }, amount: 99 }, { bet: { kind: 'black' }, amount: 2 }], HITS_RED)).toBeNull();
    expect(roulette.spin([], HITS_RED)).toBeNull();
    expect(roulette.spin([{ bet: { kind: 'red' }, amount: 100 }], HITS_RED)).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
  });

  it('takes nothing on a page that does not hold the card', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = rouletteOn(first);
    await quiet(browser);
    const second = browser.open();
    rouletteOn(second);
    await quiet(browser);
    expect(first.bank.getState().card).toBe('away');
    expect(one.spin([RED], HITS_RED)).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('a reload while the ball is rolling', () => {
  it('settles the spin as the page is left, so the reloaded page finds it paid and shows it as the last spin', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const roulette = rouletteOn(before);
    await quiet(browser);
    const staked = roulette.spin([RED], HITS_RED);
    // pagehide: the card goes, and the spin is settled before it does.
    before.hide('left');
    before.close();
    expect(roulette.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - 10 + 20);
    expect(record(browser)).toMatchObject({ id: staked?.record.id, paid: true });

    const after = browser.open();
    const reloaded = rouletteOn(after);
    await quiet(browser);
    expect(reloaded.seat.holding()).toBe(true);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.table.last()).toMatchObject({ id: staked?.record.id, result: HITS_RED, won: 20 });
    expect(stored(browser)).toBe(WELCOME + 10);
    // The ball the first page left rolling stops nowhere: had it, it would have paid nothing more.
    expect(roulette.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME + 10);
  });

  it('finishes a spin whose page was killed before it could settle: the next page spins it again to the same number and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const roulette = rouletteOn(killed);
    await quiet(browser);
    const staked = roulette.spin([RED, SEVENTEEN], HITS_17);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - 12);

    const next = browser.open();
    const reopened = rouletteOn(next);
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, result: HITS_17, wagered: 12, won: 72, paid: false });
    // Never refunded: the stake stays taken, and the spin is finished with the number drawn when it was bet.
    const resumed: Staked = { record: left!, stored: true, paid: false, void: false };
    expect(reopened.table.settle(resumed)).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 12 + 72);
    expect(reopened.table.leftover()).toBeNull();

    // A third page, or the same one reloaded again, finds nothing more to pay.
    next.hide('left');
    next.close();
    const third = browser.open();
    const again = rouletteOn(third);
    await quiet(browser);
    expect(again.table.leftover()).toBeNull();
    expect(stored(browser)).toBe(WELCOME + 60);
  });

  it('does not start a new spin over one still to be finished', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = rouletteOn(killed);
    await quiet(browser);
    expect(first.spin([RED], HITS_RED)).not.toBeNull();
    crash(browser, killed);
    const next = browser.open();
    const reopened = rouletteOn(next);
    await quiet(browser);
    expect(reopened.spin([RED], HITS_17)).toBeNull();
    expect(stored(browser)).toBe(WELCOME - 10);
  });
});

describe('another tab', () => {
  it('settles the spin as another tab takes the medals, and the ball stopping afterwards pays nothing more', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = rouletteOn(first);
    await quiet(browser);
    one.spin([RED], HITS_RED);
    const second = browser.open();
    const two = rouletteOn(second);
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(two.seat.holding()).toBe(true);
    expect(stored(browser)).toBe(WELCOME + 10);
    // The second tab has nothing to finish, and the first tab's ball stopping now pays nothing.
    expect(two.table.leftover()).toBeNull();
    expect(one.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME + 10);
    // Played in the second tab, the medals are the same.
    two.spin([RED], HITS_17);
    expect(two.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME);
    expect(second.bank.getState().balance).toBe(WELCOME);
    // Back to the first: it bets the same medals.
    one.seat.play();
    await quiet(browser);
    expect(one.seat.holding()).toBe(true);
    expect(first.bank.getState().balance).toBe(WELCOME);
  });

  it('lends the card to the medal center for a moment mid-spin: the spin is settled, the bonus paid, and both counted once', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    roulette.spin([SEVENTEEN], HITS_17);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(roulette.yielded).toEqual(['moment']);
    expect(roulette.seat.holding()).toBe(true);
    const bonus = (hub.bank.getState().balance ?? 0) - (WELCOME - 2 + 72);
    expect(bonus).toBeGreaterThan(0);
    expect(roulette.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 2 + 72 + bonus);
  });
});

describe('the medal center’s reset', () => {
  it('settles a rolling spin before the reset, then starts the table over: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    roulette.spin([SEVENTEEN], HITS_17);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(parseLedger(browser.storage.get(BANK_KEY) ?? null)?.era).toBe(1);
    // The table started over on this device, and its spin is off the record.
    expect(page.bank.restartDue(ROULETTE_GAME)).toBe(false);
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    expect(roulette.stop()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('throws away a spin left unfinished before a reset: its stake went with every other medal', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = rouletteOn(killed);
    await quiet(browser);
    expect(before.spin([SEVENTEEN], HITS_17)).not.toBeNull();
    crash(browser, killed);
    expect(record(browser)).toMatchObject({ paid: false, era: 0 });
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);

    const next = browser.open();
    const reopened = rouletteOn(next);
    await quiet(browser);
    expect(next.bank.restartDue(ROULETTE_GAME)).toBe(true);
    expect(reopened.table.leftover()).toBeNull();
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });

  it('pays nothing into the new medals for a spin bet before the reset, even if nobody voided it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const table = rouletteOn(page);
    await quiet(browser);
    const staked = table.table.stake([SEVENTEEN], HITS_17)!;
    // The reset reaches this page while it holds the card (another device's, joined in): the era moves on under the spin.
    page.bank.reset();
    await quiet(browser);
    const fresh: Staked = { ...staked, paid: false, void: false };
    expect(table.table.settle(fresh)).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('players, storage and old saved state', () => {
  it('keeps each player’s spin under their own name, and never settles one into another player’s medals', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    const guest = roulette.spin([RED], HITS_RED)!;
    expect(spinKey(null)).toBe(SPIN_KEY);
    expect(spinKey('test-player-1')).toBe(`${SPIN_KEY}:test-player-1`);
    // The medals on the table belong to somebody else now (as when a player signs in mid-spin).
    const someoneElse = { ...guest, record: { ...guest.record, owner: 'test-player-1' } };
    expect(roulette.table.settle(someoneElse)).toBe('later');
    expect(stored(browser)).toBe(WELCOME - 10);
    expect(roulette.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME + 10);
  });

  it('plays from memory where storage is blocked: the stake taken and the winnings given once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = roulette.spin([RED], HITS_RED);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - 10);
    expect(roulette.stop()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME + 10);
    expect(roulette.table.settle(staked!)).toBe('already');
    expect(page.bank.getState().balance).toBe(WELCOME + 10);
  });

  it('opens over old saved state without trouble: the results board is kept, and anything at the spin’s place that is not a spin is cleared', async () => {
    const browser = new FakeBrowser();
    // What a player of the chip-era table has on this device: the results board, and nothing of the chips (they were
    // never saved). Beside it, text no table wrote, where the table writes its spin.
    const board = JSON.stringify({ results: [17, 0, 32, 5], spinCount: 412 });
    browser.storage.set(ROULETTE_RESULTS_STORAGE_KEY, board);
    browser.storage.set(SPIN_KEY, '{"v":0,"bankroll":1000,"chips":[25,100]}');
    const page = browser.open();
    const roulette = rouletteOn(page);
    await quiet(browser);
    expect(roulette.table.leftover()).toBeNull();
    expect(roulette.table.last()).toBeNull();
    expect(browser.storage.has(SPIN_KEY)).toBe(false);
    // A new player's medals, not the old chips.
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.get(ROULETTE_RESULTS_STORAGE_KEY)).toBe(board);
    expect(parseStoredResults(board)).toEqual({ results: [17, 0, 32, 5], spinCount: 412 });
    expect(roulette.spin([RED], HITS_RED)).not.toBeNull();
    expect(roulette.stop()).toBe('paid');
  });

  it('reads back only a spin it could have written: every field checked, what it bet and won worked out again', () => {
    const good: SpinRecord = { v: 1, id: 'spin1', owner: null, era: 0, result: HITS_17, bets: [RED, SEVENTEEN], wagered: 12, won: 72, paid: false };
    expect(parseSpin(serializeSpin(good))).toEqual(good);
    expect(parseSpin(serializeSpin({ ...good, owner: 'test-player-1', era: 3, paid: true }))).toMatchObject({ owner: 'test-player-1', era: 3, paid: true });
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, won: 73 }),
      JSON.stringify({ ...good, wagered: 11 }),
      JSON.stringify({ ...good, result: 37 }),
      JSON.stringify({ ...good, bets: [] }),
      JSON.stringify({ ...good, bets: [{ bet: { kind: 'red' }, amount: 100 }], wagered: 100, won: 0 }),
      JSON.stringify({ ...good, bets: [{ bet: { kind: 'red' }, amount: 0 }], wagered: 0, won: 0 }),
      JSON.stringify({ ...good, bets: [{ bet: { kind: 'red' }, amount: 1.5 }], wagered: 1.5, won: 0 }),
      JSON.stringify({ ...good, bets: [{ bet: { kind: 'jackpot' }, amount: 1 }], wagered: 1, won: 0 }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, paid: 'yes' }),
    ];
    for (const text of bad) expect(parseSpin(text)).toBeNull();
    expect(readBet({ kind: 'split', numbers: [1, 2] })).toEqual({ kind: 'split', numbers: [1, 2] });
    expect(readBet({ kind: 'split', numbers: [1, 1] })).toBeNull();
    expect(readBet({ kind: 'street', numbers: [1, 2] })).toBeNull();
    expect(readBet({ kind: 'dozen', which: 4 })).toBeNull();
    expect(readBet({ kind: 'straight', number: 37 })).toBeNull();
    expect(readBet({ kind: 'column', which: 2 })).toEqual({ kind: 'column', which: 2 });
  });
});

describe('the demos', () => {
  it('never touch the player’s medals: the Martingale and house-edge tabs do not reach the medal center', () => {
    for (const file of ['SimTab.tsx', 'EdgeTab.tsx', 'charts.tsx', 'engine.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/Roulette', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
