import { describe, expect, it } from 'vitest';

import { type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, give, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { BET_IDS, POINT_NUMBERS, comePoint, maxOdds, resolveRoll, type BetId, type Bets, type Dice, type PointNumber } from '@/components/game/Craps/engine';
import {
  BET_SIZES,
  CRAPS_GAME,
  SPOT_MAX,
  TABLE_KEY,
  createTable,
  freshTable,
  onTable,
  parseTable,
  placeError,
  pressAmount,
  purseOf,
  serializeTable,
  spotLimit,
  stakeStep,
  tableKey,
  unreadKey,
  type MedalTable,
  type Table,
  type TablePurse,
  type TableStorage,
} from '@/components/game/Craps/medalTable';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// The craps table on the medal center's floor, played against the real medal bank in a fake browser (one storage the
// pages share, the one card, the channel between the pages). Nothing is fetched and no account is named.

const ALL_DICE: Dice[] = Array.from({ length: 36 }, (_, i) => [1 + Math.floor(i / 6), 1 + (i % 6)] as const);

/** A page's own storage, as the table is given it. */
const storageOf = (page: FakePage): TableStorage => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text), remove: (key) => page.env.remove(key) });

/** A page with the craps table on it, seated at the medal center as the game seats it. */
function crapsOn(page: FakePage, storage: TableStorage = storageOf(page)) {
  const held: { seat: Seat | null } = { seat: null };
  const table: MedalTable = createTable(purseOf(page.bank), storage, () => held.seat?.holding() ?? false);
  held.seat = page.bank.sit(CRAPS_GAME, { granted: () => table.sync(), yielding: () => undefined });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (held.seat?.holding()) table.sync();
    else table.resetSeen();
  });
  return { table, seat: held.seat };
}

/** The medals the browser keeps for a guest. */
const storedMedals = (browser: FakeBrowser): number => {
  const ledger = parseLedger(browser.storage.get('medal-center-bank') ?? null);
  return ledger ? balanceOf(ledger) : -1;
};
const storedTable = (browser: FakeBrowser, owner: string | null = null): Table | null => parseTable(browser.storage.get(tableKey(owner)) ?? null);
/** A table without the mark of the medals it was written with. */
const unmarked = (table: Table | null): Omit<Table, 'mark'> | null => {
  if (!table) return null;
  const { mark: _mark, ...rest } = table;
  return rest;
};

/** Every medal the player has: in hand and on the table. */
const everything = (page: FakePage, table: MedalTable): number => page.bank.balance() + onTable(table.table());

async function opened() {
  const browser = new FakeBrowser();
  const page = browser.open();
  const craps = crapsOn(page);
  await quiet(browser);
  return { browser, page, ...craps };
}

