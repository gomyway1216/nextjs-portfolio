import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  JACKPOT_CHANCE,
  JACKPOT_START,
  REACH_RATE,
  ROULETTE,
  SPIN_PAYS,
  SPIN_TABLE,
  SPIN_TOTAL,
  TIERS,
  TIER_DIGITS,
  TOWERS_FROM,
  drawPocket,
  drawSpin,
  pocketPays,
  rouletteValue,
  spinValue,
  tierChance,
  tierFor,
} from '@/components/game/MedalPusher/lottery';

describe('the slot', () => {
  it('has a table that adds up', () => {
    expect(TIERS.reduce((sum, tier) => sum + SPIN_TABLE[tier], 0)).toBe(SPIN_TOTAL);
    expect(TIERS.reduce((sum, tier) => sum + tierChance(tier), 0)).toBeCloseTo(1, 12);
    expect(tierChance('seven')).toBeCloseTo(0.006, 12);
    expect(tierChance('big')).toBeCloseTo(0.015, 12);
    expect(tierChance('small')).toBeCloseTo(0.04, 12);
    expect(tierChance('miss')).toBeCloseTo(0.939, 12);
  });

  it('turns a roll into a tier at the right boundaries', () => {
    expect(tierFor(0)).toBe('seven');
    expect(tierFor(0.0059)).toBe('seven');
    expect(tierFor(0.006)).toBe('big');
    expect(tierFor(0.0209)).toBe('big');
    expect(tierFor(0.021)).toBe('small');
    expect(tierFor(0.0609)).toBe('small');
    expect(tierFor(0.061)).toBe('miss');
    expect(tierFor(0.999999)).toBe('miss');
  });

  it('shows digits that agree with the tier it drew', () => {
    const rng = seededRng(99);
    for (let i = 0; i < 20_000; i++) {
      const { tier, digits, reach } = drawSpin(rng);
      const [left, centre, right] = digits;
      expect(digits.every((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9)).toBe(true);
      if (tier === 'miss') {
        // A losing spin never lines three up, and a reach is exactly two outer reels alike.
        expect(left === centre && centre === right).toBe(false);
        expect(reach).toBe(left === right);
        if (reach) expect(Math.abs(centre - left) === 1 || Math.abs(centre - left) === 8).toBe(true);
      } else {
        expect(left === centre && centre === right).toBe(true);
        expect(TIER_DIGITS[tier]).toContain(left);
        expect(reach).toBe(true);
      }
    }
  });

  it('draws each tier as often as its table says', () => {
    const rng = seededRng(2025);
    const draws = 400_000;
    const seen = { miss: 0, small: 0, big: 0, seven: 0 };
    let reaches = 0;
    for (let i = 0; i < draws; i++) {
      const spin = drawSpin(rng);
      seen[spin.tier]++;
      if (spin.tier === 'miss' && spin.reach) reaches++;
    }
    for (const tier of TIERS) {
      const p = tierChance(tier);
      // Within five standard errors of the exact chance.
      expect(Math.abs(seen[tier] / draws - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / draws));
    }
    expect(Math.abs(reaches / seen.miss - REACH_RATE)).toBeLessThan(0.004);
  });
});

describe('the roulette a ball starts', () => {
  it('has twelve pockets, one of them the jackpot', () => {
    expect(ROULETTE).toHaveLength(12);
    expect(ROULETTE.filter((pocket) => pocket === 'jackpot')).toHaveLength(1);
    expect(ROULETTE.filter((pocket) => pocket === 30)).toHaveLength(4);
    expect(ROULETTE.filter((pocket) => pocket === 50)).toHaveLength(4);
    expect(ROULETTE.filter((pocket) => pocket === 100)).toHaveLength(3);
    expect(pocketPays('jackpot', 412)).toBe(412);
    expect(pocketPays(50, 412)).toBe(50);
    // Thirty medals are thrown on loose; fifty and up are stacked as towers.
    expect(TOWERS_FROM).toBe(50);
  });

  it('draws every pocket equally often', () => {
    const rng = seededRng(8);
    const draws = 240_000;
    const seen = ROULETTE.map(() => 0);
    for (let i = 0; i < draws; i++) seen[drawPocket(rng)]++;
    for (const count of seen) expect(Math.abs(count / draws - 1 / 12)).toBeLessThan(0.003);
    expect(drawPocket(() => 0)).toBe(0);
    expect(drawPocket(() => 0.9999999)).toBe(11);
  });

  it('is worth what its pockets add up to', () => {
    expect(rouletteValue(300)).toBeCloseTo((300 + 4 * 30 + 4 * 50 + 3 * 100) / 12, 12);
    expect(rouletteValue(300)).toBeCloseTo(76.6667, 4);
    expect(rouletteValue(1000) - rouletteValue(300)).toBeCloseTo(700 / 12, 12);
    expect(JACKPOT_CHANCE).toBeCloseTo(1 / 2000, 12);
  });

  it('makes a spin worth a little over one medal', () => {
    const expected = 0.04 * SPIN_PAYS.small + 0.015 * SPIN_PAYS.big + 0.006 * rouletteValue(JACKPOT_START);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(expected, 12);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(1.08, 12);
    expect(spinValue(900)).toBeCloseTo(1.38, 12);
    expect(SPIN_PAYS).toEqual({ miss: 0, small: 8, big: 20 });
  });
});
