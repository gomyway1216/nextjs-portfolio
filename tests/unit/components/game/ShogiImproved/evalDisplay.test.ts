import { describe, expect, it } from 'vitest';
import {
  EVAL_WIN_RATE_K,
  MATE_DISPLAY_CP,
  cpToSenteWinRate,
  formatEvalAriaLabel,
  formatEvalValue,
  formatThinkSeconds,
  isMateDisplayScore,
  senteBarPercent,
  senteWinRatePercent,
} from '@/components/game/ShogiImproved/evalDisplay';

/**
 * The eval bar's whole contract is "positive centipawns = 先手 (the human) is
 * better". The worker already converts its negamax root score to SENTE's
 * perspective, so a second flip anywhere here would silently show every game
 * mirrored — exactly the failure mode these tests pin.
 */
describe('cpToSenteWinRate', () => {
  it('is 0.5 at a dead-even score', () => {
    expect(cpToSenteWinRate(0)).toBe(0.5);
  });

  it('rises above 0.5 when SENTE is better and falls below when GOTE is', () => {
    expect(cpToSenteWinRate(400)).toBeGreaterThan(0.5);
    expect(cpToSenteWinRate(-400)).toBeLessThan(0.5);
  });

  it('is symmetric around 0', () => {
    for (const cp of [15, 120, 443, 1800, 5000]) {
      expect(cpToSenteWinRate(cp) + cpToSenteWinRate(-cp)).toBeCloseTo(1, 12);
    }
  });

  it('uses the NNUE k_sigmoid: one K is exactly the logistic half-point', () => {
    expect(EVAL_WIN_RATE_K).toBe(600);
    expect(cpToSenteWinRate(EVAL_WIN_RATE_K)).toBeCloseTo(1 / (1 + Math.E ** -1), 12);
  });

  it('is monotonic in cp', () => {
    const scores = [-3000, -1000, -443, -100, 0, 100, 443, 1000, 3000];
    const rates = scores.map(cpToSenteWinRate);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });

  it('saturates rather than overflowing on engine mate scores', () => {
    // The WASM search reports mate on its own internal scale (S_MATE = 9e7).
    expect(cpToSenteWinRate(90_000_000)).toBe(1);
    expect(cpToSenteWinRate(-90_000_000)).toBe(0);
    expect(Number.isNaN(cpToSenteWinRate(90_000_000))).toBe(false);
  });
});

describe('isMateDisplayScore', () => {
  it('covers both the mate solver (±30000) and the search mate scale', () => {
    expect(isMateDisplayScore(30_000)).toBe(true);
    expect(isMateDisplayScore(-30_000)).toBe(true);
    expect(isMateDisplayScore(90_000_000)).toBe(true);
    expect(isMateDisplayScore(MATE_DISPLAY_CP)).toBe(true);
  });

  it('leaves ordinary (even very large) evaluations alone', () => {
    expect(isMateDisplayScore(2_900)).toBe(false);
    expect(isMateDisplayScore(-2_900)).toBe(false);
    expect(isMateDisplayScore(MATE_DISPLAY_CP - 1)).toBe(false);
  });
});

describe('senteBarPercent', () => {
  it('draws an even position at the midpoint', () => {
    expect(senteBarPercent(0)).toBe(50);
  });

  it('grows toward 先手 for positive scores and shrinks for negative ones', () => {
    expect(senteBarPercent(600)).toBeGreaterThan(50);
    expect(senteBarPercent(-600)).toBeLessThan(50);
    expect(senteBarPercent(600) + senteBarPercent(-600)).toBeCloseTo(100, 6);
  });

  it('keeps a sliver for the losing side unless it is mate', () => {
    expect(senteBarPercent(-8_000)).toBeGreaterThanOrEqual(2);
    expect(senteBarPercent(8_000)).toBeLessThanOrEqual(98);
  });

  it('paints the full bar only for mate scores', () => {
    expect(senteBarPercent(30_000)).toBe(100);
    expect(senteBarPercent(-30_000)).toBe(0);
    expect(senteBarPercent(90_000_000)).toBe(100);
  });

  it('stays within the track', () => {
    for (const cp of [-90_000_000, -5_000, -443, 0, 443, 5_000, 90_000_000]) {
      const percent = senteBarPercent(cp);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe('senteWinRatePercent', () => {
  it('reports the engine-calibrated win rate', () => {
    expect(senteWinRatePercent(0)).toBe(50);
    // A book-exit lean of -443cp is a 32% bar, not a lost game.
    expect(senteWinRatePercent(-443)).toBe(32);
    expect(senteWinRatePercent(443)).toBe(68);
  });

  it('is 100/0 for mate', () => {
    expect(senteWinRatePercent(30_000)).toBe(100);
    expect(senteWinRatePercent(-30_000)).toBe(0);
  });
});

describe('formatEvalValue', () => {
  it('signs the score from SENTE\'s perspective and appends the depth', () => {
    expect(formatEvalValue(120, 14)).toBe('評価値 +120（深さ14）');
    expect(formatEvalValue(-443, 11)).toBe('評価値 -443（深さ11）');
    expect(formatEvalValue(0, 9)).toBe('評価値 +0（深さ9）');
  });

  it('omits the depth when the route did not report one', () => {
    expect(formatEvalValue(-50)).toBe('評価値 -50');
  });

  it('names the winning side for mate scores', () => {
    expect(formatEvalValue(30_000)).toBe('先手勝勢（詰み）');
    expect(formatEvalValue(-30_000)).toBe('後手勝勢（詰み）');
    expect(formatEvalValue(90_000_000, 20)).toBe('先手勝勢（詰み）');
  });

  it('marks a score carried over from the previous position', () => {
    // Depth is dropped when stale: it described the older search.
    expect(formatEvalValue(-443, 11, true)).toBe('評価値 -443（前の局面）');
    expect(formatEvalValue(30_000, undefined, true)).toBe('先手勝勢（詰み）（前の局面）');
  });
});

describe('formatEvalAriaLabel', () => {
  it('describes the bar as a win rate', () => {
    expect(formatEvalAriaLabel(0)).toBe('形勢: 先手勝率 50%');
    expect(formatEvalAriaLabel(-443)).toBe('形勢: 先手勝率 32%');
  });

  it('describes mate and staleness', () => {
    expect(formatEvalAriaLabel(-30_000)).toBe('形勢: 後手の勝ち');
    expect(formatEvalAriaLabel(120, true)).toBe('形勢（前の局面）: 先手勝率 55%');
  });
});

describe('formatThinkSeconds', () => {
  it('renders one decimal', () => {
    expect(formatThinkSeconds(0)).toBe('0.0秒');
    expect(formatThinkSeconds(2_612)).toBe('2.6秒');
  });

  it('never renders a negative clock', () => {
    expect(formatThinkSeconds(-5)).toBe('0.0秒');
  });
});