describe('bets come out of the medals and go back into them, once each', () => {
  it('takes a bet’s medals as it is put on, and gives back the bet and its win when it wins', async () => {
    const { browser, page, table } = await opened();
    expect(page.bank.balance()).toBe(WELCOME);
    expect(table.place('pass', 5)).toEqual({ ok: true, value: true });
    expect(page.bank.balance()).toBe(WELCOME - 5);
    expect(storedMedals(browser)).toBe(WELCOME - 5);
    expect(storedTable(browser)?.bets).toEqual({ pass: 5 });

    // 3 + 4 on the come-out: the Pass Line wins 1:1, and its 5 come back with 5 more, once.
    const rolled = table.roll([3, 4]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10);
    expect(page.bank.balance()).toBe(WELCOME + 5);
    expect(storedMedals(browser)).toBe(WELCOME + 5);
    expect(table.table().bets).toEqual({});
    expect(table.table().stats.net).toBe(5);
    // A roll with nothing on the table moves no medals.
    table.roll([3, 4]);
    expect(page.bank.balance()).toBe(WELCOME + 5);
    expect(table.table().stats.rolls).toBe(2);
  });

  it('keeps the medals of a bet that loses, and gives a place bet that wins only its win, leaving it up', async () => {
    const { page, table } = await opened();
    table.place('pass', 5);
    table.roll([2, 4]); // the point is 6
    expect(table.table().point).toBe(6);
    expect(table.place('place8', 6).ok).toBe(true);
    expect(table.place('field', 5).ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 16);
    // 4 + 4: the place 8 wins 7 for 6 and stays up; the field loses its 5; the Pass rides on.
    const rolled = table.roll([4, 4]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(7);
    expect(page.bank.balance()).toBe(WELCOME - 16 + 7);
    expect(table.table().bets).toEqual({ pass: 5, place8: 6 });
    expect(table.table().stats.net).toBe(7 - 5);
    // Seven out: both go.
    table.roll([3, 4]);
    expect(page.bank.balance()).toBe(WELCOME - 16 + 7);
    expect(table.table().bets).toEqual({});
    expect(table.table().stats.net).toBe(7 - 5 - 11);
    expect(table.table().stats.sevenOuts).toBe(1);
  });

  it('takes a Come bet once a point is on, moves it to its number with no medals moving, and pays it and its odds there', async () => {
    const { browser, page, table } = await opened();
    // On the come-out roll there is no Come: it would be the Pass Line.
    expect(table.place('come', 5)).toEqual({ ok: false, error: 'comeNeedsPoint' });
    table.place('pass', 5);
    table.roll([2, 4]); // the point is 6
    expect(table.place('come', 5).ok).toBe(true);
    expect(table.place('dontCome', 3).ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 13);
    // A 9 moves both to the 9: nothing is decided and no medals move.
    const moved = table.roll([4, 5]);
    expect(moved.ok && moved.value.resolution.moves).toEqual([
      { id: 'come', stake: 5, to: 9 },
      { id: 'dontCome', stake: 3, to: 9 },
    ]);
    expect(page.bank.balance()).toBe(WELCOME - 13);
    expect(table.table().bets).toEqual({ pass: 5, come9: 5, dontCome9: 3 });
    expect(storedTable(browser)?.bets).toEqual({ pass: 5, come9: 5, dontCome9: 3 });
    // Odds behind the Come 9 go in 2s (3:2), up to 4×; nothing goes on the come point itself.
    expect(table.place('come9', 5)).toEqual({ ok: false, error: 'comeTravels' });
    expect(pressAmount('comeOdds9', 1, 6, table.table().bets)).toEqual({ amount: 2 });
    expect(table.place('comeOdds9', 3)).toEqual({ ok: false, error: 'step' });
    expect(table.place('comeOdds9', 20).ok).toBe(true);
    expect(pressAmount('comeOdds9', 1, 6, table.table().bets)).toEqual({ error: 'oddsLimit' });
    // Take down leaves the Come 9 (a contract) and takes the rest that may come down: the Don't Come 9 and the odds.
    expect(table.takeDown().ok).toBe(true);
    expect(table.table().bets).toEqual({ pass: 5, come9: 5 });
    expect(page.bank.balance()).toBe(WELCOME - 13 - 20 + 20 + 3);
    table.place('comeOdds9', 20);
    // The 9 again: the Come 9 wins 1:1 and its odds 3:2, and both come down.
    const won = table.roll([5, 4]);
    expect(won.ok && won.value.resolution.returned).toBe(5 + 5 + 20 + 30);
    expect(table.table().bets).toEqual({ pass: 5 });
    expect(everything(page, table)).toBe(WELCOME + 5 + 30);
    expect(table.table().stats.net).toBe(5 + 30);
  });

  it('gives the odds behind a come point back when the come-out decides it, and Repeat bets puts back only what can be put on', async () => {
    const { page, table } = await opened();
    table.place('pass', 5);
    table.roll([2, 4]); // the point is 6
    table.place('come', 5);
    table.roll([2, 2]); // the Come goes to the 4
    table.place('comeOdds4', 15);
    table.roll([3, 3]); // the point is made: the come-out is next
    expect(table.table().point).toBeNull();
    expect(table.table().bets).toEqual({ come4: 5, comeOdds4: 15 });
    const before = page.bank.balance();
    // A come-out 7: the Pass would win, the Come 4 loses, and its odds (off) come back.
    table.place('pass', 5);
    const seven = table.roll([3, 4]);
    expect(seven.ok && seven.value.resolution.returned).toBe(10 + 15);
    expect(page.bank.balance()).toBe(before - 5 + 10 + 15);
    expect(table.table().bets).toEqual({});
    // Repeat bets puts the Pass back; not the Come 4 (a Come bet gets there by moving), nor odds behind it.
    expect(table.repeat().ok).toBe(true);
    expect(table.table().bets).toEqual({ pass: 5 });
  });

  it('gives back exactly what Undo, Clear and Take down take off the table, once', async () => {
    const { browser, page, table } = await opened();
    table.place('pass', 10);
    table.roll([5, 5]); // the point is 10
    table.place('passOdds', 30);
    table.place('place6', 12);
    table.place('hard8', 5);
    table.place('field', 1);
    expect(everything(page, table)).toBe(WELCOME);
    expect(page.bank.balance()).toBe(WELCOME - 58);

    expect(table.undo().ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 57);
    expect(table.clear().ok).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 10);
    expect(table.table().bets).toEqual({ pass: 10 });
    expect(table.clear()).toEqual({ ok: false, error: 'nothing' });
    expect(table.undo()).toEqual({ ok: false, error: 'nothing' });

    table.place('passOdds', 30);
    table.place('place6', 12);
    table.roll([1, 1]); // no decision: the bets stand and can no longer be undone
    expect(table.undo()).toEqual({ ok: false, error: 'nothing' });
    // Take down brings back all but the Pass Line, whose point is on.
    expect(table.takeDown().ok).toBe(true);
    expect(table.table().bets).toEqual({ pass: 10 });
    expect(page.bank.balance()).toBe(WELCOME - 10);
    expect(table.takeDown()).toEqual({ ok: false, error: 'nothing' });
    expect(page.bank.balance()).toBe(WELCOME - 10);
    expect(storedMedals(browser)).toBe(WELCOME - 10);
    expect(storedTable(browser)?.bets).toEqual({ pass: 10 });
  });

  it('refuses a bet the medals cannot cover, and moves nothing', async () => {
    const { page, table } = await opened();
    table.place('pass', 50);
    table.place('dontPass', 48);
    expect(table.place('field', 5)).toEqual({ ok: false, error: 'noMedals' });
    expect(page.bank.balance()).toBe(2);
    expect(table.place('field', 2).ok).toBe(true);
    expect(page.bank.balance()).toBe(0);
    expect(everything(page, table)).toBe(WELCOME);
  });

  it('puts the last roll’s bets back with Repeat, as far as the medals and the rules allow', async () => {
    const { page, table } = await opened();
    table.place('pass', 5);
    table.place('field', 5);
    table.roll([1, 2]); // 3, craps: the Pass loses its 5 and the Field wins 5
    expect(table.table().bets).toEqual({});
    expect(page.bank.balance()).toBe(WELCOME);
    expect(table.repeat().ok).toBe(true);
    expect(table.table().bets).toEqual({ pass: 5, field: 5 });
    expect(page.bank.balance()).toBe(WELCOME - 10);
    expect(everything(page, table)).toBe(WELCOME);
  });
});

