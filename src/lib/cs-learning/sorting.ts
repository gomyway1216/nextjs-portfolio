import type { CsLearningLanguage } from './localization';

export type SortingAlgorithmId =
  | 'bubble-sort'
  | 'selection-sort'
  | 'insertion-sort'
  | 'merge-sort'
  | 'quick-sort'
  | 'heap-sort';

export type SortStepPhase =
  | 'setup'
  | 'compare'
  | 'swap'
  | 'write'
  | 'partition'
  | 'complete';

export type SortStep = {
  array: number[];
  phase: SortStepPhase;
  note: string;
  comparing?: number[];
  swapping?: number[];
  writing?: number[];
  sorted?: number[];
  pivot?: number;
  range?: number[];
};

export type SortingAlgorithm = {
  id: SortingAlgorithmId;
  name: string;
  shortName: string;
  summary: string;
  intuition: string;
  best: string;
  average: string;
  worst: string;
  space: string;
  stable: boolean;
  inPlace: boolean;
  route: string;
  quiz: {
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  };
};

export const DEFAULT_SORT_ARRAY = [9, 4, 7, 2, 8, 1, 6, 3, 5];

export const sortingAlgorithms: SortingAlgorithm[] = [
  {
    id: 'bubble-sort',
    name: 'Bubble Sort',
    shortName: 'Bubble',
    summary: 'Repeatedly compares adjacent values and moves larger values toward the end.',
    intuition: 'Each pass bubbles the largest remaining value into its final position.',
    best: 'O(n)',
    average: 'O(n^2)',
    worst: 'O(n^2)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    route: '/study/cs/algorithms/sorting/bubble-sort',
    quiz: {
      question: 'Why does optimized Bubble Sort reach O(n) in the best case?',
      options: [
        'It can stop after a pass with no swaps.',
        'It always compares each pair only once.',
        'It divides the array into halves.',
        'It stores every value in a heap.',
      ],
      answerIndex: 0,
      explanation: 'If a full pass makes no swaps, the array is already sorted, so the algorithm can stop early.',
    },
  },
  {
    id: 'selection-sort',
    name: 'Selection Sort',
    shortName: 'Selection',
    summary: 'Selects the smallest remaining value and places it at the front.',
    intuition: 'The sorted prefix grows one selected minimum at a time.',
    best: 'O(n^2)',
    average: 'O(n^2)',
    worst: 'O(n^2)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    route: '/study/cs/algorithms/sorting/selection-sort',
    quiz: {
      question: 'What is the main tradeoff of Selection Sort?',
      options: [
        'It uses few swaps but still makes quadratic comparisons.',
        'It is fast because it recursively splits the input.',
        'It requires O(n) extra arrays for every pass.',
        'It is stable for all equal values by default.',
      ],
      answerIndex: 0,
      explanation: 'Selection Sort swaps at most once per outer pass, but it still scans the unsorted suffix each time.',
    },
  },
  {
    id: 'insertion-sort',
    name: 'Insertion Sort',
    shortName: 'Insertion',
    summary: 'Builds a sorted prefix by inserting each new value where it belongs.',
    intuition: 'It behaves like sorting cards in your hand: shift larger cards aside and insert the key.',
    best: 'O(n)',
    average: 'O(n^2)',
    worst: 'O(n^2)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    route: '/study/cs/algorithms/sorting/insertion-sort',
    quiz: {
      question: 'When is Insertion Sort especially useful?',
      options: [
        'When the input is already sorted or nearly sorted.',
        'When the input must be partitioned by a pivot.',
        'When a balanced tree is required.',
        'When every value is known to be unique.',
      ],
      answerIndex: 0,
      explanation: 'Nearly sorted inputs need very few shifts, so Insertion Sort can be close to linear.',
    },
  },
  {
    id: 'merge-sort',
    name: 'Merge Sort',
    shortName: 'Merge',
    summary: 'Splits the array, sorts each half, then merges sorted halves.',
    intuition: 'Small sorted ranges are easy to merge into larger sorted ranges.',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    route: '/study/cs/algorithms/sorting/merge-sort',
    quiz: {
      question: 'Why does Merge Sort have O(n log n) time complexity?',
      options: [
        'There are log n split levels, and each level merges n total values.',
        'It swaps only adjacent values.',
        'It scans for the minimum value n times.',
        'It only sorts values that are out of order.',
      ],
      answerIndex: 0,
      explanation: 'The recursion creates about log n levels, and each level processes all n values during merging.',
    },
  },
  {
    id: 'quick-sort',
    name: 'Quick Sort',
    shortName: 'Quick',
    summary: 'Partitions values around a pivot, then recursively sorts each side.',
    intuition: 'After partitioning, every value left of the pivot is smaller and every value right is larger.',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n^2)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    route: '/study/cs/algorithms/sorting/quick-sort',
    quiz: {
      question: 'What causes Quick Sort to degrade to O(n^2)?',
      options: [
        'Repeatedly choosing pivots that create very unbalanced partitions.',
        'Using constant extra space.',
        'Comparing values in pairs.',
        'Merging two sorted halves.',
      ],
      answerIndex: 0,
      explanation: 'Bad pivots can leave one side almost as large as the original input, producing deep recursion.',
    },
  },
  {
    id: 'heap-sort',
    name: 'Heap Sort',
    shortName: 'Heap',
    summary: 'Builds a max heap, then repeatedly extracts the largest value.',
    intuition: 'The heap keeps the maximum at the root, so the next final value is always easy to remove.',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    route: '/study/cs/algorithms/sorting/heap-sort',
    quiz: {
      question: 'What does the max heap guarantee during Heap Sort?',
      options: [
        'The largest remaining value is at the root.',
        'Every value is already in final sorted order.',
        'Equal values keep their original order.',
        'The array is split into balanced halves.',
      ],
      answerIndex: 0,
      explanation: 'A max heap keeps the largest remaining value at index 0, ready to swap into the sorted suffix.',
    },
  },
];

