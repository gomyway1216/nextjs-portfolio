import { describe, expect, it } from 'vitest';

import {
  BET_IDS,
  MOST_BACK_PER_MEDAL,
  PAYTABLE,
  ROLLS,
  analyze,
  backOf,
  betInfo,
  checkRolls,
  diceFrom,
  drawDice,
  everyRoll,
  isBetId,
  kindOf,
  labelOf,
  resolveRoll,
  seeded,
  totalOf,
  valueOf,
  winningAreas,
  type BetId,
  type Dice,
} from '@/components/game/SicBo/engine';

// Moonlit Sic Bo's rules and odds, added up again over the 216 ways three dice can fall, and set against the paytable
// it takes from: the Wizard of Odds' Atlantic City table (https://wizardofodds.com/games/sic-bo/), each bet's house
// edge as that page lists it.

const ROLL_LIST: Dice[] = [...everyRoll()];

describe('the layout', () => {
  it('has the 50 areas of a Sic Bo table, each once', () => {
    expect(BET_IDS).toHaveLength(50);
    expect(new Set(BET_IDS).size).toBe(50);
    const kinds = BET_IDS.map((id) => betInfo(id).kind);
    const count = (kind: string) => kinds.filter((k) => k === kind).length;
    expect([count('small'), count('big'), count('any-triple'), count('triple'), count('double'), count('total'), count('pair'), count('single')]).toEqual([1, 1, 1, 6, 6, 14, 15, 6]);
    expect(isBetId('total-3')).toBe(false);
    expect(isBetId('total-18')).toBe(false);
    expect(isBetId('pair-2-2')).toBe(false);
    expect(isBetId('pair-5-6')).toBe(true);
  });

  it('pays the Atlantic City table, figure for figure', () => {
    expect(PAYTABLE.name).toBe('Atlantic City');
    expect(PAYTABLE.total).toEqual({ 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 });
    expect([PAYTABLE.smallBig, PAYTABLE.triple, PAYTABLE.anyTriple, PAYTABLE.double, PAYTABLE.pair]).toEqual([1, 180, 30, 10, 5]);
    expect(PAYTABLE.single).toEqual([1, 2, 3]);
  });

  it('settles a roll: Small and Big lose on a triple, a single number pays for each die that shows it', () => {
    expect(backOf('small', [1, 2, 3])).toBe(2);
    expect(backOf('small', [2, 2, 2])).toBe(0);
    expect(backOf('big', [6, 6, 6])).toBe(0);
    expect(backOf('big', [5, 6, 6])).toBe(2);
    expect(backOf('triple-2', [2, 2, 2])).toBe(181);
    expect(backOf('any-triple', [5, 5, 5])).toBe(31);
    expect(backOf('double-4', [4, 4, 4])).toBe(11);
    expect(backOf('double-4', [4, 1, 4])).toBe(11);
    expect(backOf('total-4', [1, 1, 2])).toBe(61);
    expect(backOf('pair-1-6', [6, 3, 1])).toBe(6);
    expect(backOf('pair-1-6', [6, 6, 3])).toBe(0);
    expect(backOf('single-3', [3, 1, 2])).toBe(2);
    expect(backOf('single-3', [3, 3, 2])).toBe(3);
    expect(backOf('single-3', [3, 3, 3])).toBe(4);
    expect(winningAreas([2, 4, 4])).toEqual(['small', 'double-4', 'total-10', 'pair-2-4', 'single-2', 'single-4']);
    const res = resolveRoll({ small: 1, 'total-10': 1, 'pair-2-5': 1, 'single-4': 1 }, [2, 4, 4]);
    expect(res.returned).toBe(2 + 7 + 0 + 3);
    expect(res.decided).toBe(4);
    expect(res.results.map((r) => [r.id, r.back])).toEqual([
      ['small', 2],
      ['total-10', 7],
      ['pair-2-5', 0],
      ['single-4', 3],
    ]);
  });

  it('names a triple bet that won, or else any triple', () => {
    expect(labelOf(resolveRoll({ 'triple-3': 1, small: 5 }, [3, 3, 3]))).toBe('sicbo-triple');
    expect(labelOf(resolveRoll({ 'any-triple': 1 }, [3, 3, 3]))).toBe('sicbo-any-triple');
    expect(labelOf(resolveRoll({ 'triple-4': 1, 'any-triple': 1 }, [3, 3, 3]))).toBe('sicbo-any-triple');
    expect(labelOf(resolveRoll({ big: 1 }, [3, 5, 6]))).toBeNull();
  });
});