describe('only stakes that pay whole medals', () => {
  it('takes each spot in the steps its payout needs', () => {
    expect(stakeStep('place6', null)).toBe(6);
    expect(stakeStep('place8', 4)).toBe(6);
    expect(stakeStep('place4', null)).toBe(5);
    expect(stakeStep('place5', null)).toBe(5);
    expect(stakeStep('place9', null)).toBe(5);
    expect(stakeStep('place10', null)).toBe(5);
    expect(POINT_NUMBERS.map((p) => stakeStep('passOdds', p))).toEqual([1, 2, 5, 5, 2, 1]);
    expect(POINT_NUMBERS.map((p) => stakeStep('dontPassOdds', p))).toEqual([2, 3, 6, 6, 3, 2]);
    for (const id of ['pass', 'dontPass', 'field', 'any7', 'anyCraps', 'yo', 'aces', 'twelve', 'hard4', 'hard6', 'hard8', 'hard10'] as BetId[]) {
      expect(stakeStep(id, null)).toBe(1);
      expect(stakeStep(id, 6)).toBe(1);
    }
  });

  it('pays whole medals on every roll, for every stake any spot takes, at every point', () => {
    const points: (PointNumber | null)[] = [null, ...POINT_NUMBERS];
    let checked = 0;
    let fractions = 0;
    for (const point of points) {
      for (const id of BET_IDS) {
        // A Come bet gets to its number only by moving there; the odds behind one are tried with Come and Don't Come
        // bets of 5 on every number.
        const come = comePoint(id);
        if (come?.kind === 'come' || come?.kind === 'dontCome') continue;
        const comePoints: Bets = Object.fromEntries(POINT_NUMBERS.flatMap((n) => [[`come${n}`, 5], [`dontCome${n}`, 5]]));
        const line: Bets = { ...(point === null ? {} : { pass: 5, dontPass: 5 }), ...(come ? comePoints : {}) };
        const most = spotLimit(id, point, line);
        for (let stake = stakeStep(id, point); stake <= most; stake += stakeStep(id, point)) {
          if (placeError(id, stake, point, id === 'pass' || id === 'dontPass' ? {} : line, 10_000) !== null) continue;
          const bets: Bets = { ...line, [id]: stake };
          for (const dice of ALL_DICE) {
            checked += 1;
            if (!Number.isInteger(resolveRoll(point, bets, dice).returned)) fractions += 1;
          }
        }
      }
    }
    expect(fractions).toBe(0);
    expect(checked).toBeGreaterThan(10_000);
  });

  it('refuses a stake off the step, and rounds a press up to the step and down to the room left', () => {
    expect(placeError('place6', 5, null, {}, 100)).toBe('step');
    expect(placeError('place6', 6, null, {}, 100)).toBeNull();
    expect(placeError('passOdds', 5, 5, { pass: 5 }, 100)).toBe('step');
    expect(placeError('passOdds', 6, 5, { pass: 5 }, 100)).toBeNull();
    expect(pressAmount('place6', 1, null, {})).toEqual({ amount: 6 });
    expect(pressAmount('place6', 5, null, {})).toEqual({ amount: 6 });
    expect(pressAmount('place6', 10, null, {})).toEqual({ amount: 12 });
    expect(pressAmount('place6', 50, null, {})).toEqual({ amount: 48 });
    expect(pressAmount('place5', 1, null, {})).toEqual({ amount: 5 });
    expect(pressAmount('pass', 1, null, {})).toEqual({ amount: 1 });
    // Behind a Pass of 5 on the 5: 4× is 20, in 2s.
    expect(pressAmount('passOdds', 1, 5, { pass: 5 })).toEqual({ amount: 2 });
    expect(pressAmount('passOdds', 5, 5, { pass: 5 })).toEqual({ amount: 6 });
    expect(pressAmount('passOdds', 50, 5, { pass: 5 })).toEqual({ amount: 20 });
    expect(pressAmount('passOdds', 1, 5, { pass: 5, passOdds: 20 })).toEqual({ error: 'oddsLimit' });
    // The lay against the 5, behind a Don't Pass of 5: 6× is 30, in 3s.
    expect(pressAmount('dontPassOdds', 1, 5, { dontPass: 5 })).toEqual({ amount: 3 });
    expect(pressAmount('dontPassOdds', 50, 5, { dontPass: 5 })).toEqual({ amount: 30 });
    // The rules come first.
    expect(pressAmount('passOdds', 1, null, { pass: 5 })).toEqual({ error: 'needsPoint' });
    expect(pressAmount('pass', 1, 6, {})).toEqual({ error: 'comeOutOnly' });
  });

  it('holds at most 50 medals on a spot, but lets the odds go to 3-4-5× the line bet', async () => {
    expect(SPOT_MAX).toBe(50);
    expect(BET_SIZES[0]).toBe(1);
    expect(spotLimit('place6', null, {})).toBe(48);
    expect(spotLimit('field', null, {})).toBe(50);
    expect(pressAmount('pass', 1, null, { pass: 50 })).toEqual({ error: 'spotLimit' });
    expect(pressAmount('pass', 10, null, { pass: 45 })).toEqual({ amount: 5 });
    expect(maxOdds('passOdds', 6, { pass: 50 })).toBe(250);
    const { page, table } = await opened();
    page.bank.give(1000);
    table.place('pass', 50);
    expect(table.place('pass', 1)).toEqual({ ok: false, error: 'spotLimit' });
    table.roll([3, 3]); // the point is 6
    expect(table.place('passOdds', 250).ok).toBe(true);
    expect(table.place('passOdds', 5)).toEqual({ ok: false, error: 'oddsLimit' });
    // Point made: 50 at 1:1 and 250 at 6:5, all whole.
    const rolled = table.roll([2, 4]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(100 + 550);
  });
});

describe('the table is kept with its bets on it', () => {
  it('finds the same bets, puck and record after a reload, and every medal is where it was', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = crapsOn(first);
    await quiet(browser);
    one.table.place('pass', 5);
    one.table.roll([4, 4]); // the point is 8
    one.table.place('passOdds', 10);
    one.table.place('place6', 12);
    const before = one.table.table();
    const medals = first.bank.balance();
    expect(medals).toBe(WELCOME - 27);
    first.close();
    await quiet(browser);

    const again = browser.open();
    const two = crapsOn(again);
    await quiet(browser);
    expect(two.table.table()).toEqual(before);
    expect(again.bank.balance()).toBe(medals);
    expect(everything(again, two.table)).toBe(WELCOME);
    // The bets play on from there: 4 + 4 again makes the point, and the odds pay 6:5.
    const rolled = two.table.roll([5, 3]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10 + 22);
    expect(again.bank.balance()).toBe(medals + 32);
    expect(two.table.table().bets).toEqual({ place6: 12 });
  });

  it('reads back exactly what it writes', () => {
    const table: Table = {
      ...freshTable(),
      point: 9,
      bets: { pass: 10, passOdds: 40, place6: 18, hard8: 3 },
      placed: [{ id: 'hard8', amount: 3 }],
      lastRound: { pass: 10, field: 5 },
      stats: { rolls: 7, shooter: 2, handRolls: 3, longestHand: 4, pointsMade: 1, sevenOuts: 1, net: -12 },
      history: [
        { dice: [4, 5], event: 'pointSet' },
        { dice: [3, 4], event: 'sevenOut' },
      ],
      last: { point: null, bets: { pass: 10 }, dice: [4, 5] },
    };
    expect(parseTable(serializeTable(table))).toEqual(table);
  });
});

