export type CellShape = 'circle' | 'square' | 'triangle' | 'star';
export type CellColor = '#ef4444' | '#3b82f6' | '#22c55e' | '#f59e0b' | '#a855f7';
export type CellCount = 1 | 2 | 3;

export interface CellSpec {
  shape: CellShape;
  color: CellColor;
  count: CellCount;
}

export interface MatrixData {
  grid: (CellSpec | null)[][];
  cellOptions: CellSpec[];
}

export interface Question {
  type: string;
  prompt: string;
  display: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  matrix?: MatrixData;
}

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

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

const makeOptions = (
  correct: string,
  distractors: string[],
): { options: string[]; answerIndex: number } => {
  const set = new Set<string>([correct]);
  for (const d of distractors) {
    set.add(d);
    if (set.size >= 4) break;
  }
  let safety = 50;
  while (set.size < 4 && safety > 0) {
    safety -= 1;
    const n = Number(correct);
    if (!Number.isNaN(n)) {
      set.add(String(n + randInt(-9, 9)));
    } else if (correct.length === 1) {
      const code = correct.charCodeAt(0) + randInt(-5, 5);
      set.add(String.fromCharCode(Math.max(65, Math.min(90, code))));
    } else {
      set.add(`${correct}*`);
    }
  }
  const shuffled = shuffle(Array.from(set).slice(0, 4));
  return { options: shuffled, answerIndex: shuffled.indexOf(correct) };
};

const generateArithmetic = (): Question => {
  const start = randInt(1, 20);
  const sign = Math.random() < 0.2 ? -1 : 1;
  const d = randInt(2, 11) * sign;
  const terms = [0, 1, 2, 3, 4].map((i) => start + i * d);
  const answer = start + 5 * d;
  const distractors = [answer + 1, answer - 1, answer + d, terms[4] + 1].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'arithmetic',
    prompt: '? に当てはまる数字は？',
    display: `${terms.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: `等差数列 (公差 ${d})。${terms[4]} + (${d}) = ${answer}。`,
  };
};

const generateGeometric = (): Question => {
  const start = randInt(1, 5);
  const r = pick([2, 3]);
  const t = [start, start * r, start * r * r, start * r * r * r];
  const answer = t[3] * r;
  const distractors = [answer + r, answer - r, t[3] + r, answer + 1].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'geometric',
    prompt: '? に当てはまる数字は？',
    display: `${t.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: `等比数列 (公比 ${r})。${t[3]} × ${r} = ${answer}。`,
  };
};

