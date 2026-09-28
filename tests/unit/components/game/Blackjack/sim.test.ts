import { describe, expect, it } from 'vitest';

import { gameValue } from '@/components/game/Blackjack/analysis';
import { RANKS, STRATEGIES, playRound, type Card, type Shoe } from '@/components/game/Blackjack/engine';
import { STRATEGY_IDS, chartValue, exactEdge, logCheckpoints, simulateStrategies } from '@/components/game/Blackjack/sim';

describe('blackjack simulation', () => {
  it('knows each strategy’s exact infinite-deck edge', () => {
    // The six-deck chart gives up a sliver against perfect play (its two close soft doubles).
    expect(exactEdge('basic')).toBeCloseTo(0.0051255, 6);
    const gap = gameValue().ev - chartValue();
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1e-4);
    expect(exactEdge('mimic')).toBeCloseTo(0.05675, 4);
    expect(exactEdge('neverBust')).toBeCloseTo(0.06079, 4);
    expect(logCheckpoints(1_000)[0]).toBe(100);
    expect(logCheckpoints(1_000).at(-1)).toBe(1_000);
  });

  it('plays every strategy on real six-deck shoes and lands near its exact edge', async () => {
    const rounds = 40_000;
    const res = (await simulateStrategies(rounds, {}, 1234))!;
    for (const id of STRATEGY_IDS) {
      const s = res[id];
      expect(s.wins + s.pushes + s.losses).toBe(rounds);
      expect(s.points.at(-1)).toEqual({ rounds, edge: s.edge });
      // A six-deck shoe differs from the infinite deck by a tenth of a percent — far inside the noise here.
      expect(Math.abs(s.edge - exactEdge(id)), id).toBeLessThan(4.5 * s.se + 0.002);
    }
    // Playing like the dealer never doubles or splits; basic strategy does both.
    expect(res.mimic.doubles).toBe(0);
    expect(res.mimic.splits).toBe(0);
    expect(res.basic.doubles).toBeGreaterThan(0.08 * rounds);
    expect(res.basic.splits).toBeGreaterThan(0.01 * rounds);
    // Never-bust strategy stands on every stiff hand, so it busts far less.
    expect(res.neverBust.busts).toBeLessThan(res.mimic.busts);
    // The same seed deals the same shoes.
    const again = (await simulateStrategies(2_000, {}, 1234))!;
    expect(again.basic.points[0]).toEqual(res.basic.points[0]);
  });

  it('prices the chart exactly as the engine plays it (statistically, infinite deck)', () => {
    let s = 21;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const cards: Card[] = [];
    for (let i = 0; i < 1_500_000; i++) cards.push({ rank: RANKS[Math.floor(rng() * 13)], suit: '♠' });
    let shoe: Shoe = { decks: 1, cards, next: 0, cutIndex: 1e9 };
    const rounds = 200_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < rounds; i++) {
      const r = playRound(shoe, 1, STRATEGIES.basic, rng);
      shoe = r.shoe;
      sum += r.result!.net;
      sq += r.result!.net ** 2;
    }
    const mean = sum / rounds;
    const se = Math.sqrt((sq / rounds - mean * mean) / rounds);
    expect(Math.abs(mean - chartValue())).toBeLessThan(4 * se);
  });

  it('can be aborted and rejects bad input', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await simulateStrategies(20_001, { signal: controller.signal })).toBeNull();
    await expect(simulateStrategies(0)).rejects.toThrow(/positive integer/);
  });
});