describe('one page plays at a time', () => {
  it('stops taking bets when another tab takes the medals, and plays that tab’s table when it has them back', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = crapsOn(first);
    await quiet(browser);
    one.table.place('pass', 5);

    const second = browser.open();
    const two = crapsOn(second);
    await quiet(browser);
    expect(first.bank.getState().card).toBe('away');
    expect(one.table.place('field', 5)).toEqual({ ok: false, error: 'notHere' });
    expect(one.table.roll([3, 4])).toEqual({ ok: false, error: 'notHere' });
    expect(one.table.takeDown()).toEqual({ ok: false, error: 'notHere' });
    expect(first.bank.balance()).toBe(WELCOME - 5);
    // The other tab plays the same table.
    expect(two.table.table().bets).toEqual({ pass: 5 });
    two.table.roll([2, 2]); // the point is 4
    two.table.place('passOdds', 15);
    expect(second.bank.balance()).toBe(WELCOME - 20);

    // Back to the first: it reads the table the second left, and plays on from it.
    one.seat.play();
    await quiet(browser);
    expect(second.bank.getState().card).toBe('away');
    expect(one.table.table().point).toBe(4);
    expect(one.table.table().bets).toEqual({ pass: 5, passOdds: 15 });
    const rolled = one.table.roll([1, 3]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10 + 45);
    expect(first.bank.balance()).toBe(WELCOME - 20 + 55);
    expect(storedMedals(browser)).toBe(WELCOME + 35);
    expect(two.table.place('pass', 1)).toEqual({ ok: false, error: 'notHere' });
  });
});

