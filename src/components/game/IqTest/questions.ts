export type CellShape = 'circle' | 'square' | 'triangle' | 'star';
export type CellColor = '#ef4444' | '#3b82f6' | '#22c55e' | '#f59e0b' | '#a855f7';
export type CellCount = 1 | 2 | 3;

export type QuestionTier = 'easy' | 'medium' | 'hard';

export interface CellSpec {
  shape: CellShape;
  color: CellColor;
  count: CellCount;
}

export interface MatrixData {
  grid: (CellSpec | null)[][];
  cellOptions: CellSpec[];
}

/** Bilingual text keyed by language code (`ja` / `en`). */
export interface Bilingual {
  ja: string;
  en: string;
}

export interface Question {
  /** Generator id (also used for session de-dup fingerprints). */
  type: string;
  tier: QuestionTier;
  prompt: Bilingual;
  /** Compact string representation of the puzzle (empty for matrix questions). */
  display: string;
  options: string[];
  answerIndex: number;
  explanation: Bilingual;
  matrix?: MatrixData;
  /**
   * Stable fingerprint of the *puzzle* (not the shuffled options) used to avoid
   * repeating the same question within a single session.
   */
  fingerprint: string;
}

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const shuffle = <T,>(arr: readonly T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false;
  return true;
};

/**
 * Build exactly four unique options that include `correct` as the ONLY correct
 * answer. Preferred distractors are tried first; if they collide with the
 * correct answer or each other, deterministic-ish numeric/letter fillers top it
 * up. Guarantees `options.length === 4` and exactly one entry equals `correct`.
 */
const makeOptions = (
  correct: string,
  distractors: string[],
): { options: string[]; answerIndex: number } => {
  const set = new Set<string>([correct]);

  for (const d of distractors) {
    if (set.size >= 4) break;
    if (d !== correct) set.add(d);
  }

  const asNumber = Number(correct);
  const isNumeric = correct.trim() !== '' && !Number.isNaN(asNumber);
  const isLetter = correct.length === 1 && /[A-Z]/.test(correct);

  let offset = 1;
  let safety = 200;
  while (set.size < 4 && safety > 0) {
    safety -= 1;
    let candidate: string;
    if (isNumeric) {
      // Alternate above/below the answer so distractors stay plausible.
      const delta = Math.ceil(offset / 2) * (offset % 2 === 0 ? -1 : 1);
      candidate = String(asNumber + delta);
    } else if (isLetter) {
      const base = correct.charCodeAt(0);
      const delta = Math.ceil(offset / 2) * (offset % 2 === 0 ? -1 : 1);
      const code = Math.max(65, Math.min(90, base + delta));
      candidate = String.fromCharCode(code);
    } else {
      candidate = `${correct}${'*'.repeat(offset)}`;
    }
    offset += 1;
    if (candidate !== correct) set.add(candidate);
  }

  const shuffled = shuffle(Array.from(set).slice(0, 4));
  return { options: shuffled, answerIndex: shuffled.indexOf(correct) };
};

// --------------------------------------------------------------------------
// Number-sequence generators
// --------------------------------------------------------------------------

const tierArithmetic: Record<QuestionTier, { startMax: number; dMin: number; dMax: number }> = {
  easy: { startMax: 10, dMin: 2, dMax: 5 },
  medium: { startMax: 20, dMin: 3, dMax: 9 },
  hard: { startMax: 40, dMin: 6, dMax: 13 },
};

const generateArithmetic = (tier: QuestionTier): Question => {
  const cfg = tierArithmetic[tier];
  const start = randInt(1, cfg.startMax);
  const sign = Math.random() < (tier === 'hard' ? 0.35 : 0.2) ? -1 : 1;
  const d = randInt(cfg.dMin, cfg.dMax) * sign;
  const terms = [0, 1, 2, 3, 4].map((i) => start + i * d);
  const answer = start + 5 * d;
  const distractors = [answer + 1, answer - 1, answer + d, answer - d].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'arithmetic',
    tier,
    prompt: { ja: '? に当てはまる数字は？', en: 'Which number replaces the ??' },
    display: `${terms.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: {
      ja: `等差数列（公差 ${d}）。${terms[4]} + (${d}) = ${answer}。`,
      en: `Arithmetic sequence (common difference ${d}). ${terms[4]} + (${d}) = ${answer}.`,
    },
    fingerprint: `arithmetic:${start}:${d}`,
  };
};

const generateGeometric = (tier: QuestionTier): Question => {
  const start = randInt(1, tier === 'hard' ? 6 : 4);
  const r = tier === 'easy' ? 2 : pick([2, 3]);
  const t = [start, start * r, start * r * r, start * r * r * r];
  const answer = t[3] * r;
  const distractors = [answer + r, answer - r, t[3] + answer, answer + 1].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'geometric',
    tier,
    prompt: { ja: '? に当てはまる数字は？', en: 'Which number replaces the ??' },
    display: `${t.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: {
      ja: `等比数列（公比 ${r}）。${t[3]} × ${r} = ${answer}。`,
      en: `Geometric sequence (ratio ${r}). ${t[3]} × ${r} = ${answer}.`,
    },
    fingerprint: `geometric:${start}:${r}`,
  };
};

