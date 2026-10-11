import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  BOARD,
  BOARD_VALUE,
  CHAIN_GOAL,
  CHESTS,
  CHEST_TOWERS_FROM,
  CONTINUE_CHANCE,
  CHEST_VALUE,
  DIE_FACES,
  FEVER_SQUARE,
  JACKPOT_CHANCE,
  JACKPOT_START,
  LONG_REACH,
  POCKET_VALUE,
  REACH_KINDS,
  REACH_RATE,
  ROULETTE,
  SPIN_TABLE,
  SPIN_TOTAL,
  TIERS,
  TIER_BONUS,
  TIER_DIGITS,
  boardAfter,
  chainChance,
  drawDie,
  drawPocket,
  drawSpin,
  reachChance,
  reachHitChance,
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
      const { tier, digits, reach, reachKind } = drawSpin(rng);
      const [left, centre, right] = digits;
      expect(digits.every((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9)).toBe(true);
      // A reach is played one way or the other, and a spin without one has none to play.
      expect(REACH_KINDS).toContain(reachKind);
      expect(reachKind !== 'none').toBe(reach);
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

/** Many spins, counted by the kind of reach each showed and by whether it had won. */
function tallyReaches(seed: number, draws: number) {
  const rng = seededRng(seed);
  const shown = { normal: 0, long: 0 };
  const hit = { normal: 0, long: 0 };
  let wins = 0;
  let teases = 0;
  for (let i = 0; i < draws; i++) {
    const spin = drawSpin(rng);
    if (spin.tier !== 'miss') wins++;
    else if (spin.reach) teases++;
    if (spin.reachKind === 'none') continue;
    shown[spin.reachKind]++;
    if (spin.tier !== 'miss') hit[spin.reachKind]++;
  }
  return { draws, shown, hit, wins, teases };
}

/** Expects `seen` out of `of` to be within five standard errors of the exact chance. */
const near = (seen: number, of: number, chance: number) => expect(Math.abs(seen / of - chance)).toBeLessThan(5 * Math.sqrt((chance * (1 - chance)) / of));

describe('the two kinds of reach', () => {
  it('plays a reach long more often for a spin that has won', () => {
    expect(REACH_KINDS).toEqual(['none', 'normal', 'long']);
    expect(LONG_REACH).toEqual({ win: 0.6, miss: 0.15 });
    expect(LONG_REACH.win).toBeGreaterThan(LONG_REACH.miss);
  });

  it('decides how a reach is played only once the spin itself is settled', () => {
    // The draws up to the last are the same; the last one only picks the kind of reach.
    const spin = (draws: number[]) => {
      const queue = [...draws];
      return drawSpin(() => queue.shift() ?? 0.5);
    };
    const wonLong = spin([0.03, 0.3, 0.59]);
    const wonNormal = spin([0.03, 0.3, 0.61]);
    expect(wonLong).toEqual({ tier: 'small', digits: [4, 4, 4], reach: true, reachKind: 'long' });
    expect(wonNormal).toEqual({ ...wonLong, reachKind: 'normal' });
    const lostLong = spin([0.5, 0.45, 0.1, 0.2, 0.14]);
    const lostNormal = spin([0.5, 0.45, 0.1, 0.2, 0.16]);
    expect(lostLong).toEqual({ tier: 'miss', digits: [5, 6, 5], reach: true, reachKind: 'long' });
    expect(lostNormal).toEqual({ ...lostLong, reachKind: 'normal' });
    // A spin with no reach draws nothing more than it did.
    const queue = [0.5, 0.45, 0.9, 0.3, 0.7];
    const plain = drawSpin(() => {
      const next = queue.shift();
      if (next === undefined) throw new Error('a spin with no reach drew a number too many');
      return next;
    });
    expect(plain).toEqual({ tier: 'miss', digits: [5, 7, 3], reach: false, reachKind: 'none' });
    expect(queue).toHaveLength(0);
  });

  it('plays as many reaches long as it says, and pays as often as it did', () => {
    const { draws, shown, hit, wins, teases } = tallyReaches(4242, 600_000);
    near(hit.long, wins, LONG_REACH.win);
    near(shown.long - hit.long, teases, LONG_REACH.miss);
    // Every winning spin shows a reach of one kind or the other, and so does every tease.
    expect(hit.long + hit.normal).toBe(wins);
    expect(shown.long + shown.normal).toBe(wins + teases);
    // The slot wins as often as it did before reaches came in two kinds, and teases as often.
    near(wins, draws, 1 - SPIN_TABLE.miss / SPIN_TOTAL);
    near(teases, draws - wins, REACH_RATE);
  });
});

describe('how far to trust a reach', () => {
  const win = 1 - SPIN_TABLE.miss / SPIN_TOTAL;
  const tease = (SPIN_TABLE.miss / SPIN_TOTAL) * REACH_RATE;

  it('works out the chance of each kind of reach and of a win behind it', () => {
    // Every winning spin shows a reach, and a share of the losing ones.
    expect(reachChance()).toBeCloseTo(win + tease, 12);
    expect(reachChance('any')).toBe(reachChance());
    expect(reachChance('long')).toBeCloseTo(win * LONG_REACH.win + tease * LONG_REACH.miss, 12);
    expect(reachChance('normal')).toBeCloseTo(win * (1 - LONG_REACH.win) + tease * (1 - LONG_REACH.miss), 12);
    expect(reachChance('long') + reachChance('normal')).toBeCloseTo(reachChance(), 12);
    // Bayes: the wins among the spins that show the reach.
    expect(reachHitChance()).toBeCloseTo(win / (win + tease), 12);
    expect(reachHitChance('long')).toBeCloseTo((win * LONG_REACH.win) / (win * LONG_REACH.win + tease * LONG_REACH.miss), 12);
    expect(reachHitChance('normal')).toBeCloseTo((win * (1 - LONG_REACH.win)) / (win * (1 - LONG_REACH.win) + tease * (1 - LONG_REACH.miss)), 12);
    // The figures the Odds tab prints.
    expect(reachChance()).toBeCloseTo(0.2027, 6);
    expect(reachChance('long')).toBeCloseTo(0.058305, 6);
    expect(reachHitChance()).toBeCloseTo(0.305871, 6);
    expect(reachHitChance('long')).toBeCloseTo(0.638024, 6);
    expect(reachHitChance('normal')).toBeCloseTo(0.171751, 6);
    // A long reach is the better sign, an ordinary one the worse, and neither changes how often a spin wins.
    expect(reachHitChance('long')).toBeGreaterThan(reachHitChance());
    expect(reachHitChance('normal')).toBeLessThan(reachHitChance());
    const overall = reachChance('long') * reachHitChance('long') + reachChance('normal') * reachHitChance('normal');
    expect(overall).toBeCloseTo(win, 12);
  });

  it('draws reaches that come up, and hit, as often as that', () => {
    const { draws, shown, hit } = tallyReaches(90210, 600_000);
    near(shown.long, draws, reachChance('long'));
    near(shown.normal, draws, reachChance('normal'));
    near(shown.long + shown.normal, draws, reachChance());
    near(hit.long, shown.long, reachHitChance('long'));
    near(hit.normal, shown.normal, reachHitChance('normal'));
    near(hit.long + hit.normal, shown.long + shown.normal, reachHitChance());
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
    expect(CHAIN_GOAL).toBe(6);
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
    expect(chainChance(CHAIN_GOAL)).toBeCloseTo(64 / 729, 12);
    expect(JACKPOT_CHANCE).toBeCloseTo(0.007 * (64 / 729), 12);
  });

  it('is worth every number it gets to and the jackpot for a full run', () => {
    // Worked out the long way: every run of pockets up to the first cross or the goal.
    const worth = (jackpot: number) => {
      let total = 0;
      const walk = (level: number, chance: number, medals: number) => {
        if (level === CHAIN_GOAL) {
          total += chance * (medals + jackpot);
          return;
        }
        for (const pocket of ROULETTE) {
          if (pocket === 'stop') total += (chance / ROULETTE.length) * medals;
          else walk(level + 1, chance / ROULETTE.length, medals + pocket);
        }
      };
      walk(0, 1, 0);
      return total;
    };
    expect(rouletteValue(300)).toBeCloseTo(worth(300), 9);
    expect(rouletteValue(1000)).toBeCloseTo(worth(1000), 9);
    expect(rouletteValue(300)).toBeCloseTo(65.1063, 4);
    expect(rouletteValue(1000) - rouletteValue(300)).toBeCloseTo((700 * 64) / 729, 9);
  });

  it('pays what its exact value says over many runs', () => {
    const rng = seededRng(77);
    const runs = 200_000;
    let medals = 0;
    let jackpots = 0;
    for (let i = 0; i < runs; i++) {
      for (let level = 0; level < CHAIN_GOAL; level++) {
        const pocket = ROULETTE[drawPocket(rng)];
        if (pocket === 'stop') break;
        medals += pocket;
        if (level === CHAIN_GOAL - 1) jackpots++;
      }
    }
    expect(Math.abs(jackpots / runs - chainChance(CHAIN_GOAL))).toBeLessThan(0.003);
    expect(Math.abs((medals + jackpots * 300) / runs - rouletteValue(300))).toBeLessThan(0.9);
  });

  it('makes a spin worth a little over one medal', () => {
    expect(TIER_BONUS).toEqual({ small: 'sugoroku', big: 'chest', seven: 'ball' });
    expect(tierValue('miss', JACKPOT_START)).toBe(0);
    expect(tierValue('small', JACKPOT_START)).toBe(BOARD_VALUE);
    expect(tierValue('big', JACKPOT_START)).toBe(CHEST_VALUE);
    expect(tierValue('seven', 900)).toBeCloseTo(rouletteValue(900), 12);
    const expected = 0.04 * BOARD_VALUE + 0.015 * CHEST_VALUE + 0.007 * rouletteValue(JACKPOT_START);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(expected, 12);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(1.10574, 5);
    expect(spinValue(900)).toBeCloseTo(1.47447, 5);
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