describe('a reset at the Medal Game Center', () => {
  it('clears the table, whose bets went with the medals, once', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table } = crapsOn(page);
    await quiet(browser);
    page.bank.give(400);
    table.place('pass', 20);
    table.roll([5, 4]); // the point is 9
    table.place('place6', 30);
    expect(page.bank.balance()).toBe(WELCOME + 400 - 50);

    hub.bank.reset();
    await quiet(browser);
    expect(page.bank.balance()).toBe(WELCOME);
    expect(table.table()).toEqual(freshTable());
    expect(unmarked(storedTable(browser))).toEqual(freshTable());
    expect(page.bank.restartDue(CRAPS_GAME)).toBe(false);
    // Nothing on the table came back into the new medals.
    expect(storedMedals(browser)).toBe(WELCOME);
    // And it is cleared once: the next bets stay.
    table.place('field', 5);
    table.sync();
    expect(table.table().bets).toEqual({ field: 5 });
    expect(page.bank.balance()).toBe(WELCOME - 5);
  });

  it('clears a table kept from before the reset when it is next opened on this device', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = crapsOn(first);
    await quiet(browser);
    one.table.place('pass', 10);
    first.close();
    await quiet(browser);
    // The reset is made with no table open.
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(storedTable(browser)?.bets).toEqual({ pass: 10 });

    const again = browser.open();
    const two = crapsOn(again);
    await quiet(browser);
    expect(two.table.table()).toEqual(freshTable());
    expect(unmarked(storedTable(browser))).toEqual(freshTable());
    expect(again.bank.balance()).toBe(WELCOME);
  });
});

describe('old and unreadable tables', () => {
  it('reads nothing out of what is not a table of this version', () => {
    const fresh = serializeTable(freshTable());
    const wrong = (change: (raw: Record<string, unknown>) => void): string => {
      const raw = JSON.parse(fresh) as Record<string, unknown>;
      change(raw);
      return JSON.stringify(raw);
    };
    for (const text of [
      null,
      undefined,
      42,
      '',
      'not json',
      '[]',
      'null',
      // The chips of a craps table from before the medals, had one ever been kept: a bankroll and nothing else.
      JSON.stringify({ bankroll: 1000, bets: { pass: 5 }, point: null }),
      JSON.stringify({ version: 1, bankroll: 1000 }),
      wrong((raw) => (raw.v = 2)),
      wrong((raw) => (raw.v = 0)),
      wrong((raw) => (raw.point = 7)),
      wrong((raw) => (raw.bets = { pass: -5 })),
      wrong((raw) => (raw.bets = { pass: 2.5 })),
      // Come waits in its box only while a point is on.
      wrong((raw) => (raw.bets = { come: 5 })),
      wrong((raw) => (raw.bets = { dontCome: 5 })),
      // Odds behind a come point that is not there, over the limit, or off the step.
      wrong((raw) => (raw.bets = { comeOdds6: 5 })),
      wrong((raw) => (raw.bets = { come6: 5, comeOdds6: 30 })),
      wrong((raw) => (raw.bets = { come6: 5, comeOdds6: 4 })),
      wrong((raw) => (raw.bets = { dontCome5: 5, dontComeOdds5: 4 })),
      // Place 6 with 5 medals on it would win 5⅚: never a table this game wrote.
      wrong((raw) => (raw.bets = { place6: 5 })),
      // More than a spot holds: this version could never have put them there.
      wrong((raw) => (raw.bets = { pass: 1000 })),
      wrong((raw) => (raw.bets = { field: 51 })),
      wrong((raw) => (raw.bets = { place6: 54 })),
      wrong((raw) => (raw.last = { point: null, bets: { any7: 60 }, dice: [3, 4] })),
      // Odds with no point, and odds over the limit.
      wrong((raw) => (raw.bets = { pass: 5, passOdds: 10 })),
      wrong((raw) => ((raw.point = 6), (raw.bets = { pass: 5, passOdds: 30 }))),
      wrong((raw) => (raw.placed = [{ id: 'field', amount: 5 }])),
      wrong((raw) => (raw.stats = { rolls: 1 })),
      wrong((raw) => (raw.history = [{ dice: [7, 1], event: 'natural' }])),
      wrong((raw) => (raw.last = { point: null, bets: {}, dice: [0, 3] })),
      'x'.repeat(40_000),
    ]) {
      expect(parseTable(text)).toBeNull();
    }
    expect(parseTable(fresh)).toEqual(freshTable());
  });

  it('opens a fresh table over one it cannot read, puts that aside, and moves no medals for it', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(TABLE_KEY, JSON.stringify({ bankroll: 1000, bets: { pass: 25 } }));
    const page = browser.open();
    const { table } = crapsOn(page);
    await quiet(browser);
    expect(table.table()).toEqual(freshTable());
    expect(page.bank.balance()).toBe(WELCOME);
    expect(browser.storage.get(unreadKey(null))).toBe(JSON.stringify({ bankroll: 1000, bets: { pass: 25 } }));
    // The chips are not turned into medals; the table plays on from nothing.
    expect(table.place('pass', 5).ok).toBe(true);
    expect(storedTable(browser)?.bets).toEqual({ pass: 5 });
    expect(page.bank.balance()).toBe(WELCOME - 5);
  });
});