const generateSquare = (tier: QuestionTier): Question => {
  const start = randInt(2, tier === 'hard' ? 7 : 5);
  const terms = [0, 1, 2, 3].map((i) => (start + i) * (start + i));
  const nextBase = start + 4;
  const answer = nextBase * nextBase;
  const distractors = [answer + 1, answer - 1, answer + nextBase, answer - nextBase].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'square',
    tier,
    prompt: { ja: '? に当てはまる数字は？', en: 'Which number replaces the ??' },
    display: `${terms.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: {
      ja: `平方数の列（n²）。${nextBase}² = ${answer}。`,
      en: `Squares (n²). ${nextBase}² = ${answer}.`,
    },
    fingerprint: `square:${start}`,
  };
};

const generateFibonacci = (tier: QuestionTier): Question => {
  const a = randInt(1, tier === 'hard' ? 6 : 4);
  const b = randInt(a, tier === 'hard' ? 9 : 6);
  const c = a + b;
  const d = b + c;
  const e = c + d;
  const answer = d + e;
  const distractors = [answer + 1, answer - 1, e + c, d + c].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'fibonacci',
    tier,
    prompt: { ja: '? に当てはまる数字は？', en: 'Which number replaces the ??' },
    display: `${a}, ${b}, ${c}, ${d}, ${e}, ?`,
    options,
    answerIndex,
    explanation: {
      ja: `直前2項の和。${d} + ${e} = ${answer}。`,
      en: `Each term is the sum of the previous two. ${d} + ${e} = ${answer}.`,
    },
    fingerprint: `fibonacci:${a}:${b}`,
  };
};

const generateAlternating = (tier: QuestionTier): Question => {
  const a = randInt(1, 9);
  const b = randInt(10, 20);
  const da = randInt(1, tier === 'hard' ? 6 : 4);
  const db = randInt(1, tier === 'hard' ? 6 : 4);
  // Two interleaved arithmetic progressions. Shown terms: a, b, a+da, b+db,
  // a+2da, b+2db. The next (7th, odd-position) term continues the "a" track.
  const seq = [a, b, a + da, b + db, a + 2 * da, b + 2 * db];
  const answer = a + 3 * da;
  const distractors = [b + 3 * db, answer + 1, answer - 1, answer + da].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'alternating',
    tier,
    prompt: {
      ja: '? に当てはまる数字は？（2つの数列が交互）',
      en: 'Which number replaces the ?? (two interleaved sequences)',
    },
    display: `${seq.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: {
      ja: `奇数番目は +${da}、偶数番目は +${db}。次は奇数番目で ${a + 2 * da} + ${da} = ${answer}。`,
      en: `Odd positions step by +${da}, even positions by +${db}. Next is an odd position: ${a + 2 * da} + ${da} = ${answer}.`,
    },
    fingerprint: `alternating:${a}:${b}:${da}:${db}`,
  };
};

// --------------------------------------------------------------------------
// Odd-one-out
// --------------------------------------------------------------------------

