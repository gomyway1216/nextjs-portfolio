import type { Bilingual, CellSpec, Question } from './questions';
import { colorName, shapeName } from './questions';

/** One answered question, as kept for the end-of-test review. */
export interface ReviewEntry {
  question: Question;
  /** Index of the option the player picked; `null` when the timer ran out. */
  selected: number | null;
  correct: boolean;
  /** Time the question was on screen before it was answered (How-to-play pauses excluded). */
  timeMs: number;
}

export type QuestionCategory = 'sequence' | 'oddOneOut' | 'analogy' | 'letter' | 'matrix';

export const CATEGORY_ORDER: QuestionCategory[] = [
  'sequence',
  'oddOneOut',
  'analogy',
  'letter',
  'matrix',
];

/** Groups the generator ids into the five kinds of puzzle the test draws from. */
export const categoryOf = (type: string): QuestionCategory => {
  if (type === 'odd-one-out') return 'oddOneOut';
  if (type === 'analogy') return 'analogy';
  if (type === 'letter') return 'letter';
  if (type === 'matrix') return 'matrix';
  return 'sequence';
};

export interface CategorySummary {
  category: QuestionCategory;
  correct: number;
  total: number;
  /** Mean time per question in this category, in milliseconds. */
  avgMs: number;
}

/** Per-category tally in a fixed order; categories that never came up are left out. */
export const summarizeByCategory = (entries: readonly ReviewEntry[]): CategorySummary[] =>
  CATEGORY_ORDER.flatMap((category) => {
    const own = entries.filter((e) => categoryOf(e.question.type) === category);
    if (own.length === 0) return [];
    return [
      {
        category,
        correct: own.filter((e) => e.correct).length,
        total: own.length,
        avgMs: own.reduce((sum, e) => sum + e.timeMs, 0) / own.length,
      },
    ];
  });

export const averageTimeMs = (entries: readonly ReviewEntry[]): number =>
  entries.length === 0 ? 0 : entries.reduce((sum, e) => sum + e.timeMs, 0) / entries.length;

/** Seconds with one decimal, e.g. 4230 → "4.2". Negative or non-finite input reads as "0.0". */
export const formatSeconds = (ms: number): string =>
  (Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0).toFixed(1);

export type ReviewFilter = 'all' | 'missed';

/** Entries to list, each with its 1-based question number so numbering survives filtering. */
export const visibleEntries = (
  entries: readonly ReviewEntry[],
  filter: ReviewFilter,
): { number: number; entry: ReviewEntry }[] =>
  entries
    .map((entry, i) => ({ number: i + 1, entry }))
    .filter(({ entry }) => filter === 'all' || !entry.correct);

/**
 * One-line form of a text puzzle with its answer: the blank filled in, or, for
 * odd-one-out puzzles (which have no blank), the items followed by "→ answer".
 */
export const solvedDisplay = (question: Question): string => {
  const answer = question.options[question.answerIndex];
  return question.display.includes('?')
    ? question.display.replace('?', answer)
    : `${question.display} → ${answer}`;
};

const EN_PLURAL: Record<CellSpec['shape'], string> = {
  circle: 'circles',
  square: 'squares',
  triangle: 'triangles',
  star: 'stars',
};

/** Words for a matrix cell, e.g. "2 red circles" / "赤の円 2個". */
export const describeCell = (cell: CellSpec): Bilingual => ({
  ja: `${colorName[cell.color].ja}の${shapeName[cell.shape].ja} ${cell.count}個`,
  en: `${cell.count} ${colorName[cell.color].en} ${
    cell.count === 1 ? shapeName[cell.shape].en : EN_PLURAL[cell.shape]
  }`,
});
