import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type Seat } from '@/components/game/MedalCenter/bank';
import { resolveRoll, type Bets, type Dice, type PointNumber } from '@/components/game/Craps/engine';
import { getStrings } from '@/components/game/Craps/i18n';
import { CRAPS_GAME, createTable, purseOf, type MedalTable, type TableStorage } from '@/components/game/Craps/medalTable';
import { DICE_WAYS, rollNet, rollOutlook } from '@/components/game/Craps/outlook';
import { RollOutlook } from '@/components/game/Craps/RollOutlook';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';

const ALL_DICE: Dice[] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ALL_DICE.push([a, b]);

const row = (point: PointNumber | null, bets: Bets, total: number, hard: boolean | null = null) =>
  rollOutlook(point, bets).rows.find((r) => r.total === total && r.hard === hard);

describe('the outlook of the next roll', () => {
  it('has one row for each total, whose ways add up to the 36, when no bet tells a pair from the rest', () => {
    const outlook = rollOutlook(null, { pass: 10 });
    expect(outlook.rows.map((r) => r.total)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(outlook.rows.every((r) => r.hard === null)).toBe(true);
    expect(outlook.rows.map((r) => r.ways)).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
    // Pass on the come-out: 7 and 11 win (8 ways), 2, 3 and 12 lose (4 ways), and a point decides nothing.
    expect(outlook.rows.map((r) => r.net)).toEqual([-10, -10, 0, 0, 0, 10, 0, 0, 0, 10, -10]);
    expect(outlook).toMatchObject({ ahead: 8, behind: 4, level: 24 });
    expect(outlook.average).toBeCloseTo((8 * 10 - 4 * 10) / 36, 12);
  });

  it('tells a pair from the other ways of a total only where a hardway bet makes them differ', () => {
    const bets: Bets = { hard8: 2, hard4: 1 };
    const outlook = rollOutlook(6, bets);
    expect(row(6, bets, 8, true)).toMatchObject({ ways: 1, net: 18 });
    expect(row(6, bets, 8, false)).toMatchObject({ ways: 4, net: -2 });
    expect(row(6, bets, 4, true)).toMatchObject({ ways: 1, net: 7 });
    expect(row(6, bets, 4, false)).toMatchObject({ ways: 2, net: -1 });
    // A 7 takes both; a 6 or a 10, pair or not, touches neither.
    expect(row(6, bets, 7)).toMatchObject({ ways: 6, net: -3 });
    expect(row(6, bets, 6)).toMatchObject({ ways: 5, net: 0 });
    expect(row(6, bets, 10)).toMatchObject({ ways: 3, net: 0 });
    expect(outlook.rows).toHaveLength(13);
    expect(outlook.rows.reduce((sum, r) => sum + r.ways, 0)).toBe(DICE_WAYS);
    // The other ways are listed before the pair.
    expect(outlook.rows.filter((r) => r.total === 8).map((r) => r.hard)).toEqual([false, true]);
  });

  it('counts the bets that are off on the come-out, and a Come bet that only moves, as nothing', () => {
    // Place bets and hardways are off on the come-out: only the Pass Line is decided.
    expect(rollOutlook(null, { pass: 5, place6: 6, hard8: 1 }).rows.map((r) => r.net)).toEqual([-5, -5, 0, 0, 0, 5, 0, 0, 0, 5, -5]);
    // A Come bet wins on 7 or 11, loses on 2, 3 or 12, and moves on anything else.
    expect(rollOutlook(8, { come: 5 }).rows.map((r) => r.net)).toEqual([-5, -5, 0, 0, 0, 5, 0, 0, 0, 5, -5]);
  });

  it('nets the bets that win against the ones that lose on the same roll', () => {
    const bets: Bets = { pass: 10, passOdds: 20, place8: 12, field: 5 };
    // The point is 6. A 6: the Pass wins 10 and its odds 24, and the field loses 5.
    expect(row(6, bets, 6)).toMatchObject({ net: 10 + 24 - 5 });
    // An 8: the place bet wins 14, and the field loses 5. A 7 takes everything.
    expect(row(6, bets, 8)).toMatchObject({ net: 14 - 5 });
    expect(row(6, bets, 7)).toMatchObject({ net: -(10 + 20 + 12 + 5) });
    // A 12 pays the field three to one and decides nothing else.
    expect(row(6, bets, 12)).toMatchObject({ net: 15 });
  });

  it('agrees with the engine on every one of the 36 ways', () => {
    const cases: [PointNumber | null, Bets][] = [
      [null, { pass: 10, dontPass: 5, field: 3, yo: 1, come6: 5, comeOdds6: 10 }],
      [5, { pass: 10, passOdds: 20, come: 5, dontCome: 5, place6: 6, place9: 5, hard6: 2, hard10: 1, any7: 1, anyCraps: 1, aces: 1, twelve: 1 }],
      [10, { dontPass: 10, dontPassOdds: 20, dontCome4: 6, dontComeOdds4: 12, come8: 5, comeOdds8: 5, field: 2 }],
    ];
    for (const [point, bets] of cases) {
      const outlook = rollOutlook(point, bets);
      let ahead = 0;
      let behind = 0;
      let sum = 0;
      for (const dice of ALL_DICE) {
        const net = rollNet(resolveRoll(point, bets, dice));
        const pair = dice[0] === dice[1];
        const at = outlook.rows.filter((r) => r.total === dice[0] + dice[1] && (r.hard === null || r.hard === pair));
        expect(at.map((r) => r.net)).toEqual([net]);
        sum += net;
        if (net > 0) ahead += 1;
        if (net < 0) behind += 1;
      }
      expect(outlook.rows.reduce((n, r) => n + r.ways, 0)).toBe(DICE_WAYS);
      expect(outlook).toMatchObject({ ahead, behind, level: DICE_WAYS - ahead - behind });
      expect(outlook.average).toBeCloseTo(sum / DICE_WAYS, 12);
    }
  });

  it('is by how much the table’s own net moves when the roll is played', async () => {
    const storageOf = (page: FakePage): TableStorage => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text), remove: (key) => page.env.remove(key) });
    const browser = new FakeBrowser();
    const page = browser.open();
    const held: { seat: Seat | null } = { seat: null };
    const table: MedalTable = createTable(purseOf(page.bank), storageOf(page), () => held.seat?.holding() ?? false);
    held.seat = page.bank.sit(CRAPS_GAME, { granted: () => table.sync(), yielding: () => undefined });
    await quiet(browser);

    expect(table.place('pass', 5).ok).toBe(true);
    expect(table.place('field', 2).ok).toBe(true);
    for (const dice of [[2, 4], [4, 4], [6, 6], [3, 3], [3, 4]] as Dice[]) {
      if (table.table().point !== null && !table.table().bets.hard8) expect(table.place('hard8', 1).ok).toBe(true);
      const { point, bets, stats } = table.table();
      const pair = dice[0] === dice[1];
      const expected = rollOutlook(point, bets).rows.find((r) => r.total === dice[0] + dice[1] && (r.hard === null || r.hard === pair));
      expect(table.roll(dice).ok).toBe(true);
      expect(table.table().stats.net - stats.net).toBe(expected?.net);
    }
  });
});

