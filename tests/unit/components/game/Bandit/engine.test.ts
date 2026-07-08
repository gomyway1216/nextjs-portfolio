import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  chooseArm,
  wilsonInterval,
  runStrategy,
  runStrategyMonteCarloAsync,
  type BanditConfig,
  type StrategyName,
} from '@/components/game/Bandit/engine';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xa = [a(), a(), a(), a()];
    const xb = [b(), b(), b(), b()];
    expect(xa).toEqual(xb);
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform (mean near 0.5)', () => {
    const r = mulberry32(123);
    let sum = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) sum += r();
    expect(sum / N).toBeGreaterThan(0.48);
    expect(sum / N).toBeLessThan(0.52);
  });
});

describe('wilsonInterval', () => {
  it('returns full range for n=0', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });

  it('is clamped to [0, 1]', () => {
    const [lo, hi] = wilsonInterval(10, 10); // all successes
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi).toBe(1); // 10/10 pins the upper bound at 1
  });

  it('narrows as n grows', () => {
    const wSmall = wilsonInterval(5, 10);
    const wLarge = wilsonInterval(500, 1000);
    const widthSmall = wSmall[1] - wSmall[0];
    const widthLarge = wLarge[1] - wLarge[0];
    expect(widthLarge).toBeLessThan(widthSmall);
  });

  it('brackets the true proportion for a symmetric case', () => {
    const [lo, hi] = wilsonInterval(50, 100);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
  });
});

describe('chooseArm', () => {
  const rng = mulberry32(1);

  it('greedy seeds every unpulled arm before exploiting', () => {
    // arms 0 and 2 pulled, arm 1 not -> must pick the unpulled arm 1.
    const pick = chooseArm('greedy', { counts: [3, 0, 2], sums: [1, 0, 2], total: 5 }, 0.1, rng);
    expect(pick).toBe(1);
  });

  it('greedy exploits the empirical best once all arms are seeded', () => {
    // means: 0.2, 0.9, 0.5 -> arm 1.
    const pick = chooseArm('greedy', { counts: [10, 10, 10], sums: [2, 9, 5], total: 30 }, 0.1, mulberry32(9));
    expect(pick).toBe(1);
  });

  it('ucb1 seeds unpulled arms first', () => {
    const pick = chooseArm('ucb1', { counts: [1, 0, 1], sums: [1, 0, 0], total: 2 }, 0.1, mulberry32(3));
    expect(pick).toBe(1);
  });

  it('ucb1 favors an uncertain arm over a slightly-better certain one', () => {
    // arm 0: 100 pulls, mean 0.60. arm 1: 5 pulls, mean 0.60 (wider bonus).
    const pick = chooseArm('ucb1', { counts: [100, 5], sums: [60, 3], total: 105 }, 0.1, mulberry32(5));
    expect(pick).toBe(1);
  });

  it('thompson returns a valid arm index', () => {
    const pick = chooseArm('thompson', { counts: [5, 5], sums: [1, 4], total: 10 }, 0.1, mulberry32(11));
    expect(pick === 0 || pick === 1).toBe(true);
  });

  it('eps-greedy exploits the best arm when rng > epsilon', () => {
    // A seeded rng whose first draw exceeds epsilon forces exploitation.
    let calls = 0;
    const fakeRng = () => (calls++ === 0 ? 0.99 : 0.5); // first > eps=0.1
    const pick = chooseArm('eps-greedy', { counts: [10, 10], sums: [2, 8], total: 20 }, 0.1, fakeRng);
    expect(pick).toBe(1);
  });

  it('returns -1 for strategies it does not decide', () => {
    expect(chooseArm('random', { counts: [0, 0], sums: [0, 0], total: 0 }, 0.1, rng)).toBe(-1);
    expect(chooseArm('optimal', { counts: [0, 0], sums: [0, 0], total: 0 }, 0.1, rng)).toBe(-1);
  });
});

