import { describe, expect, it } from 'vitest';

import {
  DAILY_PLAYED_MOST,
  EXPECTED_PER_MEDAL,
  JACKPOT_C,
  JACKPOT_ONE_IN,
  JACKPOT_Q,
  JACKPOT_SEED,
  JACKPOT_SHARE,
  MEAN_JACKPOT,
  compactDay,
  exactPerMedal,
  hitsPerDay,
  isDeviceName,
  isWinId,
  jackpotFrom,
  jackpotViewFrom,
  poolAmount,
  winChance,
  winDay,
} from '@/lib/medalFloor/jackpot';

// The floor jackpot's numbers, and what they come to: what a medal played is worth in the long run, how big a jackpot
// is on average, how often the floor hits it, and the most one player can have of winning it in a day.

/** A small seeded generator, so that the long run below is the same long run every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('the floor jackpot’s numbers', () => {
  it('are 1% added to every medal played, a 1 in 150,000 chance a medal, and a seed of 1,000', () => {
    expect(JACKPOT_SHARE).toEqual({ medals: 1, per: 100 });
    expect(JACKPOT_C).toBe(0.01);
    expect(JACKPOT_ONE_IN).toBe(150_000);
    expect(JACKPOT_Q).toBe(1 / 150_000);
    expect(JACKPOT_SEED).toBe(1_000);
    expect(DAILY_PLAYED_MOST).toBe(20_000);
  });

  it('bring back c plus the seed’s share for every medal played in the long run: 0.01 + 1,000 / 150,000 ≈ 0.0167', () => {
    expect(EXPECTED_PER_MEDAL).toBeCloseTo(JACKPOT_C + JACKPOT_SEED * JACKPOT_Q, 15);
    expect(EXPECTED_PER_MEDAL).toBeCloseTo(1 / 60, 15);
    // Exactly, with whole medals only: a part of a medal never goes in, so a hair less (about half a medal a hit).
    const exact = exactPerMedal();
    expect(exact).toBeLessThan(EXPECTED_PER_MEDAL);
    expect(EXPECTED_PER_MEDAL - exact).toBeCloseTo(0.495 * JACKPOT_Q, 8);
  });

  it('make a jackpot of 2,500 medals on average: the seed and the share of the 150,000 medals played before a hit', () => {
    expect(MEAN_JACKPOT).toBe(2_500);
    // Half of all hits come before ln 2 / q medals, and one in ten after ln 10 / q.
    expect(poolAmount({ seed: JACKPOT_SEED, played: Math.round(Math.LN2 / JACKPOT_Q), extra: 0 })).toBe(2_039);
    expect(poolAmount({ seed: JACKPOT_SEED, played: Math.round(Math.LN10 / JACKPOT_Q), extra: 0 })).toBe(4_453);
  });

  it('come out so over a long run of the floor, drawn report by report as the server draws them', () => {
    const random = mulberry32(20261017);
    let played = 0;
    let paid = 0;
    let hits = 0;
    let pool = { seed: JACKPOT_SEED, played: 0, extra: 0 };
    // Reports of 1 to 2,000 medals, each drawn once with 1 − (1 − q)^n, as the server draws them.
    while (hits < 10_000) {
      const n = 1 + Math.floor(random() * 2_000);
      played += n;
      pool = { ...pool, played: pool.played + n };
      if (random() < winChance(n)) {
        paid += poolAmount(pool);
        hits += 1;
        pool = { seed: JACKPOT_SEED, played: 0, extra: 0 };
      }
    }
    // 10,000 hits: the mean jackpot within 3% of 2,500, and what a medal brings back within 3% of 0.0167.
    expect(paid / hits / MEAN_JACKPOT).toBeGreaterThan(0.97);
    expect(paid / hits / MEAN_JACKPOT).toBeLessThan(1.03);
    expect(paid / played / EXPECTED_PER_MEDAL).toBeGreaterThan(0.97);
    expect(paid / played / EXPECTED_PER_MEDAL).toBeLessThan(1.03);
  });

  it('are hit about once a week on a small floor: a progressive that grows for a while', () => {
    // A quiet day of 10,000 medals played at the linked machines, a usual one of 20,000 to 40,000, a busy one of 150,000.
    expect(1 / hitsPerDay(10_000)).toBeCloseTo(15, 10);
    expect(1 / hitsPerDay(20_000)).toBeCloseTo(7.5, 10);
    expect(1 / hitsPerDay(40_000)).toBeCloseTo(3.75, 10);
    expect(hitsPerDay(150_000)).toBeCloseTo(1, 10);
  });

  it('cannot be farmed: one player’s day takes part up to 20,000 medals, a 12.5% chance at the most, whatever they report', () => {
    expect(winChance(DAILY_PLAYED_MOST)).toBeCloseTo(1 - Math.exp(-20_000 / 150_000), 4);
    expect(winChance(DAILY_PLAYED_MOST)).toBeLessThan(0.13);
  });

  it('draw a report as one chance for all its medals, 1 − (1 − q)^n', () => {
    expect(winChance(0)).toBe(0);
    expect(winChance(-5)).toBe(0);
    expect(winChance(1)).toBeCloseTo(JACKPOT_Q, 15);
    expect(winChance(400)).toBeCloseTo(1 - (1 - JACKPOT_Q) ** 400, 12);
    // Two reports are as likely to win between them as one report of both.
    const a = winChance(300);
    const b = winChance(700);
    expect(1 - (1 - a) * (1 - b)).toBeCloseTo(winChance(1_000), 12);
  });
});

describe('the pool', () => {
  it('holds its seed, a hundredth of every medal played into it in whole medals, and what a void put back', () => {
    expect(poolAmount({ seed: 1_000, played: 0, extra: 0 })).toBe(1_000);
    expect(poolAmount({ seed: 1_000, played: 99, extra: 0 })).toBe(1_000);
    expect(poolAmount({ seed: 1_000, played: 100, extra: 0 })).toBe(1_001);
    expect(poolAmount({ seed: 1_000, played: 150_000, extra: 0 })).toBe(2_500);
    expect(poolAmount({ seed: 1_000, played: 400, extra: 2_000 })).toBe(3_004);
  });
});

describe('names and what comes over the wire', () => {
  it('names a win by its floor day, so that it fits a receipt and says how old it is', () => {
    expect(isWinId('20261017-a1b2c3d4')).toBe(true);
    expect(isWinId('20261017-a1b2c3d')).toBe(false);
    expect(isWinId('2026-10-17-a1b2c3d4')).toBe(false);
    expect(isWinId('20261017-A1B2C3D4')).toBe(false);
    expect(winDay('20261017-a1b2c3d4')).toBe('20261017');
    expect(compactDay('2026-10-17')).toBe('20261017');
    expect(`floor-jackpot:${'20261017-a1b2c3d4'}:pay`).toMatch(/^[a-z0-9-]{1,24}:[a-z0-9-]{1,24}:[a-z0-9-]{1,16}$/);
    expect(isDeviceName('device00001')).toBe(true);
    expect(isDeviceName('../x')).toBe(false);
  });

  it('reads the live pool and the route’s answer, and nothing that is not one', () => {
    expect(jackpotFrom({ amount: 1_234, seq: 2, v: 9, last: { tag: '0042', game: 'slot-machine', medals: 3_000, at: 5 } })).toEqual({
      amount: 1_234,
      seq: 2,
      v: 9,
      last: { name: null, tag: '0042', game: 'slot-machine', medals: 3_000, at: 5 },
    });
    expect(jackpotFrom({ amount: -1, seq: 0, v: 0 })).toBeNull();
    expect(jackpotFrom(null)).toBeNull();
    expect(jackpotFrom({ amount: 5, seq: 0, v: 0, last: { tag: 'x' } })?.last).toBeNull();
    expect(jackpotViewFrom({ now: 1, available: true, amount: 1_000, seq: 0, wins: [{ name: 'Lucky Cat', tag: '0001', game: 'roulette', medals: 2_000, at: 1 }, { nope: 1 }] })?.wins).toHaveLength(1);
    expect(jackpotViewFrom({ now: 1, available: 'yes', amount: 1, seq: 0 })).toBeNull();
  });
});
