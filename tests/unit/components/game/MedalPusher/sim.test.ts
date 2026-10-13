import { describe, expect, it } from 'vitest';

import { AIM, CHECKERS, DROP_INTERVAL, TOWER, checkerAt, seededRng, tipOf } from '@/components/game/MedalPusher/engine';
import { CHANCE_BONUS, JACKPOT_START, TIERS, spinValue } from '@/components/game/MedalPusher/lottery';
import { MAX_STOCK } from '@/components/game/MedalPusher/session';
import {
  AIM_COLORS,
  AIM_IDS,
  AIM_MARKERS,
  BESIDE,
  PACES,
  WARM_UP,
  aimAt,
  frontShare,
  simulate,
  steadyReturn,
  type AimResult,
} from '@/components/game/MedalPusher/sim';

describe('the ways of aiming', () => {
  it('says for each medal which rail feeds it, and where that rail lets it go', () => {
    const never = () => {
      throw new Error('only aiming anywhere draws a number');
    };
    expect(AIM_IDS).toEqual(['centre', 'anywhere', 'beside', 'edges']);
    // Three of the four feed the two rails by turns, the left first, and keep each rail on one spot.
    // Down the middle, both rails feed the same column: the pockets do not move along the lip, so there is nothing to follow.
    for (const n of [0, 2, 76]) expect(aimAt('centre', n, never)).toEqual({ arm: 0, x: CHECKERS.positions[1] });
    for (const n of [1, 3, 77]) expect(aimAt('centre', n, never)).toEqual({ arm: 1, x: CHECKERS.positions[1] });
    // Beside the pockets and at the edges, each rail has the spot on its own side.
    expect(aimAt('beside', 0, never)).toEqual({ arm: 0, x: BESIDE[0] });
    expect(aimAt('beside', 1, never)).toEqual({ arm: 1, x: BESIDE[1] });
    expect(aimAt('beside', 2, never)).toEqual({ arm: 0, x: BESIDE[0] });
    expect(aimAt('edges', 0, never)).toEqual({ arm: 0, x: AIM.min });
    expect(aimAt('edges', 1, never)).toEqual({ arm: 1, x: AIM.max });
    // Anywhere at all is a new spot for every medal, fed by the rail on that side of the field, whichever medal it is.
    for (const n of [0, 1]) {
      expect(aimAt('anywhere', n, () => 0)).toEqual({ arm: 0, x: AIM.min });
      expect(aimAt('anywhere', n, () => 0.49)).toMatchObject({ arm: 0 });
      expect(aimAt('anywhere', n, () => 0.5)).toEqual({ arm: 1, x: expect.closeTo(50, 9) });
      expect(aimAt('anywhere', n, () => 1)).toEqual({ arm: 1, x: AIM.max });
    }
    // Every spot is one the rail that feeds it can point at, and the left rail's is never to the right of the right rail's.
    for (const id of AIM_IDS) {
      const pick = seededRng(5);
      for (let n = 0; n < 200; n++) {
        const feed = aimAt(id, n, pick);
        expect(tipOf(feed.arm, feed.x)).toBe(feed.x);
      }
    }
  });

  it('has its fixed columns behind the middle pocket, beside the pockets and at the edges, all within reach', () => {
    const [left, middle, right] = CHECKERS.positions;
    // Down the middle is the column behind the middle pocket, and either arm can feed it.
    expect(checkerAt(aimAt('centre', 0, Math.random).x)).toBe(1);
    expect(checkerAt(aimAt('centre', 1, Math.random).x)).toBe(1);
    expect(tipOf(0, middle)).toBe(middle);
    expect(tipOf(1, middle)).toBe(middle);
    // Beside the pockets: one pocket's spacing outside the outer two, a column each for the left arm and the right.
    expect(BESIDE).toEqual([22, 78]);
    expect(BESIDE[0]).toBe(left - TOWER.spacing);
    expect(BESIDE[1]).toBe(right + TOWER.spacing);
    expect(BESIDE[0] + BESIDE[1]).toBe(left + right);
    for (const spot of BESIDE) {
      expect(checkerAt(spot)).toBe(-1);
      expect(spot).toBeGreaterThan(AIM.min);
      expect(spot).toBeLessThan(AIM.max);
    }
    expect(tipOf(0, BESIDE[0])).toBe(BESIDE[0]);
    expect(tipOf(1, BESIDE[1])).toBe(BESIDE[1]);
    // The edges are further from the pockets than that again.
    expect(AIM.min).toBeLessThan(BESIDE[0] - TOWER.spacing / 2);
    expect(AIM.max).toBeGreaterThan(BESIDE[1] + TOWER.spacing / 2);
  });

  it('gives every aim a colour and a shape of its own', () => {
    expect(new Set(AIM_IDS.map((id) => AIM_COLORS[id])).size).toBe(AIM_IDS.length);
    expect(new Set(AIM_IDS.map((id) => AIM_MARKERS[id])).size).toBe(AIM_IDS.length);
    for (const id of AIM_IDS) expect(AIM_COLORS[id]).toMatch(/^var\(--mp-s-[a-z]+\)$/);
    // Two a second, five, and both feed buttons held down, which is as fast as the two slots take medals.
    expect(PACES).toEqual([2, 5, 11]);
    expect(PACES[2]).toBeLessThanOrEqual(Math.floor(2 / DROP_INTERVAL));
    expect(PACES[2]).toBeGreaterThan(2 / DROP_INTERVAL - 1);
  });
});