export const getSortingAlgorithm = (id: string): SortingAlgorithm | undefined =>
  sortingAlgorithms.find((algorithm) => algorithm.id === id);

export const isSortingAlgorithmId = (id: string): id is SortingAlgorithmId =>
  sortingAlgorithms.some((algorithm) => algorithm.id === id);

const sortingAlgorithmTranslations: Record<CsLearningLanguage, Partial<Record<SortingAlgorithmId, Partial<SortingAlgorithm>>>> = {
  en: {},
  ja: {
    'bubble-sort': {
      name: 'バブルソート',
      shortName: 'バブル',
      summary: '隣り合う値を繰り返し比較し、大きい値を末尾へ移動します。',
      intuition: '各パスで、残りの中で最大の値が最終位置まで泡のように移動します。',
      quiz: {
        question: '最適化したバブルソートが最良ケースでO(n)になる理由は？',
        options: [
          '交換がないパスで処理を止められるから。',
          'すべての組を一度だけ比較するから。',
          '配列を半分に分割するから。',
          'すべての値をヒープに保存するから。',
        ],
        answerIndex: 0,
        explanation: '1回のパスで交換がなければ、配列はすでに整列済みなのでそこで終了できます。',
      },
    },
    'selection-sort': {
      name: '選択ソート',
      shortName: '選択',
      summary: '残りの中で最小の値を選び、先頭側へ置いていきます。',
      intuition: '整列済みのprefixが、選んだ最小値を1つずつ追加しながら伸びていきます。',
      quiz: {
        question: '選択ソートの主なトレードオフは？',
        options: [
          '交換回数は少ないが、比較は二乗回必要になる。',
          '入力を再帰的に分割するので高速である。',
          '各パスでO(n)の追加配列が必要になる。',
          '同じ値の順序を常に保つ。',
        ],
        answerIndex: 0,
        explanation: '外側の各パスで交換は高々1回ですが、未整列部分の走査は毎回必要です。',
      },
    },
    'insertion-sort': {
      name: '挿入ソート',
      shortName: '挿入',
      summary: '整列済みのprefixに、新しい値を正しい位置へ挿入していきます。',
      intuition: '手札を並べるように、大きい値を右へずらしてキーを差し込みます。',
      quiz: {
        question: '挿入ソートが特に有効なのはどんな入力ですか？',
        options: [
          'すでに整列済み、またはほぼ整列済みの入力。',
          'ピボットで分割する必要がある入力。',
          '平衡木が必要な入力。',
          'すべての値が一意だと分かっている入力。',
        ],
        answerIndex: 0,
        explanation: 'ほぼ整列済みの入力ではシフトが少なく、線形に近い動きになります。',
      },
    },
    'merge-sort': {
      name: 'マージソート',
      shortName: 'マージ',
      summary: '配列を分割し、それぞれを整列してから、整列済みの範囲を結合します。',
      intuition: '小さな整列済み範囲は、大きな整列済み範囲へ簡単にマージできます。',
      quiz: {
        question: 'マージソートがO(n log n)になる理由は？',
        options: [
          '分割レベルがlog n個あり、各レベルで合計n個の値をマージするから。',
          '隣り合う値だけを交換するから。',
          '最小値をn回探すから。',
          '順序が乱れた値だけを整列するから。',
        ],
        answerIndex: 0,
        explanation: '再帰で約log n段のレベルができ、各レベルのマージで全体としてn個の値を処理します。',
      },
    },
    'quick-sort': {
      name: 'クイックソート',
      shortName: 'クイック',
      summary: 'ピボットを基準に分割し、左右を再帰的に整列します。',
      intuition: '分割後は、ピボットの左に小さい値、右に大きい値が集まります。',
      quiz: {
        question: 'クイックソートがO(n^2)まで悪化する原因は？',
        options: [
          '非常に偏った分割を作るピボットを繰り返し選ぶこと。',
          '追加メモリを定数にすること。',
          '値をペアで比較すること。',
          '2つの整列済み半分をマージすること。',
        ],
        answerIndex: 0,
        explanation: '悪いピボットでは片側が元の入力に近い大きさで残り、再帰が深くなります。',
      },
    },
    'heap-sort': {
      name: 'ヒープソート',
      shortName: 'ヒープ',
      summary: '最大ヒープを作り、最大値を繰り返し取り出します。',
      intuition: 'ヒープは最大値を根に保つので、次に確定する値を取り出しやすくなります。',
      quiz: {
        question: 'ヒープソート中、最大ヒープは何を保証しますか？',
        options: [
          '残りの中で最大の値が根にある。',
          'すべての値がすでに最終順序にある。',
          '同じ値の元の順序が保たれる。',
          '配列が平衡に半分へ分割される。',
        ],
        answerIndex: 0,
        explanation: '最大ヒープでは、残っている最大値がindex 0にあり、整列済みsuffixへ移せます。',
      },
    },
  },
};

