import { describe, expect, it } from 'vitest';

import { HAND_COUNT, qualifyingHands, strategyOdds } from '@/components/game/ThreeCardPoker/analysis';
import { STRATEGY_IDS, dealRound, decide, settle } from '@/components/game/ThreeCardPoker/engine';
import { STRATEGY_COLORS, exactEdge, logCheckpoints, seededRng, simulateStrategies } from '@/components/game/ThreeCardPoker/sim';

describe('seeded rng', () => {
  it('is reproducible and stays strictly between 0 and 1', () => {
    const a = seededRng(7);
    const b = seededRng(7);
    const first = Array.from({ length: 2000 }, () => a());
    expect(Array.from({ length: 2000 }, () => b())).toEqual(first);
    expect(first.every((x) => x > 0 && x < 1)).toBe(true);
    expect(new Set(first).size).toBe(2000);
    expect(seededRng(8)()).not.toBe(first[0]);
  });

  it('accepts any finite seed and rejects the rest', () => {
    for (const seed of [0, -1, -7.5, 0.25, 1e15, 2147483646, 2147483647, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE]) {
      const rng = seededRng(seed);
      const values = Array.from({ length: 50 }, () => rng());
      expect(values.every((x) => x > 0 && x < 1), String(seed)).toBe(true);
      expect(new Set(values).size, String(seed)).toBe(50);
    }
    // The sign and the fraction are folded away.
    expect(seededRng(-7.5)()).toBe(seededRng(7)());
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(() => seededRng(bad)).toThrow(/finite/);
  });
});

describe('simulation plumbing', () => {
  it('spaces checkpoints on a log scale, ending on the last hand', () => {
    const points = logCheckpoints(100_000);
    expect(points[0]).toBe(100);
    expect(points.at(-1)).toBe(100_000);
    expect(points.every((n, i) => i === 0 || n > points[i - 1])).toBe(true);
    expect(points.length).toBeGreaterThan(30);
    expect(logCheckpoints(50)).toEqual([50]);
  });

  it('compares against the exact edges of the analysis', () => {
    for (const id of STRATEGY_IDS) {
      expect(exactEdge(id)).toBe(strategyOdds(id).houseEdge);
      expect(STRATEGY_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(exactEdge('optimal')).toBeLessThan(exactEdge('mimic'));
    expect(exactEdge('mimic')).toBeLessThan(exactEdge('always'));
  });
});

describe('simulateStrategies', () => {
  it('converges to every exact edge on a fixed seed', async () => {
    const hands = 200_000;
    const res = (await simulateStrategies(hands, {}, 7))!;
    expect(res.hands).toBe(hands);
    for (const id of STRATEGY_IDS) {
      const s = res.strategies[id];
      expect(s.points.at(-1)).toEqual({ hands, edge: s.edge });
      expect(s.wins + s.pushes + s.losses).toBe(hands);
      expect(s.wagered).toBe(hands + s.played);
      expect(s.se).toBeGreaterThan(0.003);
      expect(s.se).toBeLessThan(0.005);
      expect(Math.abs(s.edge - exactEdge(id)), id).toBeLessThan(4.5 * s.se);
    }
    // How often each strategy plays, and how often the dealer qualifies.
    const binomial = (count: number, p: number) => Math.abs(count / hands - p) / Math.sqrt((p * (1 - p)) / hands);
    expect(res.strategies.always.played).toBe(hands);
    expect(binomial(res.strategies.optimal.played, strategyOdds('optimal').playRate)).toBeLessThan(4.5);
    expect(binomial(res.strategies.mimic.played, strategyOdds('mimic').playRate)).toBeLessThan(4.5);
    expect(binomial(res.dealerQualified, qualifyingHands() / HAND_COUNT)).toBeLessThan(4.5);
  });

  it('plays all three strategies on the same deals, through the engine', async () => {
    const hands = 4000;
    const seed = 314159;
    const res = (await simulateStrategies(hands, {}, seed))!;
    // Replay the same seeded deals by hand.
    const rng = seededRng(seed);
    const sums = STRATEGY_IDS.map(() => 0);
    const played = STRATEGY_IDS.map(() => 0);
    let qualified = 0;
    for (let i = 0; i < hands; i++) {
      const { player, dealer } = dealRound(rng);
      STRATEGY_IDS.forEach((id, k) => {
        const decision = decide(id, player);
        const s = settle({ ante: 1, pairPlus: 0 }, decision, player, dealer);
        sums[k] += s.net;
        if (decision === 'play') played[k]++;
        if (k === 0 && s.dealerQualifies) qualified++;
      });
    }
    STRATEGY_IDS.forEach((id, k) => {
      expect(res.strategies[id].edge, id).toBe(-sums[k] / hands);
      expect(res.strategies[id].played, id).toBe(played[k]);
    });
    expect(res.dealerQualified).toBe(qualified);
    // The three differ only in what they fold.
    expect(res.strategies.optimal.played).toBeLessThan(res.strategies.mimic.played);
    expect(res.strategies.mimic.played).toBeLessThan(hands);
  });

  it('gives the same result for the same seed, and another for another', async () => {
    const a = await simulateStrategies(20_000, {}, 99);
    const b = await simulateStrategies(20_000, {}, 99);
    const c = await simulateStrategies(20_000, {}, 100);
    expect(b).toEqual(a);
    expect(c!.strategies.always.edge).not.toBe(a!.strategies.always.edge);
    // Any finite seed works; an unseeded run picks its own.
    expect((await simulateStrategies(1000, {}, -12.75))!.hands).toBe(1000);
    expect((await simulateStrategies(1000))!.hands).toBe(1000);
  });

  it('reports progress at every yield and once more at the end', async () => {
    const seen: [number, number][] = [];
    await simulateStrategies(25_000, { onProgress: (done, total) => seen.push([done, total]) }, 5);
    expect(seen).toEqual([
      [10_000, 25_000],
      [20_000, 25_000],
      [25_000, 25_000],
    ]);
  });

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const res = await simulateStrategies(50_000, { signal: controller.signal, onProgress: () => calls++ }, 1);
    expect(res).toBeNull();
    expect(calls).toBe(0);
  });

  it('stops at the next yield when aborted mid-run', async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    const res = await simulateStrategies(
      100_000,
      {
        signal: controller.signal,
        onProgress: (done) => {
          seen.push(done);
          controller.abort();
        },
      },
      3,
    );
    expect(res).toBeNull();
    expect(seen).toEqual([10_000]);
  });

  it('rejects invalid input', async () => {
    for (const bad of [0, -5, 1.5, Number.NaN, Infinity]) {
      await expect(simulateStrategies(bad), String(bad)).rejects.toThrow(/positive integer/);
    }
    await expect(simulateStrategies(100, {}, Number.NaN)).rejects.toThrow(/finite/);
    await expect(simulateStrategies(100, {}, Infinity)).rejects.toThrow(/finite/);
  });
});
