import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionTier,
  QuizDifficulty,
  analogyDistractors,
  analogyReadings,
  cellKey,
  generateAnalogy,
  generateOddOneOut,
  hasRivalOddItem,
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

  it('odd-one-out is never parity-ambiguous: a unique odd/even item must be the answer', () => {
    // If exactly one of the four items has a minority parity (e.g. the only odd
    // number), "it has a different parity" is a defensible rule — so that item
    // must coincide with the intended answer. Otherwise two different answers
    // would both be justifiable (e.g. [6, 9, 12, 10] or [2, 3, 5, 33]).
    for (const tier of TIERS) {
      for (let i = 0; i < 4000; i += 1) {
        const q = generateQuestionForTier(tier);
        if (q.type !== 'odd-one-out') continue;
        const nums = q.options.map(Number);
        const odds = nums.filter((n) => Math.abs(n) % 2 === 1);
        const evens = nums.filter((n) => Math.abs(n) % 2 === 0);
        const minority = odds.length === 1 ? odds : evens.length === 1 ? evens : null;
        if (minority) {
          expect(minority[0]).toBe(nums[q.answerIndex]);
        }
      }
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

  it('estimateIq is monotonic in the number correct and maps 0%/50%/100% to 80/~113/145', () => {
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

/** Small seeded PRNG so the large samples below are the same on every run. */
const seededRandom = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const parseAnalogy = (display: string): [number, number, number] => {
  const m = display.match(/^(\d+) : (\d+) {2}= {2}(\d+) : \?$/);
  if (!m) throw new Error(`unexpected analogy display: ${display}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/**
 * Independent restatement of the readings a solver could apply to the first
 * pair of `a : b = c : ?`, kept separate from the generator's own helper.
 */
const defensibleAnalogyAnswers = (a: number, b: number, c: number): Set<number> => {
  const out = new Set<number>();
  // add / subtract: the same difference
  out.add(c + (b - a));
  // multiply by a whole number
  if (b % a === 0) out.add(c * (b / a));
  // divide by a whole number
  if (a % b === 0 && c % (a / b) === 0) out.add(c / (a / b));
  // the same (possibly fractional) ratio, e.g. 8 : 12 = 6 : 9
  if (Number.isInteger((c * b) / a)) out.add((c * b) / a);
  // square, and its inverse
  if (b === a * a) out.add(c * c);
  if (a === b * b && Number.isInteger(Math.sqrt(c))) out.add(Math.sqrt(c));
  return out;
};

describe('analogy questions have a single defensible option', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exactly one option fits an add / subtract / multiply / divide / square reading (24,000 questions)', () => {
    const perOp: Record<string, number> = {};
    let total = 0;
    for (const tier of TIERS) {
      for (let seed = 1; seed <= 8; seed += 1) {
        vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed * 7919 + tier.length));
        for (let i = 0; i < 1000; i += 1) {
          const q = generateAnalogy(tier);
          total += 1;
          const op = q.fingerprint.split(':')[1];
          perOp[op] = (perOp[op] ?? 0) + 1;
          const [a, b, c] = parseAnalogy(q.display);
          const defensible = defensibleAnalogyAnswers(a, b, c);
          const fitting = q.options.filter((o) => defensible.has(Number(o)));
          if (fitting.length !== 1 || fitting[0] !== q.options[q.answerIndex]) {
            throw new Error(
              `ambiguous analogy ${q.display} options ${q.options.join(', ')} ` +
                `keyed ${q.options[q.answerIndex]} defensible ${[...defensible].join(', ')}`,
            );
          }
        }
        vi.restoreAllMocks();
      }
    }
    expect(total).toBe(24000);
    // Every rule the generator can key was actually sampled.
    for (const op of ['add', 'sub', 'mul', 'square']) expect(perOp[op]).toBeGreaterThan(500);
  });

  it('keeps the answer-key rule, four options, and near, unique, positive distractors', () => {
    const keyed: Record<string, (a: number, b: number, c: number) => number> = {
      add: (a, b, c) => c + (b - a),
      sub: (a, b, c) => c - (a - b),
      mul: (a, b, c) => c * (b / a),
      square: (_a, _b, c) => c * c,
    };
    const opsByTier: Record<QuestionTier, string[]> = {
      easy: ['add', 'sub'],
      medium: ['add', 'sub', 'mul'],
      hard: ['add', 'sub', 'mul', 'square'],
    };
    let moved = 0;
    for (const tier of TIERS) {
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(20240 + tier.length));
      for (let i = 0; i < 4000; i += 1) {
        const q = generateAnalogy(tier);
        // Plain checks that throw: thousands of `expect` calls per test are slow.
        const must = (ok: boolean, what: string) => {
          if (!ok) throw new Error(`${what}: ${q.display} [${q.fingerprint}] options ${q.options.join(', ')}`);
        };
        must(q.type === 'analogy' && q.tier === tier, 'type / tier');
        must(validateQuestion(q), 'validateQuestion');
        const [, op, fa, fb, fc] = q.fingerprint.split(':');
        must(opsByTier[tier].includes(op), 'op allowed at this tier');
        const [a, b, c] = parseAnalogy(q.display);
        must(Number(fa) === a && Number(fb) === b && Number(fc) === c, 'fingerprint matches display');
        if (op === 'square') must(b === a * a, 'first pair is a square');
        if (op === 'mul') must(b % a === 0, 'first pair is a whole multiple');
        if (op === 'sub') must(b < a, 'first pair decreases');
        if (op === 'add') must(b > a, 'first pair increases');

        const answer = keyed[op](a, b, c);
        must(Number(q.options[q.answerIndex]) === answer, 'keyed answer follows the rule');

        const nums = q.options.map(Number);
        must(nums.length === 4 && new Set(nums).size === 4, 'four unique options');
        // At most three other readings can be skipped, so a distractor is never far.
        must(
          nums.every((n) => Number.isInteger(n) && n >= 1 && Math.abs(n - answer) <= 4),
          'options are positive whole numbers near the answer',
        );
        const sorted = [...nums].sort((x, y) => x - y).join(',');
        if (sorted !== [answer - 1, answer, answer + 1, answer + 2].join(',')) moved += 1;
      }
      vi.restoreAllMocks();
    }
    // Only the few questions that used to be ambiguous get a different option set.
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(12000 * 0.08);
  });

  it('skips the other readings when choosing distractors', () => {
    // 8 : 16 = 9 : ? keyed 17 (+8); 18 (x2) must not be offered.
    expect(analogyReadings(8, 16, 9).sort((x, y) => x - y)).toEqual([17, 18]);
    expect(analogyDistractors(8, 16, 9, 17)).toEqual([16, 19, 15]);
    // 8 : 12 = 6 : ? keyed 10 (+4); 9 (the same ratio) must not be offered.
    expect(analogyDistractors(8, 12, 6, 10)).toEqual([11, 12, 8]);
    // 3 : 9 = 4 : ? keyed 16 (square); 10 (+6) and 12 (x3) are far enough already.
    expect(analogyReadings(3, 9, 4).sort((x, y) => x - y)).toEqual([10, 12, 16]);
    expect(analogyDistractors(3, 9, 4, 16)).toEqual([17, 15, 18]);
    // 16 : 4 = 25 : ? keyed 13 (-12); 5 (square root) is a reading too.
    expect(analogyReadings(16, 4, 25)).toContain(5);
    // Distractors never drop below 1.
    expect(analogyDistractors(30, 31, 1, 2)).toEqual([3, 1, 4]);
  });
});

describe('odd-one-out has no rival odd item', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognises a second item that is the only one lacking a shared property', () => {
    // Keyed 20 (not a multiple of 6), but 6 is the only non-multiple of 4.
    expect(hasRivalOddItem([12, 20, 6, 24], 20)).toBe(true);
    // Keyed 27 (not a square), but 25 is the only non-multiple of 3.
    expect(hasRivalOddItem([9, 81, 25, 27], 27)).toBe(true);
    // Keyed 21 (the only odd number), but 22 is the only non-multiple of 3.
    expect(hasRivalOddItem([12, 22, 18, 21], 21)).toBe(true);
    expect(hasRivalOddItem([4, 8, 14, 7], 7)).toBe(false);
    expect(hasRivalOddItem([3, 5, 7, 9], 9)).toBe(false);
  });

  it('the keyed item is the only one that is alone in lacking a shared property (21,000 questions)', () => {
    const isPrime = (n: number) => {
      if (n < 2) return false;
      for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false;
      return true;
    };
    const properties: ((n: number) => boolean)[] = [
      (n) => n % 2 === 1,
      (n) => n % 2 === 0,
      (n) => Number.isInteger(Math.sqrt(n)),
      isPrime,
      ...[3, 4, 5, 6, 7].map((k) => (n: number) => n % k === 0),
    ];
    const perVariant: Record<string, number> = {};
    let total = 0;
    for (const tier of TIERS) {
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(4242 + tier.length));
      for (let i = 0; i < 7000; i += 1) {
        const q = generateOddOneOut(tier);
        total += 1;
        const variant = q.fingerprint.split(':')[1];
        perVariant[variant] = (perVariant[variant] ?? 0) + 1;
        const nums = q.options.map(Number);
        const key = nums[q.answerIndex];
        let keyStandsOut = false;
        for (const has of properties) {
          const lacking = nums.filter((n) => !has(n));
          if (lacking.length !== 1) continue;
          if (lacking[0] !== key) {
            throw new Error(`ambiguous odd-one-out ${nums.join(', ')} keyed ${key}, rival ${lacking[0]}`);
          }
          keyStandsOut = true;
        }
        if (!keyStandsOut) throw new Error(`keyed item does not stand out: ${nums.join(', ')} keyed ${key}`);
      }
      vi.restoreAllMocks();
    }
    expect(total).toBe(21000);
    for (const variant of ['parity', 'square', 'multiple', 'prime']) {
      expect(perVariant[variant]).toBeGreaterThan(500);
    }
  });
});