export function getLocalizedSortingAlgorithm(id: string, language: CsLearningLanguage): SortingAlgorithm | undefined {
  const algorithm = getSortingAlgorithm(id);
  if (!algorithm) return undefined;
  return {
    ...algorithm,
    ...sortingAlgorithmTranslations[language][algorithm.id],
  };
}

export function getLocalizedSortingAlgorithms(language: CsLearningLanguage): SortingAlgorithm[] {
  return sortingAlgorithms.map((algorithm) => getLocalizedSortingAlgorithm(algorithm.id, language) ?? algorithm);
}

export function generateSortSteps(
  id: SortingAlgorithmId,
  input: number[],
  language: CsLearningLanguage = 'en'
): SortStep[] {
  switch (id) {
    case 'bubble-sort':
      return bubbleSortSteps(input, language);
    case 'selection-sort':
      return selectionSortSteps(input, language);
    case 'insertion-sort':
      return insertionSortSteps(input, language);
    case 'merge-sort':
      return mergeSortSteps(input, language);
    case 'quick-sort':
      return quickSortSteps(input, language);
    case 'heap-sort':
      return heapSortSteps(input, language);
    default:
      return [];
  }
}

export function normalizeSortInput(raw: string): number[] {
  const values = raw
    .split(/[,\s]+/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));

  return values.slice(0, 14).map((value) => Math.max(1, Math.min(99, value)));
}

