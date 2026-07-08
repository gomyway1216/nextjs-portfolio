import { describe, expect, it } from 'vitest';

import {
  BASE_ROUND_SCORE,
  DIFFICULTY_ORDER,
  DIFFICULTY_TUNING,
  markerPosition,
  pickTargetCenter,
  precisionFor,
  ratingFor,
  scoreRound,
  summarizeRun,
  type RoundResult,
} from '@/components/game/TimedButton/gameLogic';

describe('markerPosition', () => {
  it('starts at 0 and returns a triangle wave across a full period', () => {
    const period = 1000;
    expect(markerPosition(0, period)).toBeCloseTo(0);
    expect(markerPosition(250, period)).toBeCloseTo(0.5); // quarter -> halfway right
    expect(markerPosition(500, period)).toBeCloseTo(1); // half -> far right
    expect(markerPosition(750, period)).toBeCloseTo(0.5); // three-quarters -> back to middle
    expect(markerPosition(1000, period)).toBeCloseTo(0); // full period -> back to start
  });

  it('stays within [0, 1] for arbitrary elapsed times', () => {
    const period = 1337;
    for (let t = 0; t < 5000; t += 37) {
      const pos = markerPosition(t, period);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
    }
  });

  it('is periodic', () => {
    const period = 900;
    expect(markerPosition(123, period)).toBeCloseTo(markerPosition(123 + period, period));
    expect(markerPosition(123, period)).toBeCloseTo(markerPosition(123 + period * 4, period));
  });

  it('handles negative elapsed gracefully via modulo', () => {
    const period = 1000;
    const pos = markerPosition(-250, period);
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThanOrEqual(1);
  });

  it('returns 0 for a non-positive period', () => {
    expect(markerPosition(500, 0)).toBe(0);
    expect(markerPosition(500, -100)).toBe(0);
  });
});

describe('precisionFor', () => {
  const halfWidth = 0.1;

  it('is 1 when dead-centre on the target', () => {
    expect(precisionFor(0.5, 0.5, halfWidth)).toBe(1);
  });

  it('is 0 exactly at the edge of the zone', () => {
    expect(precisionFor(0.6, 0.5, halfWidth)).toBeCloseTo(0);
    expect(precisionFor(0.4, 0.5, halfWidth)).toBeCloseTo(0);
  });

  it('falls off linearly inside the zone', () => {
    // halfway to the edge -> 0.5 precision
    expect(precisionFor(0.55, 0.5, halfWidth)).toBeCloseTo(0.5);
    expect(precisionFor(0.45, 0.5, halfWidth)).toBeCloseTo(0.5);
  });

  it('clamps to 0 outside the zone (never negative)', () => {
    expect(precisionFor(0.9, 0.5, halfWidth)).toBe(0);
    expect(precisionFor(0.0, 0.5, halfWidth)).toBe(0);
  });

  it('is symmetric around the centre', () => {
    expect(precisionFor(0.53, 0.5, halfWidth)).toBeCloseTo(precisionFor(0.47, 0.5, halfWidth));
  });
});

describe('ratingFor', () => {
  it('maps precision bands to ratings', () => {
    expect(ratingFor(1)).toBe('perfect');
    expect(ratingFor(0.9)).toBe('perfect');
    expect(ratingFor(0.89)).toBe('great');
    expect(ratingFor(0.6)).toBe('great');
    expect(ratingFor(0.59)).toBe('good');
    expect(ratingFor(0.01)).toBe('good');
    expect(ratingFor(0)).toBe('miss');
  });
});