const generateSquare = (): Question => {
  const start = randInt(2, 5);
  const terms = [0, 1, 2, 3].map((i) => (start + i) * (start + i));
  const next = start + 4;
  const answer = next * next;
  const distractors = [answer + 1, answer - 2, answer + next, answer - next].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'square',
    prompt: '? に当てはまる数字は？',
    display: `${terms.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: `n² の数列。${next}² = ${answer}。`,
  };
};

const generateFibonacci = (): Question => {
  const a = randInt(1, 4);
  const b = randInt(1, 6);
  const c = a + b;
  const d = b + c;
  const e = c + d;
  const answer = d + e;
  const distractors = [answer + 1, answer - 1, e + d + 1, e + c].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'fibonacci',
    prompt: '? に当てはまる数字は？',
    display: `${a}, ${b}, ${c}, ${d}, ${e}, ?`,
    options,
    answerIndex,
    explanation: `直前2項の和。${d} + ${e} = ${answer}。`,
  };
};

const generateAlternating = (): Question => {
  const a = randInt(1, 9);
  const b = randInt(10, 20);
  const da = randInt(1, 5);
  const db = randInt(1, 5);
  const seq = [a, b, a + da, b + db, a + 2 * da, b + 2 * db];
  const answer = a + 3 * da;
  const distractors = [b + 3 * db, answer + 1, answer - 1, answer + da].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'alternating',
    prompt: '? に当てはまる数字は？ (2つのパターンが交互)',
    display: `${seq.join(', ')}, ?`,
    options,
    answerIndex,
    explanation: `奇数番目は +${da}、偶数番目は +${db}。次は奇数番目で ${a + 2 * da} + ${da} = ${answer}。`,
  };
};

const generateOddOneOut = (): Question => {
  const variant = pick(['parity', 'square', 'multiple', 'prime'] as const);
  let items: number[];
  let oddItem: number;
  let explanation: string;

  if (variant === 'parity') {
    const evenPool = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    const evens = shuffle(evenPool).slice(0, 4);
    oddItem = pick([3, 5, 7, 9, 11, 13, 15, 17, 19, 21]);
    items = [...evens, oddItem];
    explanation = `${oddItem} だけが奇数。他は全て偶数。`;
  } else if (variant === 'square') {
    const squares = shuffle([4, 9, 16, 25, 36, 49, 64, 81, 100]).slice(0, 4);
    const sqSet = new Set([1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144]);
    do {
      oddItem = randInt(5, 99);
    } while (sqSet.has(oddItem) || squares.includes(oddItem));
    items = [...squares, oddItem];
    explanation = `${oddItem} だけが平方数ではない。`;
  } else if (variant === 'multiple') {
    const base = pick([3, 4, 5, 6, 7]);
    const multPool = Array.from({ length: 10 }, (_, i) => base * (i + 2));
    const mults = shuffle(multPool).slice(0, 4);
    do {
      oddItem = randInt(base * 2, base * 12);
    } while (oddItem % base === 0 || mults.includes(oddItem));
    items = [...mults, oddItem];
    explanation = `${oddItem} だけが ${base} の倍数ではない。`;
  } else {
    const primesPool = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
    const primes = shuffle(primesPool).slice(0, 4);
    do {
      oddItem = randInt(4, 35);
    } while (isPrime(oddItem) || primes.includes(oddItem));
    items = [...primes, oddItem];
    explanation = `${oddItem} だけが素数ではない。`;
  }

  const shuffled = shuffle(items);
  return {
    type: 'odd-one-out',
    prompt: '仲間外れはどれ？',
    display: shuffled.join('   '),
    options: shuffled.map(String),
    answerIndex: shuffled.indexOf(oddItem),
    explanation,
  };
};

const generateAnalogy = (): Question => {
  const op = pick(['add', 'sub', 'mul', 'square'] as const);
  let a: number;
  let b: number;
  let c: number;
  let answer: number;
  let explanation: string;

  if (op === 'add') {
    const k = randInt(2, 15);
    a = randInt(1, 30);
    b = a + k;
    c = randInt(1, 30);
    answer = c + k;
    explanation = `両方とも +${k} の関係。${c} + ${k} = ${answer}。`;
  } else if (op === 'sub') {
    const k = randInt(2, 12);
    a = randInt(15, 40);
    b = a - k;
    c = randInt(15, 40);
    answer = c - k;
    explanation = `両方とも -${k} の関係。${c} - ${k} = ${answer}。`;
  } else if (op === 'mul') {
    const k = pick([2, 3, 4, 5]);
    a = randInt(2, 9);
    b = a * k;
    c = randInt(2, 9);
    answer = c * k;
    explanation = `両方とも ×${k} の関係。${c} × ${k} = ${answer}。`;
  } else {
    const bases = [3, 4, 5, 6, 7, 8, 9];
    a = pick(bases);
    b = a * a;
    do {
      c = pick(bases);
    } while (c === a);
    answer = c * c;
    explanation = `両方とも n → n² の関係。${c}² = ${answer}。`;
  }

  const distractors = [answer + 1, answer - 1, answer + 2, Math.max(1, answer - 3)].map(String);
  const { options, answerIndex } = makeOptions(String(answer), distractors);
  return {
    type: 'analogy',
    prompt: '同じ関係になる数字は？',
    display: `${a} : ${b}  =  ${c} : ?`,
    options,
    answerIndex,
    explanation,
  };
};

const generateLetterSequence = (): Question => {
  const A = 'A'.charCodeAt(0);
  const start = randInt(0, 10);
  const step = randInt(1, 4);
  const terms = [0, 1, 2, 3].map((i) => String.fromCharCode(A + start + i * step));
  const answerCode = A + start + 4 * step;
  const answer = String.fromCharCode(answerCode);
  const clamp = (code: number) => String.fromCharCode(Math.max(65, Math.min(90, code)));
  const distractors = [
    clamp(answerCode + 1),
    clamp(answerCode - 1),
    clamp(answerCode + step + 1),
    clamp(answerCode - step - 1),
  ];
  const { options, answerIndex } = makeOptions(answer, distractors);
  return {
    type: 'letter',
    prompt: '? に当てはまるアルファベットは？',
    display: `${terms.join(', ')}, ?`,
    options,
    answerIndex,
    explanation:
      step === 1
        ? `アルファベット順に1つずつ進む。次は ${answer}。`
        : `アルファベットを ${step} つずつ進める。次は ${answer}。`,
  };
};

type MatrixAxis = 'shape' | 'color' | 'count';

const ALL_SHAPES: CellShape[] = ['circle', 'square', 'triangle', 'star'];
const ALL_COLORS: CellColor[] = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
const ALL_COUNTS: CellCount[] = [1, 2, 3];

const axisLabel: Record<MatrixAxis, string> = {
  shape: '形',
  color: '色',
  count: '個数',
};

const colorName: Record<CellColor, string> = {
  '#ef4444': '赤',
  '#3b82f6': '青',
  '#22c55e': '緑',
  '#f59e0b': '黄',
  '#a855f7': '紫',
};

const shapeName: Record<CellShape, string> = {
  circle: '円',
  square: '四角',
  triangle: '三角',
  star: '星',
};

const valuesForAxis = (axis: MatrixAxis): unknown[] => {
  if (axis === 'shape') return shuffle(ALL_SHAPES).slice(0, 3);
  if (axis === 'color') return shuffle(ALL_COLORS).slice(0, 3);
  return shuffle(ALL_COUNTS).slice(0, 3);
};

const buildCell = (
  base: CellSpec,
  rowAxis: MatrixAxis,
  colAxis: MatrixAxis,
  rowValue: unknown,
  colValue: unknown,
): CellSpec => ({
  ...base,
  [rowAxis]: rowValue,
  [colAxis]: colValue,
});

const cellKey = (c: CellSpec): string => `${c.shape}-${c.color}-${c.count}`;

const generateMatrix = (): Question => {
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

  while (unique.length < 4) {
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

  const explainValue = (axis: MatrixAxis, value: unknown): string => {
    if (axis === 'shape') return shapeName[value as CellShape];
    if (axis === 'color') return colorName[value as CellColor];
    return `${value}個`;
  };

  const explanation =
    `行ごとに${axisLabel[rowAxis]}が変化し、列ごとに${axisLabel[colAxis]}が変化。` +
    `?は3行目(${explainValue(rowAxis, rowValues[2])})×3列目(${explainValue(colAxis, colValues[2])})` +
    (fixedAxis === 'shape'
      ? `、形は${shapeName[base.shape]}固定。`
      : fixedAxis === 'color'
        ? `、色は${colorName[base.color]}固定。`
        : `、個数は${base.count}個固定。`);

  return {
    type: 'matrix',
    prompt: '? に当てはまる図形は？',
    display: '',
    options: ['A', 'B', 'C', 'D'],
    answerIndex,
    explanation,
    matrix: { grid, cellOptions: shuffledOpts },
  };
};

const generators: Array<() => Question> = [
  generateArithmetic,
  generateArithmetic,
  generateGeometric,
  generateSquare,
  generateFibonacci,
  generateAlternating,
  generateOddOneOut,
  generateOddOneOut,
  generateAnalogy,
  generateAnalogy,
  generateLetterSequence,
  generateMatrix,
  generateMatrix,
  generateMatrix,
];

export const generateQuestion = (): Question => pick(generators)();