export function shuffleSortArray(input: number[] = DEFAULT_SORT_ARRAY): number[] {
  const values = [...input];

  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  return values;
}

export function complexitySamples() {
  return [8, 16, 32, 64, 128, 256].map((n) => ({
    n,
    quadratic: n * n,
    linearithmic: Math.round(n * Math.log2(n)),
    linear: n,
  }));
}

function pushStep(steps: SortStep[], array: number[], step: Omit<SortStep, 'array'>) {
  steps.push({
    array: [...array],
    ...step,
  });
}

function range(start: number, end: number) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

function allSorted(input: number[]) {
  return input.map((_, i) => i);
}

type SortStepCopy = {
  bubble: {
    setup: string;
    compare: (left: number, right: number) => string;
    swap: (left: number, right: number) => string;
    passComplete: string;
    noSwaps: string;
    complete: string;
  };
  selection: {
    setup: string;
    start: (position: number, currentMinimum: number) => string;
    compare: (currentMinimum: number, value: number) => string;
    newMinimum: (value: number) => string;
    moveMinimum: (position: number) => string;
    alreadySmallest: (position: number) => string;
    complete: string;
  };
  insertion: {
    setup: string;
    pick: (key: number) => string;
    shiftCompare: (value: number, key: number) => string;
    shift: (value: number) => string;
    insert: (key: number, position: number) => string;
    complete: string;
  };
  merge: {
    setup: string;
    single: (position: number) => string;
    split: (left: number, right: number) => string;
    compare: (left: number, right: number) => string;
    write: (value: number) => string;
    copyLeft: (value: number) => string;
    copyRight: (value: number) => string;
    merged: (left: number, right: number) => string;
    complete: string;
  };
  quick: {
    setup: string;
    pivot: (pivot: number, low: number, high: number) => string;
    compare: (value: number, pivot: number) => string;
    moveToSmallerSide: (value: number) => string;
    placePivot: (value: number) => string;
    alone: (value: number) => string;
    complete: string;
  };
  heap: {
    setup: string;
    compareLeft: (parent: number, child: number) => string;
    compareRight: (currentLargest: number, child: number) => string;
    restore: string;
    built: string;
    moveLargest: (value: number) => string;
    complete: string;
  };
};