describe('storage that will not keep the table', () => {
  it('makes no bet the table cannot write down, and gives its medals back', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const failing: TableStorage = {
      ...storageOf(page),
      write: (key) => {
        if (key.startsWith(TABLE_KEY)) throw new Error('full');
      },
    };
    const { table } = crapsOn(page, failing);
    await quiet(browser);
    expect(table.place('pass', 5)).toEqual({ ok: false, error: 'notKept' });
    expect(page.bank.balance()).toBe(WELCOME);
    expect(storedMedals(browser)).toBe(WELCOME);
    expect(table.table().bets).toEqual({});
  });

  it('plays on in the page alone where nothing at all can be kept', async () => {
    const browser = new FakeBrowser();
    browser.blocked = true;
    const page = browser.open();
    const { table } = crapsOn(page);
    await quiet(browser);
    expect(page.bank.getState().kept).toBe(false);
    expect(table.place('pass', 5).ok).toBe(true);
    const rolled = table.roll([6, 5]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10);
    expect(page.bank.balance()).toBe(WELCOME + 5);
  });

  /** The medals' own writes fail from now on, while the table's go on working: storage almost full. */
  const medalsFail = (page: FakePage) => {
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === 'medal-center-bank') throw new Error('full');
      write(key, text);
    };
    return () => {
      page.env.write = write;
    };
  };

  it('makes no bet whose medals were not kept as taken: a reload could not find them taken, and the bet would be medals made', async () => {
    const { browser, page, table } = await opened();
    const healed = medalsFail(page);
    expect(table.place('pass', 5)).toEqual({ ok: false, error: 'notKept' });
    expect(page.bank.balance()).toBe(WELCOME);
    expect(storedMedals(browser)).toBe(WELCOME);
    expect(table.table().bets).toEqual({});
    expect(storedTable(browser)?.bets ?? {}).toEqual({});
    healed();
    expect(table.place('pass', 5).ok).toBe(true);
    expect(storedMedals(browser)).toBe(WELCOME - 5);
  });

  it('leaves the table as it was when the medals it gives back are not kept: neither lost nor made twice', async () => {
    const { browser, page, table } = await opened();
    table.place('pass', 5);
    table.place('field', 5);
    const healed = medalsFail(page);
    expect(table.takeDown()).toEqual({ ok: false, error: 'notKept' });
    expect(table.undo()).toEqual({ ok: false, error: 'notKept' });
    // 5 + 6: the Pass and the Field would both win. The roll is not made.
    expect(table.roll([5, 6])).toEqual({ ok: false, error: 'notKept' });
    expect(table.table().bets).toEqual({ pass: 5, field: 5 });
    expect(table.table().stats.rolls).toBe(0);
    expect(storedTable(browser)?.bets).toEqual({ pass: 5, field: 5 });
    expect(page.bank.balance()).toBe(WELCOME - 10);
    expect(storedMedals(browser)).toBe(WELCOME - 10);
    healed();
    expect(table.roll([5, 6]).ok).toBe(true);
    expect(storedMedals(browser)).toBe(WELCOME + 10);
    expect(storedTable(browser)?.bets).toEqual({});
  });

  it('writes nothing over a table it cannot read until that has been put aside', async () => {
    const browser = new FakeBrowser();
    const unreadable = JSON.stringify({ bankroll: 1000, bets: { pass: 25 } });
    browser.storage.set(TABLE_KEY, unreadable);
    const page = browser.open();
    const archiving: TableStorage = {
      ...storageOf(page),
      write: (key, text) => {
        if (key.endsWith('#unread')) throw new Error('full');
        page.env.write(key, text);
      },
    };
    const { table } = crapsOn(page, archiving);
    await quiet(browser);
    expect(table.table()).toEqual(freshTable());
    expect(table.place('pass', 5)).toEqual({ ok: false, error: 'notKept' });
    expect(browser.storage.get(TABLE_KEY)).toBe(unreadable);
    expect(page.bank.balance()).toBe(WELCOME);
    expect(storedMedals(browser)).toBe(WELCOME);
  });
});