describe('the draw', () => {
  it('takes three numbers, one for each die in order, and turns each sixth of [0, 1) into a face', () => {
    const numbers = [0.99, 0.0, 0.5, 0.42];
    let used = 0;
    expect(drawDice(() => numbers[used++])).toEqual([6, 1, 4]);
    expect(used).toBe(3);
    expect(diceFrom(0, 1 / 6, 0.999999)).toEqual([1, 2, 6]);
    expect(diceFrom(5 / 6 - 1e-12, 1, -0.1)).toEqual([5, 6, 1]);
  });

  it('reaches each of the 216 rolls by exactly one sixth of each number', () => {
    expect(ROLL_LIST).toHaveLength(ROLLS);
    expect(new Set(ROLL_LIST.map((dice) => dice.join(''))).size).toBe(216);
  });
});

describe('the exact odds', () => {
  const odds = analyze();
  const of = (id: BetId) => odds.areas.find((area) => area.id === id)!;
  /** The house edge as the Wizard of Odds lists it for Atlantic City, in percent to two places. */
  const WOO_EDGE: [BetId, number][] = [
    ['small', 2.78],
    ['big', 2.78],
    ['total-4', 15.28],
    ['total-5', 13.89],
    ['total-6', 16.67],
    ['total-7', 9.72],
    ['total-8', 12.5],
    ['total-9', 18.98],
    ['total-10', 12.5],
    ['triple-1', 16.2],
    ['any-triple', 13.89],
    ['double-1', 18.52],
    ['pair-1-2', 16.67],
    ['single-1', 7.87],
  ];

  it('are the published house edges, every one', () => {
    for (const [id, edge] of WOO_EDGE) expect(Math.round(valueOf(of(id).edge) * 10_000) / 100, id).toBe(edge);
  });

  it('are exact fractions over the 216 rolls, the same for areas alike, and none brings back as much as it takes', () => {
    const back = (id: BetId) => `${of(id).back.num}/${of(id).back.den}`;
    expect(back('small')).toBe('35/36');
    expect(back('big')).toBe('35/36');
    expect(back('total-4')).toBe('61/72');
    expect(back('total-17')).toBe('61/72');
    expect(back('total-5')).toBe('31/36');
    expect(back('total-6')).toBe('5/6');
    expect(back('total-7')).toBe('65/72');
    expect(back('total-8')).toBe('7/8');
    expect(back('total-9')).toBe('175/216');
    expect(back('total-10')).toBe('7/8');
    expect(back('total-11')).toBe('7/8');
    expect(back('triple-6')).toBe('181/216');
    expect(back('any-triple')).toBe('31/36');
    expect(back('double-6')).toBe('22/27');
    expect(back('pair-5-6')).toBe('5/6');
    expect(back('single-6')).toBe('199/216');
    expect(of('single-2').matches).toEqual([75, 15, 1]);
    expect(of('small').wins).toBe(105);
    expect(of('double-3').wins).toBe(16);
    expect(of('pair-1-2').wins).toBe(30);
    for (const area of odds.areas) expect(valueOf(area.back), area.id).toBeLessThan(1);
    expect(odds.best).toEqual({ num: 35, den: 36 });
    expect(odds.least).toEqual({ num: 175, den: 216 });
  });

  it('agree with the rolls added up one by one, by the same function the machine settles with', () => {
    for (const id of BET_IDS) {
      const total = ROLL_LIST.reduce((sum, dice) => sum + resolveRoll({ [id]: 1 }, dice).returned, 0);
      expect(total / ROLLS, id).toBeCloseTo(valueOf(of(id).back), 12);
    }
  });

  it('pays at most 245 a medal on one roll, with every area covered: a triple 2 or 5', () => {
    expect(MOST_BACK_PER_MEDAL).toBe(245);
    const all = Object.fromEntries(BET_IDS.map((id) => [id, 1]));
    const tops = ROLL_LIST.filter((dice) => resolveRoll(all, dice).returned === 245).map((dice) => dice.join(''));
    expect(tops).toEqual(['222', '555']);
  });

  it('agree with a seeded check of 100,000 rolls, within a few spreads', () => {
    const result = checkRolls(100_000, seeded(7));
    expect(result.triples / result.rolls).toBeCloseTo(1 / 36, 2);
    expect(result.back.small!).toBeGreaterThan(0.95);
    expect(result.back.small!).toBeLessThan(1);
    expect(kindOf([1, 1, 1])).toBe('triple');
    expect(kindOf([1, 4, 5])).toBe('small');
    expect(kindOf([1, 4, 6])).toBe('big');
    expect(totalOf([6, 6, 5])).toBe(17);
  });
});