const sortStepCopy: Record<CsLearningLanguage, SortStepCopy> = {
  en: {
    bubble: {
      setup: 'Start with adjacent comparisons. A pass ends when the largest remaining value reaches the right edge.',
      compare: (left, right) => `Compare ${left} and ${right}.`,
      swap: (left, right) => `Swap because ${left} was larger than ${right}.`,
      passComplete: 'This pass is complete.',
      noSwaps: 'No swaps happened, so the array is already sorted.',
      complete: 'Bubble Sort is complete.',
    },
    selection: {
      setup: 'Scan the unsorted suffix and select the smallest value for the next position.',
      start: (position, currentMinimum) => `Start position ${position}; current minimum is ${currentMinimum}.`,
      compare: (currentMinimum, value) => `Compare current minimum ${currentMinimum} with ${value}.`,
      newMinimum: (value) => `${value} is the new minimum candidate.`,
      moveMinimum: (position) => `Move the minimum value into position ${position}.`,
      alreadySmallest: (position) => `Position ${position} already has the smallest remaining value.`,
      complete: 'Selection Sort is complete.',
    },
    insertion: {
      setup: 'Treat the first value as a sorted prefix, then insert each next value into that prefix.',
      pick: (key) => `Pick up ${key} and find its place in the sorted prefix.`,
      shiftCompare: (value, key) => `${value} is larger than ${key}, so shift it right.`,
      shift: (value) => `Shift ${value} one position to the right.`,
      insert: (key, position) => `Insert ${key} into position ${position}.`,
      complete: 'Insertion Sort is complete.',
    },
    merge: {
      setup: 'Split the array into smaller ranges, then merge sorted ranges back together.',
      single: (position) => `Range [${position}] has one value, so it is already sorted.`,
      split: (left, right) => `Split positions ${left}-${right} into two halves.`,
      compare: (left, right) => `Merge compares ${left} and ${right}.`,
      write: (value) => `Write ${value} into the merged range.`,
      copyLeft: (value) => `Copy remaining left value ${value}.`,
      copyRight: (value) => `Copy remaining right value ${value}.`,
      merged: (left, right) => `Positions ${left}-${right} are merged.`,
      complete: 'Merge Sort is complete.',
    },
    quick: {
      setup: 'Partition around a pivot, then recursively sort the left and right partitions.',
      pivot: (pivot, low, high) => `Use ${pivot} as the pivot for positions ${low}-${high}.`,
      compare: (value, pivot) => `Compare ${value} with pivot ${pivot}.`,
      moveToSmallerSide: (value) => `Move ${value} into the smaller-than-pivot side.`,
      placePivot: (value) => `Place pivot ${value} into its final position.`,
      alone: (value) => `${value} is alone in its partition.`,
      complete: 'Quick Sort is complete.',
    },
    heap: {
      setup: 'Build a max heap, then move the root into the sorted suffix.',
      compareLeft: (parent, child) => `Compare parent ${parent} with left child ${child}.`,
      compareRight: (currentLargest, child) => `Compare current largest ${currentLargest} with right child ${child}.`,
      restore: 'Swap to restore the max-heap property.',
      built: 'The max heap is built.',
      moveLargest: (value) => `Move the largest remaining value ${value} into final position.`,
      complete: 'Heap Sort is complete.',
    },
  },
  ja: {
    bubble: {
      setup: '隣接比較から始めます。1回のパスは、残りの最大値が右端へ届くと終わります。',
      compare: (left, right) => `${left} と ${right} を比較します。`,
      swap: (left, right) => `${left} は ${right} より大きいので交換します。`,
      passComplete: 'このパスは完了です。',
      noSwaps: '交換がなかったので、配列はすでに整列済みです。',
      complete: 'バブルソートが完了しました。',
    },
    selection: {
      setup: '未整列のsuffixを走査し、次の位置に置く最小値を選びます。',
      start: (position, currentMinimum) => `${position}番目から始めます。現在の最小候補は${currentMinimum}です。`,
      compare: (currentMinimum, value) => `現在の最小候補${currentMinimum}と${value}を比較します。`,
      newMinimum: (value) => `${value}が新しい最小候補です。`,
      moveMinimum: (position) => `最小値を${position}番目へ移動します。`,
      alreadySmallest: (position) => `${position}番目にはすでに残りの最小値があります。`,
      complete: '選択ソートが完了しました。',
    },
    insertion: {
      setup: '最初の値を整列済みprefixとみなし、次の値をそこへ挿入していきます。',
      pick: (key) => `${key}を取り出し、整列済みprefix内の位置を探します。`,
      shiftCompare: (value, key) => `${value}は${key}より大きいので右へずらします。`,
      shift: (value) => `${value}を1つ右へシフトします。`,
      insert: (key, position) => `${key}を${position}番目へ挿入します。`,
      complete: '挿入ソートが完了しました。',
    },
    merge: {
      setup: '配列を小さな範囲に分割し、整列済み範囲としてマージして戻します。',
      single: (position) => `[${position}]の範囲は1つの値だけなので、すでに整列済みです。`,
      split: (left, right) => `${left}-${right}番目を2つの半分へ分割します。`,
      compare: (left, right) => `マージで${left}と${right}を比較します。`,
      write: (value) => `${value}をマージ中の範囲へ書き込みます。`,
      copyLeft: (value) => `左側に残った${value}をコピーします。`,
      copyRight: (value) => `右側に残った${value}をコピーします。`,
      merged: (left, right) => `${left}-${right}番目の範囲をマージしました。`,
      complete: 'マージソートが完了しました。',
    },
    quick: {
      setup: 'ピボットで分割し、左側と右側を再帰的に整列します。',
      pivot: (pivot, low, high) => `${pivot}を${low}-${high}番目のピボットとして使います。`,
      compare: (value, pivot) => `${value}をピボット${pivot}と比較します。`,
      moveToSmallerSide: (value) => `${value}をピボットより小さい側へ移動します。`,
      placePivot: (value) => `ピボット${value}を最終位置へ置きます。`,
      alone: (value) => `${value}はこの区間で単独です。`,
      complete: 'クイックソートが完了しました。',
    },
    heap: {
      setup: '最大ヒープを作り、根を整列済みsuffixへ移していきます。',
      compareLeft: (parent, child) => `親${parent}と左の子${child}を比較します。`,
      compareRight: (currentLargest, child) => `現在の最大候補${currentLargest}と右の子${child}を比較します。`,
      restore: '最大ヒープの性質を戻すために交換します。',
      built: '最大ヒープができました。',
      moveLargest: (value) => `残りの最大値${value}を最終位置へ移動します。`,
      complete: 'ヒープソートが完了しました。',
    },
  },
};

