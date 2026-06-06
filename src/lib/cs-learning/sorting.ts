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

export function generateSortSteps(id: SortingAlgorithmId, input: number[]): SortStep[] {
  switch (id) {
    case 'bubble-sort':
      return bubbleSortSteps(input);
    case 'selection-sort':
      return selectionSortSteps(input);
    case 'insertion-sort':
      return insertionSortSteps(input);
    case 'merge-sort':
      return mergeSortSteps(input);
    case 'quick-sort':
      return quickSortSteps(input);
    case 'heap-sort':
      return heapSortSteps(input);
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

export function shuffleSortArray(): number[] {
  const values = Array.from({ length: 9 }, (_, i) => i + 1);

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

function bubbleSortSteps(input: number[]): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];

  pushStep(steps, arr, {
    phase: 'setup',
    note: 'Start with adjacent comparisons. A pass ends when the largest remaining value reaches the right edge.',
  });

  for (let i = 0; i < arr.length; i += 1) {
    let swapped = false;

    for (let j = 0; j < arr.length - i - 1; j += 1) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [j, j + 1],
        sorted: range(arr.length - i, arr.length - 1),
        note: `Compare ${arr[j]} and ${arr[j + 1]}.`,
      });

      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swapped = true;
        pushStep(steps, arr, {
          phase: 'swap',
          swapping: [j, j + 1],
          sorted: range(arr.length - i, arr.length - 1),
          note: `Swap because ${arr[j + 1]} was larger than ${arr[j]}.`,
        });
      }
    }

    pushStep(steps, arr, {
      phase: 'complete',
      sorted: range(arr.length - i - 1, arr.length - 1),
      note: swapped ? 'This pass is complete.' : 'No swaps happened, so the array is already sorted.',
    });

    if (!swapped) break;
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: 'Bubble Sort is complete.',
  });

  return steps;
}

function selectionSortSteps(input: number[]): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];

  pushStep(steps, arr, {
    phase: 'setup',
    note: 'Scan the unsorted suffix and select the smallest value for the next position.',
  });

  for (let i = 0; i < arr.length; i += 1) {
    let minIndex = i;

    pushStep(steps, arr, {
      phase: 'compare',
      comparing: [i],
      sorted: range(0, i - 1),
      note: `Start position ${i + 1}; current minimum is ${arr[minIndex]}.`,
    });

    for (let j = i + 1; j < arr.length; j += 1) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [minIndex, j],
        sorted: range(0, i - 1),
        note: `Compare current minimum ${arr[minIndex]} with ${arr[j]}.`,
      });

      if (arr[j] < arr[minIndex]) {
        minIndex = j;
        pushStep(steps, arr, {
          phase: 'compare',
          comparing: [minIndex],
          sorted: range(0, i - 1),
          note: `${arr[minIndex]} is the new minimum candidate.`,
        });
      }
    }

    if (minIndex !== i) {
      [arr[i], arr[minIndex]] = [arr[minIndex], arr[i]];
      pushStep(steps, arr, {
        phase: 'swap',
        swapping: [i, minIndex],
        sorted: range(0, i),
        note: `Move the minimum value into position ${i + 1}.`,
      });
    } else {
      pushStep(steps, arr, {
        phase: 'complete',
        sorted: range(0, i),
        note: `Position ${i + 1} already has the smallest remaining value.`,
      });
    }
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: 'Selection Sort is complete.',
  });

  return steps;
}

function insertionSortSteps(input: number[]): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];

  pushStep(steps, arr, {
    phase: 'setup',
    sorted: [0],
    note: 'Treat the first value as a sorted prefix, then insert each next value into that prefix.',
  });

  for (let i = 1; i < arr.length; i += 1) {
    const key = arr[i];
    let j = i - 1;

    pushStep(steps, arr, {
      phase: 'compare',
      comparing: [i],
      sorted: range(0, i - 1),
      note: `Pick up ${key} and find its place in the sorted prefix.`,
    });

    while (j >= 0 && arr[j] > key) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [j, j + 1],
        sorted: range(0, i - 1),
        note: `${arr[j]} is larger than ${key}, so shift it right.`,
      });

      arr[j + 1] = arr[j];
      pushStep(steps, arr, {
        phase: 'write',
        writing: [j + 1],
        sorted: range(0, i),
        note: `Shift ${arr[j + 1]} one position to the right.`,
      });
      j -= 1;
    }

    arr[j + 1] = key;
    pushStep(steps, arr, {
      phase: 'write',
      writing: [j + 1],
      sorted: range(0, i),
      note: `Insert ${key} into position ${j + 2}.`,
    });
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: 'Insertion Sort is complete.',
  });

  return steps;
}

