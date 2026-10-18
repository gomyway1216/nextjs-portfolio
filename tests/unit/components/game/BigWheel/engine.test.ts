import { describe, expect, it } from 'vitest';

import {
  BONUS_SEGMENTS,
  DRAWS,
  LAMPS,
  LAMP_COUNT,
  NUMBER_SEGMENTS,
  NUMBER_SEGMENT_COUNT,
  SEGMENTS_OF,
  SEGMENT_COUNT,
  SPOTS,
  TOP_MULTIPLE,
  WHEEL,
  analyzeWheel,
  checkSpins,
  drawSpin,
  everyDraw,
  fraction,
  hashText,
  isSpin,
  labelOf,
  resultOf,
  seeded,
  spinFrom,
  valueOf,
  winOf,
  type Spot,
} from '@/components/game/BigWheel/engine';

// The Star Festival Big Wheel's odds are worked out exactly from its segments and its lamps, and checked here by
// adding up every one of the 43,200 equally likely ways a spin can be drawn, through the same function the machine
// draws with.

describe('the wheel', () => {
  it('has 54 segments, as a casino’s Big Six does: 50 numbers and 4 BONUS segments', () => {
    expect(WHEEL).toHaveLength(SEGMENT_COUNT);
    expect(SEGMENT_COUNT).toBe(54);
    expect(WHEEL.filter((segment) => segment === 'bonus')).toHaveLength(BONUS_SEGMENTS);
    expect(NUMBER_SEGMENTS).toHaveLength(NUMBER_SEGMENT_COUNT);
    expect(NUMBER_SEGMENT_COUNT).toBe(50);
    for (const spot of SPOTS) expect(WHEEL.filter((segment) => segment === spot), `×${spot}`).toHaveLength(SEGMENTS_OF[spot]);
  });

  it('gives every number the same weight: its segments times what it pays come to 40', () => {
    for (const spot of SPOTS) expect(SEGMENTS_OF[spot] * spot, `×${spot}`).toBe(40);
  });

  it('spreads its numbers round the wheel: no two of the same number above ×2 side by side, BONUS a quarter apart, the ×40 at the top', () => {
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const here = WHEEL[i];
      const next = WHEEL[(i + 1) % SEGMENT_COUNT];
      if (here !== 2) expect(next, `segments ${i} and ${i + 1}`).not.toBe(here);
    }
    const bonuses = WHEEL.flatMap((segment, i) => (segment === 'bonus' ? [i] : []));
    const gaps = bonuses.map((at, i) => (bonuses[(i + 1) % bonuses.length] - at + SEGMENT_COUNT) % SEGMENT_COUNT);
    for (const gap of gaps) expect([13, 14]).toContain(gap);
    expect(WHEEL[0]).toBe(40);
  });

  it('has 16 lamps in its hub: ×2 on twelve, ×3 on three, ×10 on one', () => {
    expect(LAMPS).toHaveLength(LAMP_COUNT);
    expect(LAMPS.filter((m) => m === 2)).toHaveLength(12);
    expect(LAMPS.filter((m) => m === 3)).toHaveLength(3);
    expect(LAMPS.filter((m) => m === 10)).toHaveLength(1);
    expect(TOP_MULTIPLE).toBe(400);
  });
});

describe('the draw', () => {
  it('maps each number in [0, 1) to its segment, and a second chance only ever to a number', () => {
    expect(spinFrom(0, 0.5, 0.5)).toEqual({ stop: 0, lamp: null, second: null });
    expect(spinFrom(0.99999, 0.5, 0.5)).toEqual({ stop: 53, lamp: null, second: null });
    const bonus = WHEEL.indexOf('bonus');
    const drawn = spinFrom((bonus + 0.5) / SEGMENT_COUNT, 0, 0.99999);
    expect(drawn).toEqual({ stop: bonus, lamp: 0, second: NUMBER_SEGMENTS[49] });
    expect(WHEEL[drawn.second!]).not.toBe('bonus');
  });

  it('always draws three numbers, in order, whether or not it needs the last two', () => {
    const queue = [0.01, 0.2, 0.3, (WHEEL.indexOf('bonus') + 0.5) / SEGMENT_COUNT, 0.01, 0.5];
    let taken = 0;
    const random = () => queue[taken++];
    expect(drawSpin(random)).toEqual({ stop: 0, lamp: null, second: null });
    expect(taken).toBe(3);
    expect(drawSpin(random)).toEqual({ stop: WHEEL.indexOf('bonus'), lamp: 0, second: NUMBER_SEGMENTS[25] });
    expect(taken).toBe(6);
  });

  it('reads back only spins it could have drawn', () => {
    const bonus = WHEEL.indexOf('bonus');
    expect(isSpin({ stop: 3, lamp: null, second: null })).toBe(true);
    expect(isSpin({ stop: bonus, lamp: 15, second: 0 })).toBe(true);
    for (const bad of [
      null,
      [],
      { stop: 54, lamp: null, second: null },
      { stop: 3, lamp: 2, second: null },
      { stop: 3, lamp: null, second: 5 },
      { stop: bonus, lamp: null, second: 0 },
      { stop: bonus, lamp: 16, second: 0 },
      { stop: bonus, lamp: 0, second: bonus },
      { stop: 1.5, lamp: null, second: null },
    ])
      expect(isSpin(bad), JSON.stringify(bad)).toBe(false);
  });

  it('pays the number it stops on, or on a second chance that number times the lamp', () => {
    const at = (spot: Spot) => WHEEL.indexOf(spot);
    const bonus = WHEEL.indexOf('bonus');
    expect(winOf({ 10: 5, 2: 3 }, { stop: at(10), lamp: null, second: null })).toBe(50);
    expect(winOf({ 10: 5, 2: 3 }, { stop: at(2), lamp: null, second: null })).toBe(6);
    expect(winOf({ 10: 5 }, { stop: at(4), lamp: null, second: null })).toBe(0);
    const lampOf3 = LAMPS.indexOf(3);
    expect(resultOf({ stop: bonus, lamp: lampOf3, second: at(8) })).toMatchObject({ spot: 8, multiplier: 3, bonus: true });
    expect(winOf({ 8: 2 }, { stop: bonus, lamp: lampOf3, second: at(8) })).toBe(48);
    // A stop on BONUS pays nothing by itself, whatever is bet.
    expect(winOf({ 8: 2 }, { stop: bonus, lamp: lampOf3, second: at(5) })).toBe(0);
    expect(labelOf({ stop: bonus, lamp: 0, second: at(40) }, 4_000)).toBe('wheel-400');
    expect(labelOf({ stop: bonus, lamp: lampOf3, second: at(8) }, 48)).toBe('wheel-bonus');
    expect(labelOf({ stop: at(40), lamp: null, second: null }, 40)).toBeNull();
    expect(labelOf({ stop: bonus, lamp: lampOf3, second: at(5) }, 0)).toBeNull();
  });
});

