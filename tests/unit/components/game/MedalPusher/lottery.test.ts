import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  BALL_JACKPOT_CHANCE,
  BOARD,
  BOARD_VALUE,
  BOWL,
  CHAIN_GOAL,
  CHALLENGE_CHANCE,
  CHESTS,
  CHEST_TOWERS_FROM,
  CONTINUE_CHANCE,
  CHEST_VALUE,
  DIE_FACES,
  FEVER_SQUARE,
  HOLE_JACKPOT_CHANCE,
  JACKPOT_CHANCE,
  JACKPOT_START,
  POCKET_VALUE,
  REACH_RATE,
  ROULETTE,
  SPIN_TABLE,
  SPIN_TOTAL,
  TIERS,
  TIER_BONUS,
  TIER_DIGITS,
  boardAfter,
  bowlValue,
  chainChance,
  drawDie,
  drawHole,
  drawPocket,
  drawSpin,
  holePays,
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
    expect(tierChance('seven')).toBeCloseTo(0.007, 12);
    expect(tierChance('big')).toBeCloseTo(0.015, 12);
    expect(tierChance('small')).toBeCloseTo(0.04, 12);
    expect(tierChance('miss')).toBeCloseTo(0.938, 12);
  });

  it('turns a roll into a tier at the right boundaries', () => {
    expect(tierFor(0)).toBe('seven');
    expect(tierFor(0.0069)).toBe('seven');
    expect(tierFor(0.0071)).toBe('big');
    expect(tierFor(0.0219)).toBe('big');
    expect(tierFor(0.0221)).toBe('small');
    expect(tierFor(0.0619)).toBe('small');
    expect(tierFor(0.0621)).toBe('miss');
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
  it('has twelve pockets: eight numbers and four crosses', () => {
    expect(ROULETTE).toHaveLength(12);
    expect(ROULETTE.filter((pocket) => pocket === 'stop')).toHaveLength(4);
    expect(ROULETTE.filter((pocket) => pocket === 10)).toHaveLength(3);
    expect(ROULETTE.filter((pocket) => pocket === 20)).toHaveLength(3);
    expect(ROULETTE.filter((pocket) => pocket === 30)).toHaveLength(1);
    expect(ROULETTE.filter((pocket) => pocket === 50)).toHaveLength(1);
    expect(CONTINUE_CHANCE).toBeCloseTo(2 / 3, 12);
    expect(POCKET_VALUE).toBeCloseTo(21.25, 12);
    expect(CHAIN_GOAL).toBe(4);
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

  it('gets to each level of a run with the chance of that many numbers in a row', () => {
    expect(chainChance(0)).toBe(1);
    expect(chainChance(1)).toBeCloseTo(2 / 3, 12);
    expect(chainChance(CHAIN_GOAL)).toBeCloseTo(16 / 81, 12);
  });

  it('ends a full run in a bowl of three holes, one of them the jackpot', () => {
    expect(BOWL).toEqual(['jackpot', 50, 100]);
    expect(holePays('jackpot', 345)).toBe(345);
    expect(holePays(50, 345)).toBe(50);
    expect(holePays(100, 345)).toBe(100);
    expect(bowlValue(300)).toBeCloseTo(150, 12);
    expect(bowlValue(900)).toBeCloseTo(350, 12);
    // About one ball in five gets to the bowl, and a third of those drop into the jackpot.
    expect(CHALLENGE_CHANCE).toBeCloseTo(16 / 81, 12);
    expect(CHALLENGE_CHANCE).toBeCloseTo(0.1975, 4);
    expect(HOLE_JACKPOT_CHANCE).toBeCloseTo(1 / 3, 12);
    expect(BALL_JACKPOT_CHANCE).toBeCloseTo(16 / 243, 12);
    expect(BALL_JACKPOT_CHANCE).toBeCloseTo(0.0658, 4);
    expect(JACKPOT_CHANCE).toBeCloseTo(0.007 * (16 / 243), 12);
    expect(Math.round(1 / JACKPOT_CHANCE)).toBe(2170);
  });

  it('draws every hole equally often', () => {
    const rng = seededRng(21);
    const draws = 90_000;
    const seen = BOWL.map(() => 0);
    for (let i = 0; i < draws; i++) seen[drawHole(rng)]++;
    for (const count of seen) expect(Math.abs(count / draws - 1 / BOWL.length)).toBeLessThan(0.006);
    expect(drawHole(() => 0)).toBe(0);
    expect(drawHole(() => 0.5)).toBe(1);
    expect(drawHole(() => 0.9999999)).toBe(2);
  });

  it('is worth every number it gets to and the bowl for a full run', () => {
    // Worked out the long way: every run of pockets up to the first cross, or to the goal and then every hole.
    const walked = (jackpot: number) => {
      let worth = 0;
      let challenge = 0;
      let won = 0;
      let runs = 0;
      const walk = (level: number, chance: number, medals: number) => {
        if (level === CHAIN_GOAL) {
          challenge += chance;
          for (const hole of BOWL) {
            runs += 1;
            worth += (chance / BOWL.length) * (medals + (hole === 'jackpot' ? jackpot : hole));
            if (hole === 'jackpot') won += chance / BOWL.length;
          }
          return;
        }
        for (const pocket of ROULETTE) {
          if (pocket === 'stop') {
            runs += 1;
            worth += (chance / ROULETTE.length) * medals;
          } else walk(level + 1, chance / ROULETTE.length, medals + pocket);
        }
      };
      walk(0, 1, 0);
      return { worth, challenge, won, runs };
    };
    const at300 = walked(300);
    // Four crosses after each of 1, 8, 64 and 512 runs of numbers, and three holes after each of the 4,096 full ones.
    expect(at300.runs).toBe(4 * (1 + 8 + 64 + 512) + 3 * 4096);
    expect(at300.challenge).toBeCloseTo(CHALLENGE_CHANCE, 12);
    expect(at300.won).toBeCloseTo(BALL_JACKPOT_CHANCE, 12);
    expect(rouletteValue(300)).toBeCloseTo(at300.worth, 9);
    expect(rouletteValue(1000)).toBeCloseTo(walked(1000).worth, 9);
    expect(rouletteValue(300)).toBeCloseTo(63.7346, 4);
    // Only the jackpot's hole moves it.
    expect(rouletteValue(1000) - rouletteValue(300)).toBeCloseTo((700 * 16) / 243, 9);
  });

  it('pays what its exact value says over many runs', () => {
    const rng = seededRng(77);
    const runs = 200_000;
    let medals = 0;
    let challenges = 0;
    let jackpots = 0;
    for (let i = 0; i < runs; i++) {
      let level = 0;
      while (level < CHAIN_GOAL) {
        const pocket = ROULETTE[drawPocket(rng)];
        if (pocket === 'stop') break;
        medals += pocket;
        level++;
      }
      if (level < CHAIN_GOAL) continue;
      challenges++;
      const hole = BOWL[drawHole(rng)];
      if (hole === 'jackpot') jackpots++;
      medals += holePays(hole, 300);
    }
    // Within five standard errors of the exact chances.
    const within = (seen: number, p: number) => Math.abs(seen / runs - p) < 5 * Math.sqrt((p * (1 - p)) / runs);
    expect(within(challenges, CHALLENGE_CHANCE)).toBe(true);
    expect(within(jackpots, BALL_JACKPOT_CHANCE)).toBe(true);
    expect(Math.abs(medals / runs - rouletteValue(300))).toBeLessThan(0.9);
  });

  it('makes a spin worth a little over one medal', () => {
    expect(TIER_BONUS).toEqual({ small: 'sugoroku', big: 'chest', seven: 'ball' });
    expect(tierValue('miss', JACKPOT_START)).toBe(0);
    expect(tierValue('small', JACKPOT_START)).toBe(BOARD_VALUE);
    expect(tierValue('big', JACKPOT_START)).toBe(CHEST_VALUE);
    expect(tierValue('seven', 900)).toBeCloseTo(rouletteValue(900), 12);
    const expected = 0.04 * BOARD_VALUE + 0.015 * CHEST_VALUE + 0.007 * rouletteValue(JACKPOT_START);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(expected, 12);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(1.09614, 5);
    expect(spinValue(900)).toBeCloseTo(1.372685, 5);
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