function bubbleSortSteps(input: number[], language: CsLearningLanguage): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const copy = sortStepCopy[language].bubble;

  pushStep(steps, arr, {
    phase: 'setup',
    note: copy.setup,
  });

  for (let i = 0; i < arr.length; i += 1) {
    let swapped = false;

    for (let j = 0; j < arr.length - i - 1; j += 1) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [j, j + 1],
        sorted: range(arr.length - i, arr.length - 1),
        note: copy.compare(arr[j], arr[j + 1]),
      });

      if (arr[j] > arr[j + 1]) {
        const leftValue = arr[j];
        const rightValue = arr[j + 1];
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swapped = true;
        pushStep(steps, arr, {
          phase: 'swap',
          swapping: [j, j + 1],
          sorted: range(arr.length - i, arr.length - 1),
          note: copy.swap(leftValue, rightValue),
        });
      }
    }

    pushStep(steps, arr, {
      phase: 'complete',
      sorted: range(arr.length - i - 1, arr.length - 1),
      note: swapped ? copy.passComplete : copy.noSwaps,
    });

    if (!swapped) break;
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: copy.complete,
  });

  return steps;
}

function selectionSortSteps(input: number[], language: CsLearningLanguage): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const copy = sortStepCopy[language].selection;

  pushStep(steps, arr, {
    phase: 'setup',
    note: copy.setup,
  });

  for (let i = 0; i < arr.length; i += 1) {
    let minIndex = i;

    pushStep(steps, arr, {
      phase: 'compare',
      comparing: [i],
      sorted: range(0, i - 1),
      note: copy.start(i + 1, arr[minIndex]),
    });

    for (let j = i + 1; j < arr.length; j += 1) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [minIndex, j],
        sorted: range(0, i - 1),
        note: copy.compare(arr[minIndex], arr[j]),
      });

      if (arr[j] < arr[minIndex]) {
        minIndex = j;
        pushStep(steps, arr, {
          phase: 'compare',
          comparing: [minIndex],
          sorted: range(0, i - 1),
          note: copy.newMinimum(arr[minIndex]),
        });
      }
    }

    if (minIndex !== i) {
      [arr[i], arr[minIndex]] = [arr[minIndex], arr[i]];
      pushStep(steps, arr, {
        phase: 'swap',
        swapping: [i, minIndex],
        sorted: range(0, i),
        note: copy.moveMinimum(i + 1),
      });
    } else {
      pushStep(steps, arr, {
        phase: 'complete',
        sorted: range(0, i),
        note: copy.alreadySmallest(i + 1),
      });
    }
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: copy.complete,
  });

  return steps;
}

