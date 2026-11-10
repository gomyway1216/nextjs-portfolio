import { describe, expect, it } from 'vitest';
import { generateCandidates, runTrial } from '@/components/game/SecretaryProblem/engine';
import { getStrings } from '@/components/game/SecretaryProblem/i18n';
import { reviewRound } from '@/components/game/SecretaryProblem/review';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('reviewRound', () => {
  it('reports a rule win when the best is the first record after the skipped block', () => {
    // skip [3, 1]; 2 does not beat 3; 5 does and is the best.
    const review = reviewRound([3, 1, 2, 5, 4], 2, 3);
    expect(review.bestIndex).toBe(3);
    expect(review.bestValue).toBe(5);
    expect(review.bestInObservation).toBe(false);
    expect(review.rule).toEqual({ pickedIndex: 3, picked: 5, won: true, forcedLast: false });
    expect(review.playerWon).toBe(true);
    expect(review.comparison).toBe('same');
  });

  it('reports a rule miss when an earlier record hides the best', () => {
    // skip [2, 1]; 4 beats 2 and is hired, but 5 comes later.
    const review = reviewRound([2, 1, 4, 5, 3], 2, 3);
    expect(review.bestIndex).toBe(3);
    expect(review.bestInObservation).toBe(false);
    expect(review.rule).toEqual({ pickedIndex: 2, picked: 4, won: false, forcedLast: false });
    expect(review.playerWon).toBe(true);
    expect(review.comparison).toBe('later');
  });

  it('flags the best sitting in the skipped block and the forced last pick', () => {
    const review = reviewRound([5, 1, 2, 4, 3], 2, 3);
    expect(review.bestIndex).toBe(0);
    expect(review.bestInObservation).toBe(true);
    expect(review.rule).toEqual({ pickedIndex: 4, picked: 3, won: false, forcedLast: true });
    expect(review.playerWon).toBe(false);
    expect(review.comparison).toBe('earlier');
  });

  it('treats both sides ending on the last candidate as the same pick', () => {
    const review = reviewRound([5, 1, 2, 4, 3], 2, 4);
    expect(review.comparison).toBe('same');
    expect(review.playerWon).toBe(false);
  });

  it('counts a player hiring the best inside the skipped block as a win the rule cannot match', () => {
    const review = reviewRound([1, 5, 2, 4, 3], 2, 1);
    expect(review.playerWon).toBe(true);
    expect(review.rule.won).toBe(false);
    expect(review.comparison).toBe('earlier');
  });

  it('agrees with runTrial on random orders', () => {
    const rng = mulberry32(7);
    for (let k = 0; k < 300; k++) {
      const n = 5 + Math.floor(rng() * 46);
      const r = Math.round(n / Math.E);
      const cands = generateCandidates(n, rng);
      const playerIndex = Math.floor(rng() * n);
      const review = reviewRound(cands, r, playerIndex);
      const trial = runTrial(cands, r);
      expect(review.rule.pickedIndex).toBe(trial.pickedIndex);
      expect(review.rule.picked).toBe(trial.picked);
      expect(review.rule.won).toBe(trial.isBest);
      expect(review.rule.forcedLast).toBe(trial.forcedLast);
      expect(cands[review.bestIndex]).toBe(n);
      expect(review.playerWon).toBe(cands[playerIndex] === n);
      // The rule can never win when the best is inside the skipped block.
      if (review.bestInObservation) expect(review.rule.won).toBe(false);
    }
  });

  it('rejects an out-of-range player pick and an empty order', () => {
    expect(() => reviewRound([1, 2, 3], 1, 3)).toThrow();
    expect(() => reviewRound([1, 2, 3], 1, -1)).toThrow();
    expect(() => reviewRound([], 0, 0)).toThrow();
  });
});

describe('round review strings', () => {
  it('are present and distinct in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    const render = (t: typeof en) => [
      t.ruleWins,
      t.ruleWinRate,
      t.legendReview,
      t.markBest,
      t.markRulePick,
      t.reviewHeading,
      t.reviewBest(7, 20, 20),
      t.reviewBestInObservation(7),
      t.reviewBestInDecision,
      t.reviewRulePick(7, 12, 18),
      t.reviewRuleForced(7, 20, 3),
      t.reviewRuleHit,
      t.reviewRuleMiss,
      t.reviewSame,
      t.reviewEarlier(5, 12),
      t.reviewLater(15, 12),
    ];
    const enOut = render(en);
    const jaOut = render(ja);
    enOut.forEach((s, i) => {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(jaOut[i].trim().length).toBeGreaterThan(0);
      expect(jaOut[i]).not.toBe(s);
    });
    expect(en.reviewEarlier(5, 12)).toContain('#5');
    expect(en.reviewEarlier(5, 12)).toContain('#12');
    expect(ja.reviewLater(15, 12)).toContain('15');
  });
});