const generateOddOneOut = (tier: QuestionTier): Question => {
  const variants =
    tier === 'easy'
      ? (['parity', 'multiple'] as const)
      : (['parity', 'square', 'multiple', 'prime'] as const);
  const variant = pick(variants);
  let items: number[];
  let oddItem: number;
  let explanation: Bilingual;

  if (variant === 'parity') {
    const evenPool = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    const evens = shuffle(evenPool).slice(0, 3);
    do {
      oddItem = pick([3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);
    } while (evens.includes(oddItem));
    items = [...evens, oddItem];
    explanation = {
      ja: `${oddItem} だけが奇数。他は全て偶数。`,
      en: `Only ${oddItem} is odd; the rest are even.`,
    };
  } else if (variant === 'square') {
    // All three squares share one parity so a lone odd/even square can never
    // become a second defensible answer (only the non-square may stand out).
    const sqParity = pick([0, 1]);
    const squares = shuffle(
      [4, 9, 16, 25, 36, 49, 64, 81, 100].filter((s) => s % 2 === sqParity),
    ).slice(0, 3);
    const sqSet = new Set([1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144]);
    do {
      oddItem = randInt(5, 99);
    } while (sqSet.has(oddItem) || squares.includes(oddItem));
    items = [...squares, oddItem];
    explanation = {
      ja: `${oddItem} だけが平方数ではない。`,
      en: `Only ${oddItem} is not a perfect square.`,
    };
  } else if (variant === 'multiple') {
    const base = pick([3, 4, 5, 6, 7]);
    const multPool = Array.from({ length: 10 }, (_, i) => base * (i + 2));
    // Keep every item on one parity so "the only odd/even number" can never be
    // a second defensible answer (e.g. [6, 9, 12, 10] where 9 is the only odd).
    const parity = base % 2 === 0 ? 0 : pick([0, 1]);
    const mults = shuffle(multPool.filter((m) => m % 2 === parity)).slice(0, 3);
    do {
      oddItem = randInt(base * 2, base * 12);
    } while (oddItem % base === 0 || oddItem % 2 !== parity || mults.includes(oddItem));
    items = [...mults, oddItem];
    explanation = {
      ja: `${oddItem} だけが ${base} の倍数ではない。`,
      en: `Only ${oddItem} is not a multiple of ${base}.`,
    };
  } else {
    // 2 is excluded: with it, "the only even number" would be a second
    // defensible answer (e.g. [2, 3, 5, 33]). All primes shown are odd.
    const primesPool = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
    const primes = shuffle(primesPool).slice(0, 3);
    do {
      oddItem = randInt(4, 35);
    } while (isPrime(oddItem) || primes.includes(oddItem));
    items = [...primes, oddItem];
    explanation = {
      ja: `${oddItem} だけが素数ではない。`,
      en: `Only ${oddItem} is not a prime number.`,
    };
  }

  const shuffled = shuffle(items);
  return {
    type: 'odd-one-out',
    tier,
    prompt: { ja: '仲間外れはどれ？', en: 'Which one does not belong?' },
    display: shuffled.join('   '),
    options: shuffled.map(String),
    answerIndex: shuffled.indexOf(oddItem),
    explanation,
    fingerprint: `odd:${variant}:${[...items].sort((x, y) => x - y).join(',')}`,
  };
};

// --------------------------------------------------------------------------
// Analogy
// --------------------------------------------------------------------------

const generateAnalogy = (tier: QuestionTier): Question => {
  const ops =
    tier === 'easy'
      ? (['add', 'sub'] as const)
      : tier === 'medium'
        ? (['add', 'sub', 'mul'] as const)
        : (['add', 'sub', 'mul', 'square'] as const);
  const op = pick(ops);
  let a: number;
  let b: number;
  let c: number;
  let answer: number;
  let explanation: Bilingual;

  if (op === 'add') {
    const k = randInt(2, tier === 'hard' ? 20 : 12);
    a = randInt(1, 30);
    b = a + k;
    do {
      c = randInt(1, 30);
    } while (c === a);
    answer = c + k;
    explanation = {
      ja: `両方とも +${k} の関係。${c} + ${k} = ${answer}。`,
      en: `Both pairs add ${k}. ${c} + ${k} = ${answer}.`,
    };
  } else if (op === 'sub') {
    const k = randInt(2, 12);
    a = randInt(15, 40);
    b = a - k;
    do {
      c = randInt(15, 40);
    } while (c === a);
    answer = c - k;
    explanation = {
      ja: `両方とも -${k} の関係。${c} - ${k} = ${answer}。`,
      en: `Both pairs subtract ${k}. ${c} - ${k} = ${answer}.`,
    };
  } else if (op === 'mul') {
    const k = pick([2, 3, 4, 5]);
    a = randInt(2, 9);
    b = a * k;
    do {
      c = randInt(2, 9);
    } while (c === a);
    answer = c * k;
    explanation = {
      ja: `両方とも ×${k} の関係。${c} × ${k} = ${answer}。`,
      en: `Both pairs multiply by ${k}. ${c} × ${k} = ${answer}.`,
    };
  } else {
    const bases = [3, 4, 5, 6, 7, 8, 9];
    a = pick(bases);
    b = a * a;
    do {
      c = pick(bases);
    } while (c === a);
    answer = c * c;
    explanation = {
      ja: `両方とも n → n² の関係。${c}² = ${answer}。`,
      en: `Both pairs are n → n². ${c}² = ${answer}.`,
    };
  }

  const distractors = [answer + 1, answer - 1, answer + 2, Math.max(0, answer - 2)].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'analogy',
    tier,
    prompt: { ja: '同じ関係になる数字は？', en: 'Which number keeps the same relationship?' },
    display: `${a} : ${b}  =  ${c} : ?`,
    options,
    answerIndex,
    explanation,
    fingerprint: `analogy:${op}:${a}:${b}:${c}`,
  };
};

