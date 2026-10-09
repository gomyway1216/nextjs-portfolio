import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  BOARD,
  BOARD_VALUE,
  CHESTS,
  CHEST_TOWERS_FROM,
  CHEST_VALUE,
  DIE_FACES,
  FEVER_SQUARE,
  JACKPOT_CHANCE,
  JACKPOT_START,
  REACH_RATE,
  ROULETTE,
  SPIN_TABLE,
  SPIN_TOTAL,
  TIERS,
  TIER_BONUS,
  TIER_DIGITS,
  TOWERS_FROM,
  boardAfter,
  drawDie,
  drawPocket,
  drawSpin,
  pocketPays,
  rouletteValue,
  shuffleChests,
  spinValue,
  squareAfter,
  tierChance,
  tierFor,
  tierValue,
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
    expect(TIER_BONUS).toEqual({ small: 'sugoroku', big: 'chest', seven: 'ball' });
    expect(tierValue('miss', JACKPOT_START)).toBe(0);
    expect(tierValue('small', JACKPOT_START)).toBe(BOARD_VALUE);
    expect(tierValue('big', JACKPOT_START)).toBe(CHEST_VALUE);
    expect(tierValue('seven', 900)).toBeCloseTo(rouletteValue(900), 12);
    const expected = 0.04 * BOARD_VALUE + 0.015 * CHEST_VALUE + 0.006 * rouletteValue(JACKPOT_START);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(expected, 12);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(1.11, 12);
    expect(spinValue(900)).toBeCloseTo(1.41, 12);
  });
});

describe('the sugoroku board', () => {
  it('is a loop of twelve squares with one fever on it', () => {
    expect(BOARD).toHaveLength(12);
    expect(BOARD[FEVER_SQUARE]).toBe(30);
    expect(Math.max(...BOARD)).toBe(BOARD[FEVER_SQUARE]);
    expect(BOARD.filter((medals) => medals === 30)).toHaveLength(1);
    expect(BOARD.every((medals) => Number.isInteger(medals) && medals > 0)).toBe(true);
    expect(BOARD_VALUE).toBeCloseTo(105 / 12, 12);
    expect(squareAfter(0, 3)).toBe(3);
    expect(squareAfter(9, 6)).toBe(3);
    expect(squareAfter(11, 1)).toBe(0);
  });

  it('rolls every face of the die equally often', () => {
    const rng = seededRng(64);
    const rolls = 120_000;
    const seen = Array.from({ length: DIE_FACES + 1 }, () => 0);
    for (let i = 0; i < rolls; i++) seen[drawDie(rng)]++;
    expect(seen[0]).toBe(0);
    for (let face = 1; face <= DIE_FACES; face++) expect(Math.abs(seen[face] / rolls - 1 / DIE_FACES)).toBeLessThan(0.005);
    expect(drawDie(() => 0)).toBe(1);
    expect(drawDie(() => 0.9999999)).toBe(6);
  });

  it('comes to stand on every square equally often, whatever square it started from', () => {
    expect(boardAfter(0)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const one = boardAfter(1);
    expect(one.slice(1, 7).every((chance) => Math.abs(chance - 1 / 6) < 1e-12)).toBe(true);
    expect(one[0] + one.slice(7).reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(0, 12);
    for (const rolls of [1, 2, 6, 40]) expect(boardAfter(rolls).reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1, 12);
    const even = 1 / BOARD.length;
    const spread = (rolls: number, from = 0) => Math.max(...boardAfter(rolls, from).map((chance) => Math.abs(chance - even)));
    expect(spread(6)).toBeLessThan(0.013);
    expect(spread(10)).toBeLessThan(0.003);
    expect(spread(60)).toBeLessThan(1e-9);
    expect(spread(60, 7)).toBeLessThan(1e-9);
    // So the long-run worth of a roll is the plain average of the board.
    const worth = boardAfter(200).reduce((sum, chance, square) => sum + chance * BOARD[square], 0);
    expect(worth).toBeCloseTo(BOARD_VALUE, 9);
    expect(() => boardAfter(-1)).toThrow();
    expect(() => boardAfter(1.5)).toThrow();
  });
});

describe('the treasure chests', () => {
  it('hold ten, twenty and thirty medals in an order shuffled every time', () => {
    expect(CHESTS).toEqual([10, 20, 30]);
    expect(CHEST_VALUE).toBe(20);
    expect(CHEST_TOWERS_FROM).toBe(20);
    const rng = seededRng(5);
    const draws = 60_000;
    const orders = new Map<string, number>();
    const firstChest = new Map<number, number>();
    for (let i = 0; i < draws; i++) {
      const prizes = shuffleChests(rng);
      expect([...prizes].sort((a, b) => a - b)).toEqual([10, 20, 30]);
      orders.set(prizes.join(), (orders.get(prizes.join()) ?? 0) + 1);
      firstChest.set(prizes[0], (firstChest.get(prizes[0]) ?? 0) + 1);
    }
    // All six orders turn up equally often, so every chest holds every prize a third of the time.
    expect(orders.size).toBe(6);
    for (const count of orders.values()) expect(Math.abs(count / draws - 1 / 6)).toBeLessThan(0.008);
    for (const count of firstChest.values()) expect(Math.abs(count / draws - 1 / 3)).toBeLessThan(0.01);
    expect(shuffleChests(() => 0.9999999)).toEqual([10, 20, 30]);
  });
});