describe('whose table it is', () => {
  /** Medals that can be anyone's: a guest's, then an account's. */
  function purses() {
    const medals = new Map<string | null, number>([
      [null, 100],
      ['player-a', 300],
    ]);
    let owner: string | null = null;
    const made = new Set<string>();
    const purse: TablePurse = {
      loaded: () => true,
      balance: () => medals.get(owner) ?? 0,
      owner: () => owner,
      take: (n) => {
        const have = medals.get(owner) ?? 0;
        if (have < n) return false;
        medals.set(owner, have - n);
        return true;
      },
      give: (n) => {
        medals.set(owner, (medals.get(owner) ?? 0) + n);
        return true;
      },
      // Each player's moves made once, under their receipts, as the bank makes them.
      apply: ({ game, round, step, medals: n }) => {
        const receipt = `${owner}/${game}:${round}:${step}`;
        if (made.has(receipt)) return 'already';
        if (n < 0 ? !purse.take(-n) : n > 0 && !purse.give(n)) return null;
        made.add(receipt);
        return 'applied';
      },
      applied: ({ game, round, step }) => made.has(`${owner}/${game}:${round}:${step}`),
      forget: () => true,
      restartDue: () => false,
      restarted: () => undefined,
      kept: () => true,
      mark: () => (owner === null ? 'guest00001:0' : 'account001:0'),
    };
    return { medals, purse, become: (who: string | null) => (owner = who) };
  }
  const mapStorage = (storage: Map<string, string>, unreadable: (key: string) => boolean = () => false): TableStorage => ({
    read: (key) => {
      if (unreadable(key)) throw new Error('blocked');
      return storage.get(key) ?? null;
    },
    write: (key, text) => void storage.set(key, text),
    remove: (key) => void storage.delete(key),
  });

  it('keeps a guest’s table and an account’s apart, each under its own name', () => {
    const storage = new Map<string, string>();
    const { medals, purse, become } = purses();
    const table = createTable(purse, mapStorage(storage), () => true);
    table.sync();
    table.place('pass', 5);
    expect(storage.has(tableKey(null))).toBe(true);
    become('player-a');
    table.sync();
    expect(table.table().bets).toEqual({});
    table.place('dontPass', 20);
    expect(medals.get('player-a')).toBe(280);
    expect(parseTable(storage.get(tableKey('player-a')))?.bets).toEqual({ dontPass: 20 });
    become(null);
    table.sync();
    expect(table.table().bets).toEqual({ pass: 5 });
    expect(medals.get(null)).toBe(95);
  });

  it('lets go of one player’s table as soon as the medals are another’s, even when the other’s cannot be read', () => {
    const storage = new Map<string, string>();
    const { medals, purse, become } = purses();
    const table = createTable(purse, mapStorage(storage, (key) => key === tableKey('player-a')), () => true);
    table.sync();
    table.place('pass', 20);
    table.place('field', 10);
    become('player-a');
    table.sync();
    expect(table.table().bets).toEqual({});
    // Nothing of the guest's bets can be taken down, or won, into the account's medals.
    expect(table.takeDown()).toEqual({ ok: false, error: 'nothing' });
    table.roll([5, 6]);
    expect(medals.get('player-a')).toBe(300);
    expect(medals.get(null)).toBe(70);
  });
});

