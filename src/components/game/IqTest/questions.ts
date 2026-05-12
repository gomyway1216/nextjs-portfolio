export interface Question {
  type: string;
  prompt: string;
  display: string;
  options: string[];
  answerIndex: number;
  explanation: string;
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
];

export const generateQuestion = (): Question => pick(generators)();
