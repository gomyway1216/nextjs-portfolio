import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SORT_ARRAY,
  generateSortSteps,
  normalizeSortInput,
  shuffleSortArray,
  sortingAlgorithms,
  type SortingAlgorithmId,
} from '@/lib/cs-learning/sorting';

const sampleInput = [5, 3, 8, 1, 2, 7, 4, 6];

function sorted(values: number[]) {
  return [...values].sort((a, b) => a - b);
}

describe('CS Learning Lab sorting logic', () => {
  it.each(sortingAlgorithms.map((algorithm) => [algorithm.name, algorithm.id] as const))(
    '%s produces a final sorted array',
    (_name, algorithmId) => {
      const steps = generateSortSteps(algorithmId, sampleInput);
      const finalStep = steps.at(-1);

      expect(finalStep?.array).toEqual(sorted(sampleInput));
      expect(finalStep?.phase).toBe('complete');
    }
  );

  it('keeps the Bubble Sort swap explanation aligned with pre-swap values', () => {
    const steps = generateSortSteps('bubble-sort', [9, 4, 7]);
    const firstSwap = steps.find((step) => step.phase === 'swap');

    expect(firstSwap?.array).toEqual([4, 9, 7]);
    expect(firstSwap?.note).toBe('Swap because 9 was larger than 4.');
  });

  it('shuffles the provided values without resetting length or contents', () => {
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0);

    const input = [10, 20, 30, 40];
    const shuffled = shuffleSortArray(input);

    expect(shuffled).toHaveLength(input.length);
    expect(sorted(shuffled)).toEqual(sorted(input));
    expect(shuffled).not.toEqual(input);
    expect(input).toEqual([10, 20, 30, 40]);

    randomSpy.mockRestore();
  });

  it('uses the default array when no shuffle input is supplied', () => {
    const shuffled = shuffleSortArray();

    expect(shuffled).toHaveLength(DEFAULT_SORT_ARRAY.length);
    expect(sorted(shuffled)).toEqual(sorted(DEFAULT_SORT_ARRAY));
  });

  it('normalizes raw array input into bounded integer values', () => {
    expect(normalizeSortInput('12, -3 text 200 4.9 0 7')).toEqual([12, 1, 99, 4, 1, 7]);
  });

  it('limits normalized input to the visualizer maximum length', () => {
    const raw = Array.from({ length: 20 }, (_, index) => String(index + 1)).join(', ');

    expect(normalizeSortInput(raw)).toHaveLength(14);
  });

  it('returns no steps for an unknown algorithm id at runtime', () => {
    expect(generateSortSteps('unknown' as SortingAlgorithmId, sampleInput)).toEqual([]);
  });
});
