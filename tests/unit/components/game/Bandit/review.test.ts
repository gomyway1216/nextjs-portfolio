import { describe, it, expect } from 'vitest';
import { mulberry32, type StrategySummary } from '@/components/game/Bandit/engine';
import {
  REVIEW_STRATEGIES,
  buildReview,
  cumulativeChoiceRegret,
  findBestArms,
  formatRegret,
  reviewGame,
  type Pull,
} from '@/components/game/Bandit/review';

const probs = [0.2, 0.8, 0.5];
const pullsOf = (arms: number[], rewards?: number[]): Pull[] =>
  arms.map((arm, i) => ({ arm, reward: rewards ? rewards[i] : 0 }));

const summary = (strategy: StrategySummary['strategy'], regret: number, reward = 10): StrategySummary => ({
  strategy,
  trials: 300,
  T: 4,
  avgCumReward: [],
  avgCumRegret: [],
  meanFinalReward: reward,
  meanFinalRegret: regret,
});

describe('cumulativeChoiceRegret', () => {
  it('adds the gap to the best arm for every pull', () => {
    const r = cumulativeChoiceRegret([0, 1, 2, 1], probs);
    expect(r).toHaveLength(4);
    expect(r[0]).toBeCloseTo(0.6);
    expect(r[1]).toBeCloseTo(0.6);
    expect(r[2]).toBeCloseTo(0.9);
    expect(r[3]).toBeCloseTo(0.9);
  });

  it('is exactly zero when only the best arm is pulled', () => {
    expect(cumulativeChoiceRegret([1, 1, 1], probs)).toEqual([0, 0, 0]);
  });

  it('returns an empty series for no pulls', () => {
    expect(cumulativeChoiceRegret([], probs)).toEqual([]);
  });
});

describe('findBestArms', () => {
  it('returns every arm tied for the highest probability', () => {
    expect(findBestArms(probs)).toEqual([1]);
    expect(findBestArms([0.7, 0.3, 0.7])).toEqual([0, 2]);
  });
});

describe('buildReview', () => {
  it('ignores payout luck in the player regret but reports the actual reward', () => {
    const lucky = buildReview(pullsOf([0, 0], [1, 1]), probs, []);
    const unlucky = buildReview(pullsOf([0, 0], [0, 0]), probs, []);
    expect(lucky.rows[0].regret).toBeCloseTo(1.2);
    expect(unlucky.rows[0].regret).toBeCloseTo(1.2);
    expect(lucky.rows[0].reward).toBe(2);
    expect(unlucky.rows[0].reward).toBe(0);
  });

  it('orders rows by regret and counts only strictly worse strategies as beaten', () => {
    // Player regret: 0.6 + 0 + 0.3 + 0 = 0.9
    const pulls = pullsOf([0, 1, 2, 1]);
    const playerRegret = cumulativeChoiceRegret([0, 1, 2, 1], probs)[3];
    const review = buildReview(pulls, probs, [
      summary('thompson', 0.4),
      summary('ucb1', playerRegret),
      summary('random', 1.5),
    ]);
    expect(review.rows.map((r) => r.id)).toEqual(['thompson', 'player', 'ucb1', 'random']);
    expect(review.beaten).toBe(1);
    expect(review.horizon).toBe(4);
    expect(review.trials).toBe(300);
  });

  it('lists the player above a strategy with identical regret', () => {
    const review = buildReview(pullsOf([1, 1]), probs, [summary('greedy', 0)]);
    expect(review.rows.map((r) => r.id)).toEqual(['player', 'greedy']);
    expect(review.beaten).toBe(0);
  });

  it('counts pulls on any arm tied for best', () => {
    const review = buildReview(pullsOf([0, 1, 2, 2]), [0.7, 0.3, 0.7], []);
    expect(review.bestArms).toEqual([0, 2]);
    expect(review.bestArmPulls).toBe(3);
    expect(review.rows[0].regret).toBeCloseTo(0.4);
  });
});

describe('reviewGame', () => {
  const game = pullsOf(Array.from({ length: 40 }, (_, i) => i % 3));

  it('simulates every review strategy over the player horizon', async () => {
    const review = await reviewGame(game, probs, { trials: 60, rng: mulberry32(5) });
    expect(review).not.toBeNull();
    expect(review!.strategies.map((s) => s.strategy)).toEqual(REVIEW_STRATEGIES);
    for (const s of review!.strategies) {
      expect(s.T).toBe(40);
      expect(s.trials).toBe(60);
      expect(s.avgCumRegret).toHaveLength(40);
    }
    expect(review!.playerRegret).toHaveLength(40);
    expect(review!.rows).toHaveLength(REVIEW_STRATEGIES.length + 1);
    const regrets = review!.rows.map((r) => r.regret);
    expect([...regrets].sort((a, b) => a - b)).toEqual(regrets);
  });

  it('is reproducible with a seeded rng', async () => {
    const a = await reviewGame(game, probs, { trials: 40, rng: mulberry32(9) });
    const b = await reviewGame(game, probs, { trials: 40, rng: mulberry32(9) });
    expect(a!.rows).toEqual(b!.rows);
  });

  it('puts round-robin play near the random strategy and behind Thompson', async () => {
    const review = await reviewGame(game, probs, { trials: 300, rng: mulberry32(11) });
    const byId = Object.fromEntries(review!.rows.map((r) => [r.id, r.regret]));
    // 40 round-robin pulls: 14 on arm 0 (gap 0.6) and 13 on arm 2 (gap 0.3).
    expect(byId.player).toBeCloseTo(14 * 0.6 + 13 * 0.3, 6);
    // Random averages (0.6 + 0 + 0.3) / 3 per pull = 12 over 40 pulls.
    expect(byId.random).toBeGreaterThan(10.5);
    expect(byId.random).toBeLessThan(13.5);
    expect(byId.thompson).toBeLessThan(byId.player);
  });

  it('resolves to null when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await reviewGame(game, probs, { signal: controller.signal, trials: 20 })).toBeNull();
  });

  it('rejects when the game cannot be simulated', async () => {
    await expect(reviewGame([], probs, { trials: 20 })).rejects.toThrow();
  });
});

describe('formatRegret', () => {
  it('uses two decimals', () => {
    expect(formatRegret(0)).toBe('0.00');
    expect(formatRegret(3.456)).toBe('3.46');
  });

  it('never shows a non-zero regret as 0.00', () => {
    expect(formatRegret(0.0001)).toBe('<0.01');
    expect(formatRegret(0.0049)).toBe('<0.01');
  });
});