// --------------------------------------------------------------------------
// Letter sequence
// --------------------------------------------------------------------------

const generateLetterSequence = (tier: QuestionTier): Question => {
  const A = 'A'.charCodeAt(0);
  const step = tier === 'easy' ? 1 : randInt(1, tier === 'hard' ? 5 : 3);
  // Keep all five letters (four shown + answer) inside A..Z.
  const maxStart = 25 - 4 * step;
  const start = randInt(0, Math.max(0, maxStart));
  const terms = [0, 1, 2, 3].map((i) => String.fromCharCode(A + start + i * step));
  const answerCode = A + start + 4 * step;
  const answer = String.fromCharCode(answerCode);
  const clamp = (code: number): string =>
    String.fromCharCode(Math.max(65, Math.min(90, code)));
  const distractors = [
    clamp(answerCode + 1),
    clamp(answerCode - 1),
    clamp(answerCode + step + 1),
    clamp(answerCode - step - 1),
  ];
  const { options, answerIndex } = makeOptions(answer, distractors);
  return {
    type: 'letter',
    tier,
    prompt: {
      ja: '? に当てはまるアルファベットは？',
      en: 'Which letter replaces the ??',
    },
    display: `${terms.join(', ')}, ?`,
    options,
    answerIndex,
    explanation:
      step === 1
        ? {
            ja: `アルファベット順に1つずつ進む。次は ${answer}。`,
            en: `Letters advance by one. Next is ${answer}.`,
          }
        : {
            ja: `アルファベットを ${step} つずつ進める。次は ${answer}。`,
            en: `Letters advance by ${step}. Next is ${answer}.`,
          },
    fingerprint: `letter:${start}:${step}`,
  };
};

// --------------------------------------------------------------------------
// Matrix (Raven-style)
// --------------------------------------------------------------------------

type MatrixAxis = 'shape' | 'color' | 'count';

const ALL_SHAPES: CellShape[] = ['circle', 'square', 'triangle', 'star'];
const ALL_COLORS: CellColor[] = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
const ALL_COUNTS: CellCount[] = [1, 2, 3];

const axisLabel: Record<MatrixAxis, Bilingual> = {
  shape: { ja: '形', en: 'shape' },
  color: { ja: '色', en: 'color' },
  count: { ja: '個数', en: 'count' },
};

const colorName: Record<CellColor, Bilingual> = {
  '#ef4444': { ja: '赤', en: 'red' },
  '#3b82f6': { ja: '青', en: 'blue' },
  '#22c55e': { ja: '緑', en: 'green' },
  '#f59e0b': { ja: '黄', en: 'yellow' },
  '#a855f7': { ja: '紫', en: 'purple' },
};

const shapeName: Record<CellShape, Bilingual> = {
  circle: { ja: '円', en: 'circle' },
  square: { ja: '四角', en: 'square' },
  triangle: { ja: '三角', en: 'triangle' },
  star: { ja: '星', en: 'star' },
};

const valuesForAxis = (axis: MatrixAxis): (CellShape | CellColor | CellCount)[] => {
  if (axis === 'shape') return shuffle(ALL_SHAPES).slice(0, 3);
  if (axis === 'color') return shuffle(ALL_COLORS).slice(0, 3);
  return shuffle(ALL_COUNTS).slice(0, 3);
};

