import { describe, expect, it } from 'vitest';

import {
  BET_OPTIONS,
  BITE_CELLS,
  CHEST,
  CHEST_CELLS,
  FISH,
  MAX_BET,
  MOST_MEDALS,
  NO_BITE_CELLS,
  TOP_MULTIPLE,
  analyzeMachine,
  biteFrom,
  castFrom,
  drawCast,
  fishOf,
  isBet,
  isCast,
  landedFrom,
  multipleOf,
  payoutsOf,
  prizeFrom,
  resolveCast,
  seeded,
  simulateSessions,
  valueOf,
  type Cast,
  type FishId,
} from '@/components/game/Fishing/engine';
import { getStrings } from '@/components/game/Fishing/i18n';

// Big Catch Harbor's odds are worked out from its tables (engine.ts). Here they are counted again the long way: every
// cell of every draw the machine makes is walked through the very functions that turn random numbers into a cast, and
// what each comes to is added up as whole numbers. The two must agree to the last medal.

const lcm = (a: number, b: number): number => {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  return (a / gcd(a, b)) * b;
};
/** The number in the middle of cell `i` of `cells`: a draw that falls in that cell. */
const middle = (i: number, cells: number) => (i + 0.5) / cells;

describe('a cast, drawn', () => {
  it('turns its first number into what bites: each fish its cells in order, then the cells nothing bites', () => {
    expect(FISH.map((fish) => fish.bites)).toEqual([2_100, 1_100, 600, 250, 100, 45, 20, 40, 10]);
    expect(NO_BITE_CELLS).toBe(5_735);
    expect(BITE_CELLS).toBe(10_000);
    const counts = new Map<FishId | null, number>();
    for (let i = 0; i < BITE_CELLS; i++) {
      const fish = biteFrom(middle(i, BITE_CELLS));
      counts.set(fish, (counts.get(fish) ?? 0) + 1);
    }
    for (const fish of FISH) expect(counts.get(fish.id), fish.id).toBe(fish.bites);
    expect(counts.get(null)).toBe(NO_BITE_CELLS);
    // The edges of the range: the first cell is the first fish's, the last nothing's, and 1 itself is never drawn.
    expect(biteFrom(0)).toBe('fry');
    expect(biteFrom(0.999_999_99)).toBeNull();
    expect(biteFrom(2_100 / 10_000)).toBe('goby');
    expect(biteFrom(2_099.999 / 10_000)).toBe('fry');
  });

  it('turns its second into landed or away, and its third into the chest’s prize', () => {
    for (const fish of FISH) {
      let landed = 0;
      for (let i = 0; i < fish.lands.den; i++) if (landedFrom(fish.id, middle(i, fish.lands.den))) landed++;
      expect(landed, fish.id).toBe(fish.lands.num);
    }
    const prizes = CHEST.map(() => 0);
    for (let i = 0; i < CHEST_CELLS; i++) prizes[prizeFrom(middle(i, CHEST_CELLS))] += 1;
    expect(prizes).toEqual(CHEST.map((prize) => prize.cells));
    expect(CHEST.reduce((sum, prize) => sum + prize.cells, 0)).toBe(CHEST_CELLS);
  });

  it('always draws three numbers, in order, and nothing else', () => {
    const queue = [0.0005, 0.2, 0.99];
    let asked = 0;
    const cast = drawCast(() => {
      asked++;
      return queue.shift()!;
    });
    expect(asked).toBe(3);
    expect(cast).toEqual({ fish: 'fry', landed: true, prize: null });
    // Nothing bites: the second and third are drawn all the same, and ignored.
    asked = 0;
    expect(drawCast(() => (asked++, 0.9))).toEqual({ fish: null, landed: false, prize: null });
    expect(asked).toBe(3);
  });

  it('gives a prize only to a chest landed, and is only ever a cast the machine could draw', () => {
    // The chest's cells come after the marlin's: 2,100 + 1,100 + 600 + 250 + 100 + 45 + 20 = 4,215.
    const chestCell = middle(4_215, BITE_CELLS);
    expect(biteFrom(chestCell)).toBe('chest');
    expect(castFrom(chestCell, 0.1, 0.99)).toEqual({ fish: 'chest', landed: true, prize: 3 });
    expect(castFrom(chestCell, 0.9, 0.99)).toEqual({ fish: 'chest', landed: false, prize: null });
    const lordCell = middle(4_255, BITE_CELLS);
    expect(biteFrom(lordCell)).toBe('lord');
    expect(castFrom(lordCell, 0.1, 0.5)).toEqual({ fish: 'lord', landed: true, prize: null });
    expect(castFrom(lordCell, 0.125, 0.5)).toEqual({ fish: 'lord', landed: false, prize: null });

    const good: Cast[] = [
      { fish: null, landed: false, prize: null },
      { fish: 'fry', landed: false, prize: null },
      { fish: 'lord', landed: true, prize: null },
      { fish: 'chest', landed: true, prize: 0 },
      { fish: 'chest', landed: false, prize: null },
    ];
    for (const cast of good) expect(isCast(cast), JSON.stringify(cast)).toBe(true);
    const bad: unknown[] = [
      null,
      [],
      { fish: null, landed: true, prize: null },
      { fish: 'whale', landed: true, prize: null },
      { fish: 'fry', landed: 'yes', prize: null },
      { fish: 'fry', landed: true, prize: 1 },
      { fish: 'chest', landed: true, prize: null },
      { fish: 'chest', landed: true, prize: 4 },
      { fish: 'chest', landed: true, prize: 1.5 },
      { fish: 'chest', landed: false, prize: 0 },
    ];
    for (const cast of bad) expect(isCast(cast), JSON.stringify(cast)).toBe(false);
  });

  it('pays a fish’s multiple, or a chest’s prize, times the bet, and the floor its named wins', () => {
    expect(BET_OPTIONS).toEqual([1, 3, 5]);
    expect(MAX_BET).toBe(5);
    expect(isBet(2)).toBe(false);
    expect(isBet(0)).toBe(false);
    expect(isBet('3')).toBe(false);
    for (const bet of BET_OPTIONS) {
      expect(resolveCast({ fish: 'fry', landed: true, prize: null }, bet).win).toBe(bet);
      expect(resolveCast({ fish: 'marlin', landed: true, prize: null }, bet).win).toBe(50 * bet);
      expect(resolveCast({ fish: 'marlin', landed: false, prize: null }, bet).win).toBe(0);
      expect(resolveCast({ fish: 'chest', landed: true, prize: 2 }, bet)).toMatchObject({ multiple: 50, win: 50 * bet, label: 'treasure' });
      expect(resolveCast({ fish: 'lord', landed: true, prize: null }, bet)).toMatchObject({ multiple: 300, win: 300 * bet, label: 'harbor-lord' });
      expect(resolveCast({ fish: 'lord', landed: false, prize: null }, bet)).toMatchObject({ win: 0, label: null });
      expect(resolveCast({ fish: null, landed: false, prize: null }, bet).win).toBe(0);
    }
    expect(TOP_MULTIPLE).toBe(300);
    expect(MOST_MEDALS).toBe(1_500);
  });
});