describe('the exact odds', () => {
  const odds = analyzeWheel();

  it('bring back exactly 9/10 of every medal, on every number', () => {
    expect(odds.rtp).toEqual(fraction(9, 10));
    expect(odds.edge).toEqual(fraction(1, 10));
    for (const spot of odds.spots) expect(spot.rtp, `×${spot.spot}`).toEqual(fraction(9, 10));
  });

  it('add up exactly over all 43,200 ways a spin can be drawn', () => {
    expect(DRAWS).toBe(43_200);
    const back = Object.fromEntries(SPOTS.map((spot) => [spot, 0])) as Record<Spot, number>;
    const hits = Object.fromEntries(SPOTS.map((spot) => [spot, 0])) as Record<Spot, number>;
    let draws = 0;
    let bonuses = 0;
    let tops = 0;
    for (const spin of everyDraw()) {
      draws += 1;
      for (const spot of SPOTS) {
        const won = winOf({ [spot]: 1 }, spin);
        back[spot] += won;
        if (won > 0) hits[spot] += 1;
      }
      const result = resultOf(spin);
      if (result.bonus) bonuses += 1;
      if (result.bonus && result.spot === 40 && result.multiplier === 10) tops += 1;
    }
    expect(draws).toBe(DRAWS);
    // 9/10 of 43,200 medals, on every number, to the medal.
    for (const spot of SPOTS) expect(back[spot], `×${spot}`).toBe(38_880);
    for (const spot of odds.spots) expect(fraction(hits[spot.spot], DRAWS)).toEqual(spot.hit);
    expect(fraction(bonuses, DRAWS)).toEqual(odds.bonus);
    expect(fraction(tops, DRAWS)).toEqual(odds.top);
  });

  it('publish each number’s figures: hit once in 50 spins per segment, a BONUS once in 13.5, the ×400 once in 10,800', () => {
    expect(odds.bonus).toEqual(fraction(2, 27));
    expect(odds.lampMean).toEqual(fraction(43, 16));
    expect(odds.top).toEqual(fraction(1, 10_800));
    const two = odds.spots.find((spot) => spot.spot === 2)!;
    expect(two.first).toEqual(fraction(10, 27));
    expect(two.second).toEqual(fraction(8, 270));
    expect(two.hit).toEqual(fraction(2, 5));
    const forty = odds.spots.find((spot) => spot.spot === 40)!;
    expect(forty.hit).toEqual(fraction(1, 50));
    expect(forty.pays.map((pay) => pay.multiple)).toEqual([0, 40, 80, 120, 400]);
    for (const spot of odds.spots) {
      expect(spot.hit, `×${spot.spot}`).toEqual(fraction(spot.segments, NUMBER_SEGMENT_COUNT));
      // The second chance's share of the return: the BONUS segments' chance times the lamps' mean, out of 9/10.
      expect(spot.bonusShare, `×${spot.spot}`).toEqual(fraction(172, 972));
      const total = spot.pays.reduce((sum, pay) => sum + valueOf(pay.chance), 0);
      expect(total).toBeCloseTo(1, 12);
      expect(spot.pays.reduce((sum, pay) => sum + pay.multiple * valueOf(pay.chance), 0)).toBeCloseTo(0.9, 12);
    }
    // The spread grows with the number: ×2 is steady, ×40 swings.
    expect(two.sd).toBeCloseTo(1.4028, 3);
    expect(forty.sd).toBeCloseTo(7.3993, 3);
  });

  it('come out as published when the wheel is spun as the machine spins it', () => {
    const check = checkSpins(200_000, seeded(20_261_018));
    for (const spot of SPOTS) expect(check.back[spot], `×${spot}`).toBeGreaterThan(0.8);
    for (const spot of SPOTS) expect(check.back[spot], `×${spot}`).toBeLessThan(1.0);
    expect(check.bonuses / check.spins).toBeCloseTo(2 / 27, 2);
  });

  it('seeds the look of a spin from its name, the same name the same seed', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
    const a = seeded(5);
    const b = seeded(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