describe('what a run measured', () => {
  const result: AimResult = {
    played: 1000,
    won: 900,
    lost: 250,
    hits: 220,
    wasted: 20,
    spins: 200,
    gold: 0,
    paidOut: 190,
    tiers: { miss: 188, small: 8, big: 3, seven: 1 },
    jackpots: 0,
    fieldChange: 40,
    points: [],
  };

  it('works out the share that left by the front', () => {
    expect(frontShare(result)).toBeCloseTo(900 / 1150, 12);
    expect(frontShare({ ...result, won: 0, lost: 0 })).toBe(0);
  });

  it('works out the return with average luck on the screen', () => {
    expect(steadyReturn(result)).toBeCloseTo((900 / 1150) * (1 + 0.2 * spinValue(JACKPOT_START)), 12);
    expect(steadyReturn({ ...result, played: 0 })).toBe(0);
    // A gold spin is worth what any spin is and, on top, what being gold adds: a medal wasted on a full hold
    // that turned a spin gold gets that much back.
    expect(steadyReturn({ ...result, gold: 12 })).toBeCloseTo((900 / 1150) * (1 + 0.2 * spinValue(JACKPOT_START) + 0.012 * CHANCE_BONUS), 12);
    expect(steadyReturn({ ...result, gold: 12 })).toBeGreaterThan(steadyReturn(result));
    // It never gets back what a spin of its own would have been worth.
    expect(steadyReturn({ ...result, gold: 20 })).toBeLessThan(steadyReturn({ ...result, spins: 220 }));
    // With no spins, what comes back is just the front's share.
    expect(steadyReturn({ ...result, spins: 0 })).toBeCloseTo(900 / 1150, 12);
  });
});

describe('the simulation', () => {
  it('plays every aim the same number of medals and keeps its books', async () => {
    const medals = 120;
    const progress: number[] = [];
    const result = await simulate(medals, 5, { onProgress: (done, total) => progress.push(done / total) }, 2024);
    expect(result).not.toBeNull();
    if (!result) return;
    for (const id of AIM_IDS) {
      const aim = result[id];
      expect(aim.played).toBe(medals);
      // Every medal that came onto the field in the count either left it or is still there.
      expect(aim.won + aim.lost + aim.fieldChange).toBe(aim.played + aim.paidOut);
      // Spins held or in progress when the count began are played in it without a medal through a pocket of their own.
      // A gold spin was a medal that found the hold full, and is one of the spins.
      expect(aim.gold).toBeGreaterThanOrEqual(0);
      expect(aim.gold).toBeLessThanOrEqual(aim.wasted + MAX_STOCK);
      expect(aim.gold).toBeLessThanOrEqual(aim.spins + MAX_STOCK);
      const carried = aim.spins + aim.wasted - aim.hits;
      expect(carried).toBeGreaterThanOrEqual(0);
      expect(carried).toBeLessThanOrEqual(MAX_STOCK);
      const finished = TIERS.reduce((sum, tier) => sum + aim.tiers[tier], 0);
      expect(finished - aim.spins === 0 || finished - aim.spins === 1).toBe(true);
      expect(aim.points[aim.points.length - 1]).toEqual({ medals, rate: aim.won / aim.played });
      expect(aim.points.every((point, index) => index === 0 || point.medals > aim.points[index - 1].medals)).toBe(true);
      expect(frontShare(aim)).toBeGreaterThan(0.5);
      expect(frontShare(aim)).toBeLessThan(0.95);
    }
    // Aim still tells. Down the middle about one medal in six ends up through a pocket, and more in a run where a
    // tower goes over through one; the further from the pockets a medal is fed, the fewer do, and from the edges
    // fewer than half as many. But some do from anywhere: the pile carries medals across, and what the screen pays
    // comes down all over the pusher.
    expect(result.centre.hits).toBeGreaterThan(medals * 0.1);
    expect(result.centre.hits).toBeLessThan(medals * 0.5);
    expect(result.centre.hits).toBeGreaterThan(result.anywhere.hits);
    expect(result.centre.hits).toBeGreaterThan(result.beside.hits);
    expect(result.anywhere.hits).toBeGreaterThan(result.edges.hits);
    expect(result.beside.hits).toBeGreaterThan(result.edges.hits);
    expect(result.edges.hits).toBeGreaterThan(0);
    expect(result.edges.hits).toBeLessThan(result.centre.hits / 2);
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress.every((share, index) => index === 0 || share >= progress[index - 1])).toBe(true);
  }, 30_000);

  it('gives the same answer for the same seed, and another for another', async () => {
    const a = await simulate(40, 5, {}, 7);
    const b = await simulate(40, 5, {}, 7);
    const c = await simulate(40, 5, {}, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  }, 30_000);

  it('stops when it is cancelled', async () => {
    const before = new AbortController();
    before.abort();
    expect(await simulate(40, 5, { signal: before.signal }, 1)).toBeNull();

    const during = new AbortController();
    const run = simulate(2000, 2, { signal: during.signal, onProgress: () => during.abort() }, 1);
    expect(await run).toBeNull();
  }, 30_000);

  it('refuses a run that makes no sense', async () => {
    await expect(simulate(0, 5)).rejects.toThrow();
    await expect(simulate(10.5, 5)).rejects.toThrow();
    await expect(simulate(10, 0)).rejects.toThrow();
    await expect(simulate(10, Number.NaN)).rejects.toThrow();
    await expect(simulate(10, 5, {}, Number.NaN)).rejects.toThrow();
    expect(WARM_UP).toBe(300);
  });
});
