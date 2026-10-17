import { describe, expect, it } from 'vitest';

import { type Seat } from '@/components/game/MedalCenter/bank';
import { recordsOf } from '@/components/game/MedalCenter/history';
import { CRAPS_GAME, createTable, purseOf, type MedalTable, type TableStorage } from '@/components/game/Craps/medalTable';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';

// What the craps table tells the medals' history (MedalCenter/history.ts): each roll that decides a bet is one round,
// what it took off the table and what it gave back; the chips going onto the table and back are not rounds. Played
// against the real medal bank in a fake browser. Nothing is fetched and no account is named.

const storageOf = (page: FakePage): TableStorage => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text), remove: (key) => page.env.remove(key) });

async function opened() {
  const browser = new FakeBrowser();
  const page = browser.open();
  const held: { seat: Seat | null } = { seat: null };
  const table: MedalTable = createTable(purseOf(page.bank), storageOf(page), () => held.seat?.holding() ?? false);
  held.seat = page.bank.sit(CRAPS_GAME, { granted: () => table.sync(), yielding: () => undefined });
  page.bank.watchHistory(() => undefined);
  await quiet(browser);
  return { browser, page, table };
}

const crapsRecord = (page: FakePage) => recordsOf(page.bank.historyState().history!).find((row) => row.game === CRAPS_GAME);
const rolls = (page: FakePage) => page.bank.historyState().history!.entries.filter((entry) => entry.g === CRAPS_GAME);

describe('the craps table in the medals’ history', () => {
  it('counts a roll that decides bets as one round, and not the chips, an undo or a roll that decides nothing', async () => {
    const { browser, page, table } = await opened();
    table.place('pass', 5);
    table.place('field', 2);
    expect(table.undo().ok).toBe(true);
    expect(rolls(page)).toEqual([]);
    // 3 + 4 on the come-out: the Pass Line wins, and its 5 come back with 5 more.
    table.roll([3, 4]);
    browser.clock += 1000;
    // Nothing on the table: nothing decided.
    table.roll([3, 4]);
    expect(rolls(page)).toEqual([expect.objectContaining({ k: 'round', bet: 5, won: 10, done: 1 })]);
    expect(crapsRecord(page)).toMatchObject({ rounds: 1, bet: 5, won: 10, top: 10, best: 1 });
  });

  it('counts a bet that wins and stays up by its win alone, and the bets a roll loses by their stakes', async () => {
    const { browser, page, table } = await opened();
    table.place('pass', 5);
    table.roll([2, 4]); // the point is 6: nothing decided
    expect(rolls(page)).toEqual([]);
    table.place('place8', 6);
    table.place('field', 5);
    browser.clock += 1000;
    // 4 + 4: the place 8 wins 7 for 6 and stays up; the field loses its 5.
    table.roll([4, 4]);
    browser.clock += 1000;
    // Seven out: the Pass and the place 8 go.
    table.roll([3, 4]);
    expect(rolls(page).map((entry) => [entry.bet, entry.won])).toEqual([
      [11, 0],
      [5, 7],
    ]);
    expect(crapsRecord(page)).toMatchObject({ rounds: 2, bet: 16, won: 7, best: 1 });
    // What the table says it netted is what the history says came back less what was taken.
    expect(table.table().stats.net).toBe(7 - 16);
  });
});