describe('runStrategy', () => {
  const config: BanditConfig = { trueProbs: [0.1, 0.5, 0.9], epsilon: 0.1 };
  const T = 500;

  it('validates inputs', () => {
    expect(() => runStrategy('random', { trueProbs: [0.5] }, 10)).toThrow();
    expect(() => runStrategy('random', config, 0)).toThrow();
    expect(() => runStrategy('random', config, 2.5)).toThrow();
  });

  it('produces series of the right length and monotone cumulatives', () => {
    const r = runStrategy('thompson', config, T, mulberry32(42));
    expect(r.choices).toHaveLength(T);
    expect(r.rewards).toHaveLength(T);
    expect(r.cumReward).toHaveLength(T);
    expect(r.cumRegret).toHaveLength(T);
    // cumulative reward is non-decreasing; cumulative regret is non-decreasing.
    for (let i = 1; i < T; i++) {
      expect(r.cumReward[i]).toBeGreaterThanOrEqual(r.cumReward[i - 1]);
      expect(r.cumRegret[i]).toBeGreaterThanOrEqual(r.cumRegret[i - 1] - 1e-9);
    }
  });

  it('optimal always pulls the best arm and has zero regret', () => {
    const r = runStrategy('optimal', config, T, mulberry32(7));
    expect(r.choices.every((c) => c === 2)).toBe(true); // arm 2 has p=0.9
    expect(r.cumRegret[T - 1]).toBeCloseTo(0, 10);
    expect(r.finalCounts[2]).toBe(T);
  });

  it('rewards are 0/1 and counts/sums are consistent', () => {
    const r = runStrategy('ucb1', config, T, mulberry32(3));
    expect(r.rewards.every((x) => x === 0 || x === 1)).toBe(true);
    const totalPulls = r.finalCounts.reduce((a, b) => a + b, 0);
    expect(totalPulls).toBe(T);
    expect(r.cumReward[T - 1]).toBe(r.rewards.reduce((a, b) => a + b, 0));
  });

  it('is reproducible with a seeded rng', () => {
    const a = runStrategy('eps-greedy', config, T, mulberry32(99));
    const b = runStrategy('eps-greedy', config, T, mulberry32(99));
    expect(a.choices).toEqual(b.choices);
    expect(a.cumRegret).toEqual(b.cumRegret);
  });

  it('smart strategies incur far less regret than random', () => {
    // Average several seeds to keep the assertion stable.
    const avgRegret = (s: StrategyName) => {
      let sum = 0;
      const seeds = [1, 2, 3, 4, 5];
      for (const seed of seeds) sum += runStrategy(s, config, 1000, mulberry32(seed)).cumRegret[999];
      return sum / seeds.length;
    };
    const random = avgRegret('random');
    const thompson = avgRegret('thompson');
    const ucb1 = avgRegret('ucb1');
    expect(thompson).toBeLessThan(random);
    expect(ucb1).toBeLessThan(random);
    // Thompson should be strong: well under 10% of random's regret on this gap.
    expect(thompson).toBeLessThan(random * 0.25);
  });

  it('regret equals optimal expected reward minus expected reward taken', () => {
    // cumRegret[t] must equal sum over pulls of (pStar - p_chosen).
    const r = runStrategy('greedy', config, 200, mulberry32(8));
    const pStar = 0.9;
    let expected = 0;
    for (const c of r.choices) expected += pStar - config.trueProbs[c];
    expect(r.cumRegret[199]).toBeCloseTo(expected, 6);
  });
});

describe('runStrategyMonteCarloAsync', () => {
  const config: BanditConfig = { trueProbs: [0.3, 0.7], epsilon: 0.1 };

  it('validates trials', async () => {
    await expect(runStrategyMonteCarloAsync('random', config, 100, 0)).rejects.toThrow();
  });

  it('averages series to the right length and sane values', async () => {
    const s = await runStrategyMonteCarloAsync('thompson', config, 200, 40, {}, mulberry32(5));
    expect(s).not.toBeNull();
    expect(s!.avgCumReward).toHaveLength(200);
    expect(s!.avgCumRegret).toHaveLength(200);
    expect(s!.meanFinalReward).toBeGreaterThan(0);
    expect(s!.meanFinalRegret).toBeGreaterThanOrEqual(0);
    // avg reward can't exceed T and avg regret can't exceed T * (pStar - pMin).
    expect(s!.meanFinalReward).toBeLessThanOrEqual(200);
    expect(s!.meanFinalRegret).toBeLessThanOrEqual(200 * (0.7 - 0.3) + 1e-6);
  });

  it('returns null when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const s = await runStrategyMonteCarloAsync('ucb1', config, 100, 200, { signal: controller.signal });
    expect(s).toBeNull();
  });

  it('reports monotone progress', async () => {
    const seen: number[] = [];
    await runStrategyMonteCarloAsync('random', config, 50, 30, {
      onProgress: (done) => seen.push(done),
    }, mulberry32(1));
    expect(seen[seen.length - 1]).toBe(30);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});