function insertionSortSteps(input: number[], language: CsLearningLanguage): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const copy = sortStepCopy[language].insertion;

  pushStep(steps, arr, {
    phase: 'setup',
    sorted: [0],
    note: copy.setup,
  });

  for (let i = 1; i < arr.length; i += 1) {
    const key = arr[i];
    let j = i - 1;

    pushStep(steps, arr, {
      phase: 'compare',
      comparing: [i],
      sorted: range(0, i - 1),
      note: copy.pick(key),
    });

    while (j >= 0 && arr[j] > key) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [j, j + 1],
        sorted: range(0, i - 1),
        note: copy.shiftCompare(arr[j], key),
      });

      arr[j + 1] = arr[j];
      pushStep(steps, arr, {
        phase: 'write',
        writing: [j + 1],
        sorted: range(0, i),
        note: copy.shift(arr[j + 1]),
      });
      j -= 1;
    }

    arr[j + 1] = key;
    pushStep(steps, arr, {
      phase: 'write',
      writing: [j + 1],
      sorted: range(0, i),
      note: copy.insert(key, j + 2),
    });
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: copy.complete,
  });

  return steps;
}

function mergeSortSteps(input: number[], language: CsLearningLanguage): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const copy = sortStepCopy[language].merge;

  pushStep(steps, arr, {
    phase: 'setup',
    note: copy.setup,
  });

  function mergeSort(left: number, right: number) {
    if (left >= right) {
      pushStep(steps, arr, {
        phase: 'complete',
        range: [left],
        note: copy.single(left + 1),
      });
      return;
    }

    const middle = Math.floor((left + right) / 2);
    pushStep(steps, arr, {
      phase: 'partition',
      range: range(left, right),
      note: copy.split(left + 1, right + 1),
    });

    mergeSort(left, middle);
    mergeSort(middle + 1, right);

    const leftValues = arr.slice(left, middle + 1);
    const rightValues = arr.slice(middle + 1, right + 1);
    let i = 0;
    let j = 0;
    let k = left;

    while (i < leftValues.length && j < rightValues.length) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [left + i, middle + 1 + j],
        range: range(left, right),
        note: copy.compare(leftValues[i], rightValues[j]),
      });

      if (leftValues[i] <= rightValues[j]) {
        arr[k] = leftValues[i];
        i += 1;
      } else {
        arr[k] = rightValues[j];
        j += 1;
      }

      pushStep(steps, arr, {
        phase: 'write',
        writing: [k],
        range: range(left, right),
        note: copy.write(arr[k]),
      });
      k += 1;
    }

    while (i < leftValues.length) {
      arr[k] = leftValues[i];
      pushStep(steps, arr, {
        phase: 'write',
        writing: [k],
        range: range(left, right),
        note: copy.copyLeft(arr[k]),
      });
      i += 1;
      k += 1;
    }

    while (j < rightValues.length) {
      arr[k] = rightValues[j];
      pushStep(steps, arr, {
        phase: 'write',
        writing: [k],
        range: range(left, right),
        note: copy.copyRight(arr[k]),
      });
      j += 1;
      k += 1;
    }

    pushStep(steps, arr, {
      phase: 'complete',
      sorted: right - left + 1 === arr.length ? allSorted(arr) : undefined,
      range: range(left, right),
      note: copy.merged(left + 1, right + 1),
    });
  }

  if (arr.length > 0) mergeSort(0, arr.length - 1);

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: copy.complete,
  });

  return steps;
}