describe('RollOutlook', () => {
  const render = (point: PointNumber | null, bets: Bets, lang: 'en' | 'ja' = 'en') =>
    renderToStaticMarkup(<RollOutlook point={point} bets={bets} t={getStrings(lang)} locale={lang === 'ja' ? 'ja-JP' : 'en-US'} />);

  it('asks for a bet while the table is empty', () => {
    const markup = render(null, {});
    expect(markup).toContain('data-testid="craps-outlook-empty"');
    expect(markup).not.toContain('data-roll=');
    expect(render(null, {}, 'ja')).toContain('次の一投');
  });

  it('shows each total with its ways and its medals, and the chances over the 36 ways', () => {
    const markup = render(null, { pass: 10 });
    expect([...markup.matchAll(/data-sign="(\w+)" data-roll="(\w+)"/g)].map((m) => `${m[2]}:${m[1]}`)).toEqual([
      '2:neg',
      '3:neg',
      '4:zero',
      '5:zero',
      '6:zero',
      '7:pos',
      '8:zero',
      '9:zero',
      '10:zero',
      '11:pos',
      '12:neg',
    ]);
    expect(markup).toContain('7, 6 of 36 ways: +10 medals');
    expect(markup).toContain('4, 3 of 36 ways: ±0 medals');
    expect(markup).toContain('data-testid="craps-outlook-ahead">8/36 (22.2%)<');
    expect(markup).toContain('data-testid="craps-outlook-behind">4/36 (11.1%)<');
    expect(markup).toContain('data-testid="craps-outlook-level">24/36 (66.7%)<');
    expect(markup).toMatch(/data-testid="craps-outlook-average">\+1\.11</);
  });

  it('names a pair apart from the other ways, in both languages, and says one medal as one', () => {
    const en = render(6, { hard8: 1 });
    expect(en).toContain('data-roll="8e"');
    expect(en).toContain('data-roll="8h"');
    expect(en).toContain('Hard 8, 1 of 36 ways: +9 medals');
    expect(en).toContain('Easy 8, 4 of 36 ways: −1 medal<');
    const ja = render(6, { hard8: 1 }, 'ja');
    expect(ja).toContain('ハード 8、36 通り中 1 通り: +9 枚');
    expect(ja).toContain('イージー 8、36 通り中 4 通り: −1 枚');
  });
});