describe('a browser that dies between two writes', () => {
  // The table and the medals are two writes (medalTable.ts): the browser is killed at every moment of an evening at
  // the table, started again, and the table opened on what it left. Whatever it left, the player's medals in hand and
  // on the table come to what they started with plus what the rolls decided (the table's own net), and the evening
  // plays on from there to the same end.
  const tables = new Map<FakeBrowser, { page: FakePage; table: MedalTable }>();
  const setUp = async () => {
    const at = await opened();
    tables.set(at.browser, at);
    return at.browser;
  };
  /** Medals in hand and on the table, against the start and what the rolls decided. */
  const squared = (page: FakePage, table: MedalTable): number => everything(page, table) - (WELCOME + table.table().stats.net);

  it('loses no medal and makes none, wherever the browser dies between a bet, a roll and the medals', async () => {
    const evening = (table: MedalTable) => {
      table.place('pass', 5);
      table.place('field', 2);
      table.roll([3, 3]); // the point is 6; the field loses
      table.place('passOdds', 10);
      table.place('place8', 6);
      table.undo(); // the 6 on the eight comes back
      table.roll([4, 2]); // the point is made
    };
    const writes = await atEveryWrite(
      setUp,
      (browser) => evening(tables.get(browser)!.table),
      async (after, reached) => {
        const page = after.open();
        const { table } = crapsOn(page);
        await quiet(after);
        table.sync();
        expect(squared(page, table), `died after ${reached} writes`).toBe(0);
        expect(storedMedals(after) + onTable(table.table()), `died after ${reached} writes`).toBe(WELCOME + table.table().stats.net);
        // Opened again, nothing changes; played on, it still adds up, and once a move is made only its receipt is kept.
        table.sync();
        expect(squared(page, table)).toBe(0);
        table.roll([1, 1]);
        expect(table.place('field', 1).ok).toBe(true);
        expect(squared(page, table), `died after ${reached} writes`).toBe(0);
        const ledger = parseLedger(after.storage.get('medal-center-bank') ?? null)!;
        expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${CRAPS_GAME}:${table.table().id}-${table.table().seq}:move`]);
      },
    );
    expect(writes).toBeGreaterThanOrEqual(12);
  });

  it('gives back exactly what a winning roll owes, once, wherever the browser dies in it', async () => {
    await atEveryWrite(
      async () => {
        const browser = await setUp();
        const { table } = tables.get(browser)!;
        table.place('pass', 5);
        table.roll([3, 3]);
        table.place('passOdds', 10);
        return browser;
      },
      (browser) => {
        tables.get(browser)!.table.roll([4, 2]);
      },
      async (after, reached) => {
        const page = after.open();
        const { table } = crapsOn(page);
        await quiet(after);
        table.sync();
        // Either the roll never happened (the bets still up) or it did, and its 32 medals came back once.
        const rolled = table.table().stats.rolls === 2;
        expect(storedMedals(after), `died after ${reached} writes`).toBe(rolled ? WELCOME - 15 + 32 : WELCOME - 15);
        expect(onTable(table.table())).toBe(rolled ? 0 : 15);
      },
    );
  });

  it('takes a table from before receipts at its word: its bets were taken, and it plays on', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = crapsOn(page);
    await quiet(browser);
    // As the table wrote it before receipts: 5 on the pass line, taken from the medals, and no name or moves written down.
    page.bank.take(5);
    browser.storage.set(TABLE_KEY, serializeTable({ ...freshTable(), bets: { pass: 5 }, placed: [{ id: 'pass', amount: 5 }] }));
    table.sync();
    expect(table.table().bets).toEqual({ pass: 5 });
    expect(table.place('field', 2).ok).toBe(true);
    expect(table.roll([3, 4]).ok).toBe(true); // a natural: the pass line wins, the field loses
    expect(storedMedals(browser)).toBe(WELCOME - 5 - 2 + 10);
    expect(squared(page, table)).toBe(0);
  });
});

describe('a guest who signs in', () => {
  const UID = 'test-player-1';

  async function guestWithBets(storage?: (page: FakePage) => TableStorage) {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    const { table } = crapsOn(page, storage?.(page));
    await quiet(browser);
    table.place('pass', 5);
    table.roll([3, 3]); // the point is 6
    table.place('passOdds', 10);
    return { browser, accounts, page, table };
  }

  it('takes the table along when the guest’s medals become a new account’s, and leaves nothing behind for the next guest', async () => {
    const { browser, accounts, page, table } = await guestWithBets();
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 15 });
    table.sync();
    expect(table.table().bets).toEqual({ pass: 5, passOdds: 10 });
    expect(table.table().point).toBe(6);
    expect(storedTable(browser, UID)?.bets).toEqual({ pass: 5, passOdds: 10 });
    expect(browser.storage.has(TABLE_KEY)).toBe(false);
    // The bets play on with the account's medals: 4 + 2 makes the point.
    const rolled = table.roll([4, 2]);
    expect(rolled.ok && rolled.value.resolution.returned).toBe(10 + 22);
    expect(page.bank.balance()).toBe(WELCOME - 15 + 32);
    // Signed out, the next guest has a new member's medals and a table with nothing on it.
    page.bank.attend({ uid: null, settled: true, expected: false }, accounts.store);
    await quiet(browser);
    table.sync();
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(table.table().bets).toEqual({});
    expect(table.takeDown()).toEqual({ ok: false, error: 'nothing' });
  });

  it('plays no table with medals its bets were not taken from: a guest’s copy that could not be removed is not the next guest’s', async () => {
    const { browser, accounts, page, table } = await guestWithBets((p) => ({
      ...storageOf(p),
      remove: (key) => {
        if (key === TABLE_KEY) throw new Error('blocked');
        p.env.remove(key);
      },
    }));
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    table.sync();
    expect(table.table().bets).toEqual({ pass: 5, passOdds: 10 });
    // The guest's copy is still under the guest's name.
    expect(storedTable(browser)?.bets).toEqual({ pass: 5, passOdds: 10 });
    // The account plays them: 4 + 2 makes the point.
    table.roll([4, 2]);
    expect(page.bank.balance()).toBe(WELCOME - 15 + 32);
    // Signed out: the next guest has new medals of their own, and the copy left behind is not played with them.
    page.bank.attend({ uid: null, settled: true, expected: false }, accounts.store);
    await quiet(browser);
    table.sync();
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(table.table().bets).toEqual({});
    expect(table.takeDown()).toEqual({ ok: false, error: 'nothing' });
    expect(page.bank.balance()).toBe(WELCOME);
    // It is put aside, not lost, and the guest's place holds the next guest's table.
    expect(parseTable(browser.storage.get(unreadKey(null)))?.bets).toEqual({ pass: 5, passOdds: 10 });
    table.place('field', 5);
    expect(storedTable(browser)?.bets).toEqual({ field: 5 });
  });

  it('leaves the guest’s table with the guest’s medals when the account has medals of its own', async () => {
    const { browser, accounts, page, table } = await guestWithBets();
    accounts.put(UID, serializeLedger(give(createLedger('laptop0001'), 400)), 'm-elsewhere');
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME + 400 });
    table.sync();
    expect(table.table().bets).toEqual({});
    expect(storedTable(browser)?.bets).toEqual({ pass: 5, passOdds: 10 });
    // Back as the guest, the guest's bets and medals are where they were.
    page.bank.attend({ uid: null, settled: true, expected: false }, accounts.store);
    await quiet(browser);
    table.sync();
    expect(page.bank.getState().balance).toBe(WELCOME - 15);
    expect(table.table().bets).toEqual({ pass: 5, passOdds: 10 });
  });
});