const buildCell = (
  base: CellSpec,
  rowAxis: MatrixAxis,
  colAxis: MatrixAxis,
  rowValue: CellShape | CellColor | CellCount,
  colValue: CellShape | CellColor | CellCount,
): CellSpec => ({
  ...base,
  [rowAxis]: rowValue,
  [colAxis]: colValue,
});

const cellKey = (c: CellSpec): string => `${c.shape}-${c.color}-${c.count}`;

const generateMatrix = (tier: QuestionTier): Question => {
  const axes = shuffle(['shape', 'color', 'count'] as const).slice(0, 2);
  const rowAxis = axes[0] as MatrixAxis;
  const colAxis = axes[1] as MatrixAxis;
  const fixedAxis = (['shape', 'color', 'count'] as const).find(
    (a) => a !== rowAxis && a !== colAxis,
  ) as MatrixAxis;

  const base: CellSpec = {
    shape: pick(ALL_SHAPES),
    color: pick(ALL_COLORS),
    count: pick(ALL_COUNTS),
  };

  const rowValues = valuesForAxis(rowAxis);
  const colValues = valuesForAxis(colAxis);

  const grid: (CellSpec | null)[][] = [];
  for (let r = 0; r < 3; r += 1) {
    const row: (CellSpec | null)[] = [];
    for (let c = 0; c < 3; c += 1) {
      const cell = buildCell(base, rowAxis, colAxis, rowValues[r], colValues[c]);
      row.push(r === 2 && c === 2 ? null : cell);
    }
    grid.push(row);
  }

  const correct = buildCell(base, rowAxis, colAxis, rowValues[2], colValues[2]);

  // Distractor candidates share the fixed axis but violate the row/column rule.
  const candidates: CellSpec[] = [
    correct,
    buildCell(base, rowAxis, colAxis, rowValues[2], colValues[0]),
    buildCell(base, rowAxis, colAxis, rowValues[0], colValues[2]),
    buildCell(base, rowAxis, colAxis, rowValues[1], colValues[1]),
    buildCell(base, rowAxis, colAxis, rowValues[2], colValues[1]),
    buildCell(base, rowAxis, colAxis, rowValues[1], colValues[2]),
    buildCell(base, rowAxis, colAxis, rowValues[0], colValues[0]),
  ];

  const seen = new Set<string>();
  const unique: CellSpec[] = [];
  for (const cand of candidates) {
    const key = cellKey(cand);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cand);
    }
    if (unique.length >= 4) break;
  }

  // Top up with mutated variants if row/col values overlapped.
  let safety = 100;
  while (unique.length < 4 && safety > 0) {
    safety -= 1;
    const variant: CellSpec = { ...correct };
    const ax = pick<MatrixAxis>(['shape', 'color', 'count']);
    if (ax === 'shape') variant.shape = pick(ALL_SHAPES);
    if (ax === 'color') variant.color = pick(ALL_COLORS);
    if (ax === 'count') variant.count = pick(ALL_COUNTS);
    const key = cellKey(variant);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(variant);
    }
  }

  const shuffledOpts = shuffle(unique);
  const answerIndex = shuffledOpts.findIndex((c) => cellKey(c) === cellKey(correct));

  const valJa = (axis: MatrixAxis, value: CellShape | CellColor | CellCount): string => {
    if (axis === 'shape') return shapeName[value as CellShape].ja;
    if (axis === 'color') return colorName[value as CellColor].ja;
    return `${value}個`;
  };
  const valEn = (axis: MatrixAxis, value: CellShape | CellColor | CellCount): string => {
    if (axis === 'shape') return shapeName[value as CellShape].en;
    if (axis === 'color') return colorName[value as CellColor].en;
    return `${value}`;
  };

  const fixedJa =
    fixedAxis === 'shape'
      ? `、形は${shapeName[base.shape].ja}固定。`
      : fixedAxis === 'color'
        ? `、色は${colorName[base.color].ja}固定。`
        : `、個数は${base.count}個固定。`;
  const fixedEn =
    fixedAxis === 'shape'
      ? ` The shape stays ${shapeName[base.shape].en}.`
      : fixedAxis === 'color'
        ? ` The color stays ${colorName[base.color].en}.`
        : ` The count stays ${base.count}.`;

  const explanation: Bilingual = {
    ja:
      `行ごとに${axisLabel[rowAxis].ja}が変化し、列ごとに${axisLabel[colAxis].ja}が変化。` +
      `?は3行目(${valJa(rowAxis, rowValues[2])})×3列目(${valJa(colAxis, colValues[2])})` +
      fixedJa,
    en:
      `The ${axisLabel[rowAxis].en} changes across rows and the ${axisLabel[colAxis].en} changes across columns. ` +
      `The ? is row 3 (${valEn(rowAxis, rowValues[2])}) × column 3 (${valEn(colAxis, colValues[2])}).` +
      fixedEn,
  };

  return {
    type: 'matrix',
    tier,
    prompt: { ja: '? に当てはまる図形は？', en: 'Which figure completes the grid?' },
    display: '',
    options: ['A', 'B', 'C', 'D'],
    answerIndex,
    explanation,
    matrix: { grid, cellOptions: shuffledOpts },
    fingerprint: `matrix:${rowAxis}:${colAxis}:${cellKey(correct)}:${rowValues.join('')}:${colValues.join('')}`,
  };
};