function mergeSortSteps(input: number[]): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];

  pushStep(steps, arr, {
    phase: 'setup',
    note: 'Split the array into smaller ranges, then merge sorted ranges back together.',
  });

  function mergeSort(left: number, right: number) {
    if (left >= right) {
      pushStep(steps, arr, {
        phase: 'complete',
        range: [left],
        note: `Range [${left + 1}] has one value, so it is already sorted.`,
      });
      return;
    }

    const middle = Math.floor((left + right) / 2);
    pushStep(steps, arr, {
      phase: 'partition',
      range: range(left, right),
      note: `Split positions ${left + 1}-${right + 1} into two halves.`,
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
        note: `Merge compares ${leftValues[i]} and ${rightValues[j]}.`,
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
        note: `Write ${arr[k]} into the merged range.`,
      });
      k += 1;
    }

    while (i < leftValues.length) {
      arr[k] = leftValues[i];
      pushStep(steps, arr, {
        phase: 'write',
        writing: [k],
        range: range(left, right),
        note: `Copy remaining left value ${arr[k]}.`,
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
        note: `Copy remaining right value ${arr[k]}.`,
      });
      j += 1;
      k += 1;
    }

    pushStep(steps, arr, {
      phase: 'complete',
      sorted: right - left + 1 === arr.length ? allSorted(arr) : undefined,
      range: range(left, right),
      note: `Positions ${left + 1}-${right + 1} are merged.`,
    });
  }

  if (arr.length > 0) mergeSort(0, arr.length - 1);

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: 'Merge Sort is complete.',
  });

  return steps;
}

function quickSortSteps(input: number[]): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];

  pushStep(steps, arr, {
    phase: 'setup',
    note: 'Partition around a pivot, then recursively sort the left and right partitions.',
  });

  function partition(low: number, high: number) {
    const pivotValue = arr[high];
    let pivotTarget = low;

    pushStep(steps, arr, {
      phase: 'partition',
      pivot: high,
      range: range(low, high),
      note: `Use ${pivotValue} as the pivot for positions ${low + 1}-${high + 1}.`,
    });

    for (let j = low; j < high; j += 1) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [j, high],
        pivot: high,
        range: range(low, high),
        note: `Compare ${arr[j]} with pivot ${pivotValue}.`,
      });

      if (arr[j] <= pivotValue) {
        if (pivotTarget !== j) {
          [arr[pivotTarget], arr[j]] = [arr[j], arr[pivotTarget]];
          pushStep(steps, arr, {
            phase: 'swap',
            swapping: [pivotTarget, j],
            pivot: high,
            range: range(low, high),
            note: `Move ${arr[pivotTarget]} into the smaller-than-pivot side.`,
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
      note: `Place pivot ${arr[pivotTarget]} into its final position.`,
    });

    return pivotTarget;
  }

  function quickSort(low: number, high: number) {
    if (low > high) return;
    if (low === high) {
      pushStep(steps, arr, {
        phase: 'complete',
        sorted: [low],
        note: `${arr[low]} is alone in its partition.`,
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
    note: 'Quick Sort is complete.',
  });

  return steps;
}

function heapSortSteps(input: number[]): SortStep[] {
  const arr = [...input];
  const steps: SortStep[] = [];
  const sortedSuffix: number[] = [];

  pushStep(steps, arr, {
    phase: 'setup',
    note: 'Build a max heap, then move the root into the sorted suffix.',
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
        note: `Compare parent ${arr[largest]} with left child ${arr[left]}.`,
      });
      if (arr[left] > arr[largest]) largest = left;
    }

    if (right < heapSize) {
      pushStep(steps, arr, {
        phase: 'compare',
        comparing: [largest, right],
        sorted: [...sortedSuffix],
        range: range(0, heapSize - 1),
        note: `Compare current largest ${arr[largest]} with right child ${arr[right]}.`,
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
        note: 'Swap to restore the max-heap property.',
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
    note: 'The max heap is built.',
  });

  for (let end = arr.length - 1; end > 0; end -= 1) {
    [arr[0], arr[end]] = [arr[end], arr[0]];
    sortedSuffix.unshift(end);
    pushStep(steps, arr, {
      phase: 'swap',
      swapping: [0, end],
      sorted: [...sortedSuffix],
      note: `Move the largest remaining value ${arr[end]} into final position.`,
    });
    heapify(end, 0);
  }

  pushStep(steps, arr, {
    phase: 'complete',
    sorted: allSorted(arr),
    note: 'Heap Sort is complete.',
  });

  return steps;
}