describe('scoreRound', () => {
  const tuning = DIFFICULTY_TUNING.easy;

  it('awards the full base score (times multiplier) for a perfect centre hit', () => {
    const result = scoreRound(0.5, 0.5, tuning);
    expect(result.rating).toBe('perfect');
    expect(result.precision).toBe(1);
    expect(result.score).toBe(Math.round(BASE_ROUND_SCORE * tuning.scoreMultiplier));
  });

  it('scores 0 for a complete miss outside the zone', () => {
    const result = scoreRound(0.0, 0.5, tuning);
    expect(result.rating).toBe('miss');
    expect(result.score).toBe(0);
    expect(result.precision).toBe(0);
  });

  it('eases score so centre hits are worth much more than edge hits', () => {
    const nearEdge = scoreRound(0.5 + tuning.targetHalfWidth * 0.5, 0.5, tuning); // precision 0.5
    const centre = scoreRound(0.5, 0.5, tuning); // precision 1
    // Eased (squared) so 0.5 precision -> 0.25 of max, not 0.5.
    expect(nearEdge.score / centre.score).toBeCloseTo(0.25, 2);
  });

  it('applies the difficulty multiplier (harder = more points for the same precision)', () => {
    const easy = scoreRound(0.5, 0.5, DIFFICULTY_TUNING.easy);
    const master = scoreRound(0.5, 0.5, DIFFICULTY_TUNING.master);
    expect(master.score).toBeGreaterThan(easy.score);
  });

  it('reports the absolute distance from the target centre', () => {
    const result = scoreRound(0.55, 0.5, tuning);
    expect(result.distance).toBeCloseTo(0.05);
  });
});

describe('pickTargetCenter', () => {
  it('keeps the whole target zone inside [0, 1]', () => {
    for (const diff of DIFFICULTY_ORDER) {
      const { targetHalfWidth } = DIFFICULTY_TUNING[diff];
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const center = pickTargetCenter(targetHalfWidth, () => r);
        expect(center - targetHalfWidth).toBeGreaterThanOrEqual(0);
        expect(center + targetHalfWidth).toBeLessThanOrEqual(1);
      }
    }
  });

  it('maps rng extremes to the reachable min/max centre', () => {
    const hw = 0.1;
    expect(pickTargetCenter(hw, () => 0)).toBeCloseTo(hw);
    expect(pickTargetCenter(hw, () => 1)).toBeCloseTo(1 - hw);
  });

  it('falls back to 0.5 when the zone cannot fit', () => {
    expect(pickTargetCenter(0.6, () => 0.5)).toBe(0.5);
  });
});

describe('summarizeRun', () => {
  const make = (rating: RoundResult['rating'], precision: number, score: number): RoundResult => ({
    rating,
    precision,
    score,
    distance: 0,
  });

  it('returns a zeroed summary for an empty run', () => {
    const s = summarizeRun([]);
    expect(s.totalScore).toBe(0);
    expect(s.perfects).toBe(0);
    expect(s.averagePrecision).toBe(0);
    expect(s.bestPrecision).toBe(0);
  });

  it('tallies scores, rating counts, and precision stats', () => {
    const results = [
      make('perfect', 1, 3200),
      make('great', 0.7, 1500),
      make('good', 0.4, 600),
      make('miss', 0, 0),
    ];
    const s = summarizeRun(results);
    expect(s.totalScore).toBe(5300);
    expect(s.perfects).toBe(1);
    expect(s.greats).toBe(1);
    expect(s.goods).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.bestPrecision).toBe(1);
    expect(s.averagePrecision).toBeCloseTo((1 + 0.7 + 0.4 + 0) / 4);
  });
});

describe('difficulty tuning invariants', () => {
  it('gets strictly harder from easy to master', () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = DIFFICULTY_TUNING[DIFFICULTY_ORDER[i - 1]];
      const cur = DIFFICULTY_TUNING[DIFFICULTY_ORDER[i]];
      expect(cur.periodMs).toBeLessThan(prev.periodMs); // faster sweep
      expect(cur.targetHalfWidth).toBeLessThan(prev.targetHalfWidth); // narrower zone
      expect(cur.scoreMultiplier).toBeGreaterThan(prev.scoreMultiplier); // higher reward
    }
  });

  it('keeps every target zone narrower than half the track so a centre exists', () => {
    for (const diff of DIFFICULTY_ORDER) {
      expect(DIFFICULTY_TUNING[diff].targetHalfWidth).toBeLessThan(0.5);
    }
  });
});