function quickSortSteps(input: number[], language: CsLearningLanguage): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const copy = sortStepCopy[language].quick;

  pushStep(steps, arr, {
    phase: 'setup',
    note: copy.setup,
  });

  function partition(low: number, high: number) {
    const pivotValue = arr[high];
    let pivotTarget = low;

    pushStep(steps, arr, {
      phase: 'partition',
      pivot: high,
      range: range(low, high),
      note: copy.pivot(pivotValue, low + 1, high + 1),
    });

    for (let j = low; j < high; j += 1) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [j, high],
        pivot: high,
        range: range(low, high),
        note: copy.compare(arr[j], pivotValue),
      });

      if (arr[j] <= pivotValue) {
        if (pivotTarget !== j) {
          [arr[pivotTarget], arr[j]] = [arr[j], arr[pivotTarget]];
          pushStep(steps, arr, {
            phase: 'swap',
            swapping: [pivotTarget, j],
            pivot: high,
            range: range(low, high),
            note: copy.moveToSmallerSide(arr[pivotTarget]),
          });
        }
        pivotTarget += 1;
      }
    }

    [arr[pivotTarget], arr[high]] = [arr[high], arr[pivotTarget]];
    pushStep(steps, arr, {
      phase: 'swap',
      swapping: [pivotTarget, high],
      sorted: [pivotTarget],
      range: range(low, high),
      note: copy.placePivot(arr[pivotTarget]),
    });

    return pivotTarget;
  }

  function quickSort(low: number, high: number) {
    if (low > high) return;
    if (low === high) {
      pushStep(steps, arr, {
        phase: 'complete',
        sorted: [low],
        note: copy.alone(arr[low]),
      });
      return;
    }

    const pivotIndex = partition(low, high);
    quickSort(low, pivotIndex - 1);
    quickSort(pivotIndex + 1, high);
  }

  if (arr.length > 0) quickSort(0, arr.length - 1);

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: copy.complete,
  });

  return steps;
}

function heapSortSteps(input: number[], language: CsLearningLanguage): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const sortedSuffix: number[] = [];
  const copy = sortStepCopy[language].heap;

  pushStep(steps, arr, {
    phase: 'setup',
    note: copy.setup,
  });

  function heapify(heapSize: number, root: number) {
    let largest = root;
    const left = root * 2 + 1;
    const right = root * 2 + 2;

    if (left < heapSize) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [largest, left],
        sorted: [...sortedSuffix],
        range: range(0, heapSize - 1),
        note: copy.compareLeft(arr[largest], arr[left]),
      });
      if (arr[left] > arr[largest]) largest = left;
    }

    if (right < heapSize) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [largest, right],
        sorted: [...sortedSuffix],
        range: range(0, heapSize - 1),
        note: copy.compareRight(arr[largest], arr[right]),
      });
      if (arr[right] > arr[largest]) largest = right;
    }

    if (largest !== root) {
      [arr[root], arr[largest]] = [arr[largest], arr[root]];
      pushStep(steps, arr, {
        phase: 'swap',
        swapping: [root, largest],
        sorted: [...sortedSuffix],
        range: range(0, heapSize - 1),
        note: copy.restore,
      });
      heapify(heapSize, largest);
    }
  }

  for (let i = Math.floor(arr.length / 2) - 1; i >= 0; i -= 1) {
    heapify(arr.length, i);
  }

  pushStep(steps, arr, {
    phase: 'complete',
    range: range(0, arr.length - 1),
    note: copy.built,
  });

  for (let end = arr.length - 1; end > 0; end -= 1) {
    [arr[0], arr[end]] = [arr[end], arr[0]];
    sortedSuffix.unshift(end);
    pushStep(steps, arr, {
      phase: 'swap',
      swapping: [0, end],
      sorted: [...sortedSuffix],
      note: copy.moveLargest(arr[end]),
    });
    heapify(end, 0);
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: copy.complete,
  });

  return steps;
}