// --------------------------------------------------------------------------
// Generator registry + difficulty-aware selection
// --------------------------------------------------------------------------

type Generator = (tier: QuestionTier) => Question;

/** Which generators are available at each tier (harder types unlock later). */
const generatorsByTier: Record<QuestionTier, Generator[]> = {
  easy: [
    generateArithmetic,
    generateGeometric,
    generateOddOneOut,
    generateAnalogy,
    generateLetterSequence,
  ],
  medium: [
    generateArithmetic,
    generateGeometric,
    generateSquare,
    generateFibonacci,
    generateAlternating,
    generateOddOneOut,
    generateAnalogy,
    generateLetterSequence,
    generateMatrix,
  ],
  hard: [
    generateGeometric,
    generateSquare,
    generateFibonacci,
    generateAlternating,
    generateOddOneOut,
    generateAnalogy,
    generateLetterSequence,
    generateMatrix,
    generateMatrix,
  ],
};

/**
 * Difficulty for the quiz. `mixed` ramps from easy → medium → hard across the
 * quiz using the question position.
 */
export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

const tierForMixed = (index: number, total: number): QuestionTier => {
  const frac = total <= 1 ? 0 : index / (total - 1);
  if (frac < 0.34) return 'easy';
  if (frac < 0.7) return 'medium';
  return 'hard';
};

/**
 * Generate a single question at the given tier. Exposed mainly for tests.
 */
export const generateQuestionForTier = (tier: QuestionTier): Question => {
  const gen = pick(generatorsByTier[tier]);
  return gen(tier);
};

/**
 * Generate a question for the quiz, avoiding fingerprints already used this
 * session. `index`/`total` drive the ramp for `mixed` difficulty.
 */
export const generateQuestion = (
  difficulty: QuizDifficulty = 'mixed',
  index = 0,
  total = 10,
  usedFingerprints?: Set<string>,
): Question => {
  const tier: QuestionTier =
    difficulty === 'mixed' ? tierForMixed(index, total) : difficulty;

  let question = generateQuestionForTier(tier);
  if (usedFingerprints) {
    let attempts = 30;
    while (usedFingerprints.has(question.fingerprint) && attempts > 0) {
      attempts -= 1;
      question = generateQuestionForTier(tier);
    }
    usedFingerprints.add(question.fingerprint);
  }
  return question;
};

/**
 * Validate that a generated question is well-formed: exactly 4 unique options,
 * a valid answer index, and exactly one option equal to the correct answer.
 * Used by tests; cheap enough to keep in the bundle.
 */
export const validateQuestion = (q: Question): boolean => {
  if (q.options.length !== 4) return false;
  if (new Set(q.options).size !== 4) return false;
  if (q.answerIndex < 0 || q.answerIndex >= 4) return false;
  // The correct answer must appear exactly once among the options.
  const answer = q.options[q.answerIndex];
  if (q.options.filter((o) => o === answer).length !== 1) return false;
  if (q.matrix) {
    if (q.matrix.cellOptions.length !== 4) return false;
    const keys = q.matrix.cellOptions.map(cellKey);
    if (new Set(keys).size !== 4) return false;
  }
  return true;
};

export { cellKey };