describe('the exact odds', () => {
  it('give back exactly 90 of every 100 medals, counted cell by cell through the draw itself', () => {
    // Every combination of the three draws' cells, on one grid fine enough for every fish's landing chance.
    const landCells = FISH.reduce((grid, fish) => lcm(grid, fish.lands.den), 1);
    expect(landCells).toBe(40);
    let back = 0;
    let caught = 0;
    let away = 0;
    let nothing = 0;
    for (let i = 0; i < BITE_CELLS; i++) {
      const r1 = middle(i, BITE_CELLS);
      const fish = biteFrom(r1);
      if (fish === null) {
        // Nothing bites: every combination of the other two is nothing.
        nothing += landCells * CHEST_CELLS;
        continue;
      }
      for (let j = 0; j < landCells; j++) {
        const r2 = middle(j, landCells);
        for (let k = 0; k < (fish === 'chest' ? CHEST_CELLS : 1); k++) {
          const weight = fish === 'chest' ? 1 : CHEST_CELLS;
          const cast = castFrom(r1, r2, middle(k, CHEST_CELLS));
          const multiple = multipleOf(cast);
          back += multiple * weight;
          if (multiple > 0) caught += weight;
          else away += weight;
        }
      }
    }
    const ways = BITE_CELLS * landCells * CHEST_CELLS;
    expect(ways).toBe(8_000_000);
    expect(back).toBe(7_200_000);
    expect(back / ways).toBe(0.9);
    const odds = analyzeMachine();
    expect(odds.rtp).toEqual({ num: 9, den: 10 });
    expect(odds.edge).toEqual({ num: 1, den: 10 });
    expect(valueOf(odds.hit) * ways).toBeCloseTo(caught, 6);
    expect(valueOf(odds.away) * ways).toBeCloseTo(away, 6);
    expect(valueOf(odds.noBite) * ways).toBeCloseTo(nothing, 6);
    expect(caught + away + nothing).toBe(ways);
  });

  it('are the same at every bet: the bet changes the units, not the machine', () => {
    for (const bet of BET_OPTIONS) {
      let back = 0;
      for (const { multiple, chance } of payoutsOf()) back += multiple * bet * valueOf(chance);
      expect(back / bet).toBeCloseTo(0.9, 12);
    }
  });

  it('publish each fish’s figures as fractions, and they add up', () => {
    const odds = analyzeMachine();
    const caught = Object.fromEntries(odds.fish.map((fish) => [fish.id, fish.caught]));
    expect(caught.fry).toEqual({ num: 399, den: 2_000 });
    expect(caught.marlin).toEqual({ num: 1, den: 1_250 });
    expect(caught.chest).toEqual({ num: 1, den: 500 });
    expect(caught.lord).toEqual({ num: 1, den: 8_000 });
    expect(odds.hit).toEqual({ num: 15_267, den: 40_000 });
    expect(odds.noBite).toEqual({ num: 1_147, den: 2_000 });
    expect(odds.chestMean).toEqual({ num: 57, den: 2 });
    // The chest's prizes per cast: a chest landed once in 500 casts, then its cells out of 20.
    expect(odds.chest.map((prize) => prize.perCast)).toEqual([
      { num: 1, den: 1_000 },
      { num: 3, den: 5_000 },
      { num: 3, den: 10_000 },
      { num: 1, den: 10_000 },
    ]);
    // Every multiple's chance, nothing included, adds up to one.
    const total = payoutsOf().reduce((sum, { chance }) => sum + valueOf(chance), 0);
    expect(total).toBeCloseTo(1, 12);
    expect(payoutsOf()[0]).toEqual({ multiple: 0, chance: { num: 24_733, den: 40_000 } });
    // The spread of one cast, and how long a run must be before what came back settles near 90%.
    expect(odds.sd).toBeGreaterThan(4.5);
    expect(odds.sd).toBeLessThan(4.6);
    expect(odds.castsForOnePoint).toBeGreaterThan(780_000);
    expect(odds.castsForOnePoint).toBeLessThan(820_000);
  });

  it('say on the Odds tab what the tables say', () => {
    for (const language of ['en', 'ja'] as const) {
      const words = getStrings(language).draws.join(' ');
      expect(words).toContain('10,000');
      expect(words).toContain(NO_BITE_CELLS.toLocaleString('en-US'));
      expect(words).toContain(fishOf('fry').bites.toLocaleString('en-US'));
      expect(words).toContain(String(fishOf('lord').bites));
      expect(words).toContain(String(CHEST_CELLS));
    }
    expect(fishOf('fry').lands).toEqual({ num: 19, den: 20 });
    expect(fishOf('lord').lands).toEqual({ num: 1, den: 8 });
    expect(getStrings('en').draws[2]).toContain('19 times in 20');
    expect(getStrings('en').draws[2]).toContain('once in 8');
    expect(getStrings('ja').draws[2]).toContain('20回に19回');
    expect(getStrings('ja').draws[2]).toContain('8回に1回');
  });
});

describe('the simulation', () => {
  it('plays casts as the machine draws them, and comes out the same for the same seed', () => {
    const a = simulateSessions(200, 50, seeded(7));
    const b = simulateSessions(200, 50, seeded(7));
    expect(a).toEqual(b);
    expect(a.nets).toHaveLength(50);
    // Over a long run what comes back is near 90%.
    const long = simulateSessions(200_000, 1, seeded(20261017));
    expect(long.rtp).toBeGreaterThan(0.85);
    expect(long.rtp).toBeLessThan(0.95);
  });
});
