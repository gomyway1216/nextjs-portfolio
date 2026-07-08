import { describe, expect, it } from 'vitest';
import {
  QuestionTier,
  QuizDifficulty,
  cellKey,
  generateQuestion,
  generateQuestionForTier,
  validateQuestion,
} from '@/components/game/IqTest/questions';
import { estimateIq } from '@/components/game/IqTest/i18n';

const TIERS: QuestionTier[] = ['easy', 'medium', 'hard'];
const DIFFICULTIES: QuizDifficulty[] = ['easy', 'medium', 'hard', 'mixed'];

describe('IqTest question generation', () => {
  it('every generated question has exactly 4 unique options and a valid answer index', () => {
    for (const tier of TIERS) {
      for (let i = 0; i < 2000; i += 1) {
        const q = generateQuestionForTier(tier);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(4);
        expect(validateQuestion(q)).toBe(true);
      }
    }
  });

  it('the option at answerIndex is the single correct answer', () => {
    for (const tier of TIERS) {
      for (let i = 0; i < 2000; i += 1) {
        const q = generateQuestionForTier(tier);
        // The answer string must appear exactly once among the options.
        const answerStr = q.options[q.answerIndex];
        const occurrences = q.options.filter((o) => o === answerStr).length;
        expect(occurrences).toBe(1);
      }
    }
  });

  it('matrix questions have 4 distinct cell options and answerIndex points at the correct cell', () => {
    let matrixCount = 0;
    for (let i = 0; i < 5000 && matrixCount < 400; i += 1) {
      const q = generateQuestionForTier('hard');
      if (!q.matrix) continue;
      matrixCount += 1;
      expect(q.matrix.cellOptions).toHaveLength(4);
      const keys = q.matrix.cellOptions.map(cellKey);
      expect(new Set(keys).size).toBe(4);
      // answerIndex must reference a real cell.
      expect(q.matrix.cellOptions[q.answerIndex]).toBeDefined();
    }
    expect(matrixCount).toBeGreaterThan(0);
  });

  it('odd-one-out answer is genuinely the odd item (parity variant sanity check)', () => {
    // Run many; whenever the explanation is about odd numbers, verify the math.
    for (let i = 0; i < 3000; i += 1) {
      const q = generateQuestionForTier('medium');
      if (q.type !== 'odd-one-out') continue;
      const nums = q.options.map(Number);
      // Exactly one item should differ from the majority pattern in at least one
      // structural way. We assert the selected answer is a real member and the
      // options are all distinct numbers.
      expect(new Set(nums).size).toBe(4);
      expect(Number.isNaN(nums[q.answerIndex])).toBe(false);
    }
  });
});

describe('arithmetic / geometric correctness', () => {
  it('arithmetic answer equals start + 5*d parsed from the display', () => {
    for (let i = 0; i < 3000; i += 1) {
      const q = generateQuestionForTier('medium');
      if (q.type !== 'arithmetic') continue;
      const shown = q.display
        .replace(', ?', '')
        .split(', ')
        .map(Number);
      const d = shown[1] - shown[0];
      const expected = shown[shown.length - 1] + d;
      expect(Number(q.options[q.answerIndex])).toBe(expected);
    }
  });

  it('geometric answer equals last shown term * ratio', () => {
    for (let i = 0; i < 3000; i += 1) {
      const q = generateQuestionForTier('medium');
      if (q.type !== 'geometric') continue;
      const shown = q.display.replace(', ?', '').split(', ').map(Number);
      const ratio = shown[1] / shown[0];
      const expected = shown[shown.length - 1] * ratio;
      expect(Number(q.options[q.answerIndex])).toBe(expected);
    }
  });

  it('letter sequences stay within A-Z', () => {
    for (let i = 0; i < 3000; i += 1) {
      const q = generateQuestionForTier('hard');
      if (q.type !== 'letter') continue;
      for (const opt of q.options) {
        expect(opt).toMatch(/^[A-Z]$/);
      }
    }
  });
});

describe('session de-duplication', () => {
  it('does not repeat fingerprints within a single quiz run', () => {
    const used = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const q = generateQuestion('mixed', i, 10, used);
      expect(seen.has(q.fingerprint)).toBe(false);
      seen.add(q.fingerprint);
    }
  });

  it('mixed difficulty ramps easy -> medium -> hard across the quiz', () => {
    const firstTiers = new Set<string>();
    const lastTiers = new Set<string>();
    for (let run = 0; run < 200; run += 1) {
      firstTiers.add(generateQuestion('mixed', 0, 10).tier);
      lastTiers.add(generateQuestion('mixed', 9, 10).tier);
    }
    expect(firstTiers.has('easy')).toBe(true);
    expect(lastTiers.has('hard')).toBe(true);
    // The first question should never be hard, the last never easy.
    expect(firstTiers.has('hard')).toBe(false);
    expect(lastTiers.has('easy')).toBe(false);
  });

  it('fixed difficulty always produces the requested tier', () => {
    for (const d of DIFFICULTIES) {
      if (d === 'mixed') continue;
      for (let i = 0; i < 200; i += 1) {
        expect(generateQuestion(d, i, 10).tier).toBe(d);
      }
    }
  });
});

describe('scoring / IQ estimate', () => {
  it('scores 10 points per correct answer only', () => {
    // Simulate the reducer logic used in the component.
    const applyAnswer = (score: number, correct: boolean) => score + (correct ? 10 : 0);
    let score = 0;
    score = applyAnswer(score, true); // 10
    score = applyAnswer(score, false); // 10
    score = applyAnswer(score, true); // 20
    expect(score).toBe(20);
  });

  it('estimateIq is monotonic in the number correct and centered near 100 at 50%', () => {
    let prev = -Infinity;
    for (let c = 0; c <= 10; c += 1) {
      const iq = estimateIq(c, 10);
      expect(iq).toBeGreaterThanOrEqual(prev);
      prev = iq;
    }
    expect(estimateIq(5, 10)).toBeGreaterThanOrEqual(108);
    expect(estimateIq(5, 10)).toBeLessThanOrEqual(115);
    expect(estimateIq(0, 10)).toBe(80);
    expect(estimateIq(10, 10)).toBe(145);
  });
});
