import { beforeAll, describe, expect, it } from 'vitest';

import { analyzeHand, tables, type Tables } from '@/components/game/VideoPoker/analysis';
import { PAY_TABLES } from '@/components/game/VideoPoker/engine';
import { PRECOMPUTED, STRATEGY_PAYBACK } from '@/components/game/VideoPoker/precomputed';
import {
  POLICIES,
  STRATEGY_IDS,
  logCheckpoints,
  madeOnlyPolicy,
  optimalPolicy,
  policyPayback,
  seededRng,
  simplePolicy,
  simulateSessions,
  simulateStrategies,
} from '@/components/game/VideoPoker/sim';

const RANKS = '23456789TJQKA';
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
const PAYS = PAY_TABLES['9/6'];

let t: Tables;
beforeAll(() => {
  t = tables();
}, 30_000);

/** The cards a policy holds, as labels in the order given. */
function holds(policy: typeof simplePolicy, ...cards: string[]): string[] {
  const order = cards.map((label) => ({ label, card: c(label) })).sort((a, b) => a.card - b.card);
  const mask = policy(order.map((o) => o.card), PAYS, new Int32Array(32 * 9), t);
  const kept = new Set(order.filter((_, i) => mask & (1 << i)).map((o) => o.label));
  return cards.filter((label) => kept.has(label));
}

describe('strategies', () => {
  it('plays the common-sense rules in order', () => {
    expect(holds(simplePolicy, '5♠', '6♥', '7♦', '8♣', '9♠')).toHaveLength(5); // made straight
    expect(holds(simplePolicy, '5♠', '5♥', '9♥', 'K♥', '2♥')).toEqual(['5♠', '5♥']); // a pair before four to a flush
    expect(holds(simplePolicy, '7♠', '7♥', 'K♦', 'K♣', '2♠')).toEqual(['7♠', '7♥', 'K♦', 'K♣']);
    expect(holds(simplePolicy, '3♥', '9♥', 'K♥', '2♥', '8♠')).toEqual(['3♥', '9♥', 'K♥', '2♥']);
    expect(holds(simplePolicy, 'J♠', 'A♥', '3♦', '8♣', '2♠')).toEqual(['J♠', 'A♥']);
    expect(holds(simplePolicy, '4♠', '9♥', '3♦', '8♣', '2♠')).toEqual([]);
  });

  it('keeps only made paying hands in the made-only strategy', () => {
    expect(holds(madeOnlyPolicy, 'J♠', 'J♥', '3♦', '8♣', '2♠')).toEqual(['J♠', 'J♥']);
    expect(holds(madeOnlyPolicy, '5♠', '5♥', '3♦', '8♣', '2♠')).toEqual([]); // a low pair pays nothing
    expect(holds(madeOnlyPolicy, '7♠', '7♥', '7♦', 'K♣', '2♠')).toEqual(['7♠', '7♥', '7♦']);
    expect(holds(madeOnlyPolicy, '2♣', '9♣', 'J♣', 'K♣', '4♣')).toHaveLength(5);
    expect(holds(madeOnlyPolicy, 'A♠', 'K♠', 'Q♠', 'J♠', '4♥')).toEqual([]);
  });

  it('picks the same best hold as the full hand analysis', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 300; i++) {
      const hand = new Set<number>();
      while (hand.size < 5) hand.add(Math.floor(rng() * 52));
      const sorted = [...hand].sort((a, b) => a - b);
      const mask = optimalPolicy(sorted, PAYS, new Int32Array(32 * 9), t);
      const all = analyzeHand(sorted, PAYS);
      expect(all.find((h) => h.mask === mask)!.ev).toBeCloseTo(all[0].ev, 12);
    }
  });

  it.each(STRATEGY_IDS)('has the stored exact payback for %s', (id) => {
    expect(policyPayback(POLICIES[id], PAYS, t)).toBeCloseTo(STRATEGY_PAYBACK[id], 12);
  });

  it('ranks the strategies: perfect play, then the rules, then made hands only', () => {
    expect(STRATEGY_PAYBACK.optimal).toBe(PRECOMPUTED['9/6'].payback);
    expect(STRATEGY_PAYBACK.simple).toBeCloseTo(0.971267, 6);
    expect(STRATEGY_PAYBACK.madeOnly).toBeCloseTo(0.730847, 6);
  });
});

describe('simulateStrategies', () => {
  it('plays every strategy on the same deals and lands near each exact payback', async () => {
    const hands = 60_000;
    const res = (await simulateStrategies(hands, PAYS, {}, 2024))!;
    for (const id of STRATEGY_IDS) {
      expect(res[id].points.at(-1)).toEqual({ hands, payback: res[id].payback });
      expect(Math.abs(res[id].payback - STRATEGY_PAYBACK[id]), id).toBeLessThan(4.5 * res[id].se);
    }
    expect(res.optimal.differed).toBe(0);
    expect(res.simple.differed).toBeGreaterThan(0.05 * hands);
    expect(res.madeOnly.differed).toBeGreaterThan(res.simple.differed);
    const again = (await simulateStrategies(2_000, PAYS, {}, 2024))!;
    expect(again.optimal.points[0]).toEqual(res.optimal.points[0]);
  });

  it('can be aborted — before it starts and between chunks — and rejects bad input', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await simulateStrategies(5, PAYS, { signal: controller.signal })).toBeNull();
    expect(await simulateStrategies(10_001, PAYS, { signal: controller.signal })).toBeNull();
    await expect(simulateStrategies(0, PAYS)).rejects.toThrow(/positive integer/);
    expect(logCheckpoints(1_000)[0]).toBe(100);
    expect(logCheckpoints(1_000).at(-1)).toBe(1_000);
    expect(() => seededRng(Number.NaN)).toThrow(/finite/);
    for (const seed of [-7, 0, 2.5, 2 ** 40]) {
      const x = seededRng(seed)();
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('simulateSessions', () => {
  it('summarizes sessions of perfect play', async () => {
    const res = (await simulateSessions(200, 200, PAYS, {}, 77))!;
    expect(res.nets).toHaveLength(200);
    expect(res.mean).toBeCloseTo(res.nets.reduce((a, b) => a + b, 0) / 200, 9);
    expect(res.ahead).toBeCloseTo(res.nets.filter((n) => n > 0).length / 200, 12);
    // Every hand costs five coins and pays a multiple of five.
    expect(res.nets.every((n) => n % 5 === 0 && n >= -1_000)).toBe(true);
    // The skew: the typical session is below the average one.
    expect(res.median).toBeLessThan(res.mean + 1);
    const again = (await simulateSessions(200, 200, PAYS, {}, 77))!;
    expect(again.nets).toEqual(res.nets);
  });

  it('can be aborted and rejects bad input', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await simulateSessions(5, 5, PAYS, { signal: controller.signal })).toBeNull();
    await expect(simulateSessions(0, 10, PAYS)).rejects.toThrow(/positive integer/);
    await expect(simulateSessions(10, 0, PAYS)).rejects.toThrow(/positive integer/);
  });
});
