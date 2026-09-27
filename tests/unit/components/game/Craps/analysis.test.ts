import { describe, expect, it } from 'vitest';

import {
  ODDS_OPTIONS,
  allBetOdds,
  combinedDontPassEdge,
  combinedPassEdge,
  expectedShooterRolls,
  frac,
  passLineBreakdown,
  rollsPerLineDecision,
  shooterSurvival,
  toNumber,
} from '@/components/game/Craps/analysis';

const odds = new Map(allBetOdds().map((o) => [o.id, o]));
const edge = (id: string) => odds.get(id as never)!.houseEdge;

describe('fractions', () => {
  it('normalize sign and common factors', () => {
    expect(frac(6, -8)).toEqual({ n: -3, d: 4 });
    expect(frac(0, 5)).toEqual({ n: 0, d: 1 });
    expect(() => frac(1, 0)).toThrow(RangeError);
  });
});

describe('published house edges (exact)', () => {
  it.each([
    ['pass', 7, 495],
    ['dontPass', 3, 220],
    ['passOdds', 0, 1],
    ['dontPassOdds', 0, 1],
    ['place6', 1, 66],
    ['place8', 1, 66],
    ['place5', 1, 25],
    ['place9', 1, 25],
    ['place4', 1, 15],
    ['place10', 1, 15],
    ['field', 1, 36],
    ['any7', 1, 6],
    ['anyCraps', 1, 9],
    ['yo', 1, 9],
    ['aces', 5, 36],
    ['twelve', 5, 36],
    ['hard6', 1, 11],
    ['hard8', 1, 11],
    ['hard4', 1, 9],
    ['hard10', 1, 9],
  ])('%s = %i/%i', (id, n, d) => {
    expect(edge(id)).toEqual({ n, d });
  });

  it('Pass wins 244/495 and every outcome is accounted for', () => {
    const line = passLineBreakdown();
    expect(line.win).toEqual({ n: 244, d: 495 });
    expect(toNumber(line.natural) + toNumber(line.craps) + line.points.reduce((s, p) => s + toNumber(p.established), 0)).toBeCloseTo(1, 12);
    const dp = odds.get('dontPass')!;
    expect(toNumber(dp.win) + toNumber(dp.lose) + toNumber(dp.push)).toBeCloseTo(1, 12);
    expect(dp.push).toEqual({ n: 1, d: 36 });
  });

  it('Pass / Don\'t Pass take 557/165 rolls per decision', () => {
    expect(rollsPerLineDecision()).toEqual({ n: 557, d: 165 });
  });
});

describe('taking odds', () => {
  it('reproduces the classic combined edges', () => {
    const byId = new Map(ODDS_OPTIONS.map((o) => [o.id, combinedPassEdge(o.multiple)]));
    expect(byId.get('0x')).toEqual({ n: 7, d: 495 });
    expect(byId.get('1x')).toEqual({ n: 7, d: 825 }); // 0.848%
    expect(byId.get('2x')).toEqual({ n: 1, d: 165 }); // 0.606%
    expect(byId.get('3-4-5x')).toEqual({ n: 7, d: 1870 }); // 0.374%
    expect(toNumber(byId.get('10x')!)).toBeCloseTo(0.00184, 5);
    expect(combinedDontPassEdge()).toEqual({ n: 3, d: 1100 }); // 0.273%
  });

  it('only ever lowers the edge as odds grow', () => {
    const edges = ODDS_OPTIONS.map((o) => toNumber(combinedPassEdge(o.multiple)));
    for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeLessThan(edges[i - 1]);
  });
});

describe('the shooter', () => {
  it('lasts 1671/196 ≈ 8.53 rolls on average', () => {
    expect(expectedShooterRolls()).toEqual({ n: 1671, d: 196 });
    // Mean = Σ P(hand lasts > n rolls) — cross-check with the survival curve.
    const survival = shooterSurvival(6000);
    expect(survival.reduce((a, b) => a + b, 0)).toBeCloseTo(1671 / 196, 8);
  });

  it('puts a 154-roll hand at about 1 in 5.59 billion (Ethier & Hoppe)', () => {
    const survival = shooterSurvival(153);
    expect(survival[0]).toBe(1);
    for (let i = 1; i < survival.length; i++) expect(survival[i]).toBeLessThanOrEqual(survival[i - 1]);
    // A hand lasting at least 154 rolls = no seven-out in the first 153.
    expect(1 / survival[153]).toBeGreaterThan(5.59e9);
    expect(1 / survival[153]).toBeLessThan(5.591e9);
  });
});
