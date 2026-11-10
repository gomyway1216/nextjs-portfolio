import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getIqStrings } from '@/components/game/IqTest/i18n';
import { Question, generateQuestionForTier } from '@/components/game/IqTest/questions';
import {
  CATEGORY_ORDER,
  ReviewEntry,
  averageTimeMs,
  categoryOf,
  describeCell,
  formatSeconds,
  solvedDisplay,
  summarizeByCategory,
  visibleEntries,
} from '@/components/game/IqTest/review';
import { CategoryBreakdown, ReviewPanel, ReviewRow } from '@/components/game/IqTest/ReviewPanel';

/** A real generated question of the given generator type. */
const questionOf = (type: string): Question => {
  for (let i = 0; i < 5000; i += 1) {
    const q = generateQuestionForTier(type === 'arithmetic' ? 'easy' : 'hard');
    if (q.type === type) return q;
  }
  throw new Error(`no ${type} question generated`);
};

const wrongIndex = (q: Question): number => (q.answerIndex + 1) % q.options.length;

const entry = (q: Question, selected: number | null, timeMs: number): ReviewEntry => ({
  question: q,
  selected,
  correct: selected === q.answerIndex,
  timeMs,
});

const noop = () => {};

describe('review helpers', () => {
  it('puts every generator type into one of the five categories', () => {
    const seen = new Set<string>();
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 1500; i += 1) seen.add(generateQuestionForTier(tier).type);
    }
    expect(seen.size).toBe(9);
    for (const type of seen) expect(CATEGORY_ORDER).toContain(categoryOf(type));
    expect(categoryOf('arithmetic')).toBe('sequence');
    expect(categoryOf('geometric')).toBe('sequence');
    expect(categoryOf('square')).toBe('sequence');
    expect(categoryOf('fibonacci')).toBe('sequence');
    expect(categoryOf('alternating')).toBe('sequence');
    expect(categoryOf('odd-one-out')).toBe('oddOneOut');
    expect(categoryOf('analogy')).toBe('analogy');
    expect(categoryOf('letter')).toBe('letter');
    expect(categoryOf('matrix')).toBe('matrix');
  });

  it('tallies correct answers and mean time per category, in a fixed order, skipping unseen ones', () => {
    const seq = questionOf('fibonacci');
    const seq2 = questionOf('square');
    const matrix = questionOf('matrix');
    const analogy = questionOf('analogy');
    const history = [
      entry(matrix, matrix.answerIndex, 9000),
      entry(seq, seq.answerIndex, 4000),
      entry(analogy, null, 25000),
      entry(seq2, wrongIndex(seq2), 2000),
    ];
    expect(summarizeByCategory(history)).toEqual([
      { category: 'sequence', correct: 1, total: 2, avgMs: 3000 },
      { category: 'analogy', correct: 0, total: 1, avgMs: 25000 },
      { category: 'matrix', correct: 1, total: 1, avgMs: 9000 },
    ]);
    expect(averageTimeMs(history)).toBe(10000);
    expect(summarizeByCategory([])).toEqual([]);
    expect(averageTimeMs([])).toBe(0);
  });

  it('formats times as seconds with one decimal', () => {
    expect(formatSeconds(4230)).toBe('4.2');
    expect(formatSeconds(25000)).toBe('25.0');
    expect(formatSeconds(40)).toBe('0.0');
    expect(formatSeconds(0)).toBe('0.0');
    expect(formatSeconds(-5)).toBe('0.0');
    expect(formatSeconds(Number.NaN)).toBe('0.0');
  });

  it('keeps the original question numbers when only missed questions are listed', () => {
    const a = questionOf('letter');
    const b = questionOf('analogy');
    const c = questionOf('geometric');
    const history = [entry(a, a.answerIndex, 1), entry(b, wrongIndex(b), 1), entry(c, null, 1)];
    expect(visibleEntries(history, 'all').map((r) => r.number)).toEqual([1, 2, 3]);
    expect(visibleEntries(history, 'missed').map((r) => r.number)).toEqual([2, 3]);
  });

  it('fills the blank of a text puzzle with the keyed answer, and appends it to odd-one-out lines', () => {
    for (const type of ['arithmetic', 'geometric', 'square', 'fibonacci', 'alternating', 'analogy', 'letter']) {
      const q = questionOf(type);
      expect(q.display.match(/\?/g)).toHaveLength(1);
      expect(solvedDisplay(q)).toBe(q.display.replace('?', q.options[q.answerIndex]));
      expect(solvedDisplay(q)).not.toContain('?');
    }
    const odd = questionOf('odd-one-out');
    expect(odd.display).not.toContain('?');
    expect(solvedDisplay(odd)).toBe(`${odd.display} → ${odd.options[odd.answerIndex]}`);
  });

  it('describes a matrix cell in both languages, with English plurals', () => {
    expect(describeCell({ shape: 'circle', color: '#ef4444', count: 2 })).toEqual({
      ja: '赤の円 2個',
      en: '2 red circles',
    });
    expect(describeCell({ shape: 'star', color: '#3b82f6', count: 1 })).toEqual({
      ja: '青の星 1個',
      en: '1 blue star',
    });
  });
});

describe('review panel markup', () => {
  it('shows a collapsed row with the question number, type, solved line and time, and no detail', () => {
    const q = questionOf('fibonacci');
    const markup = renderToStaticMarkup(
      <ReviewRow entry={entry(q, q.answerIndex, 4230)} number={3} open={false} onToggle={noop} language="en" />,
    );
    expect(markup).toContain('data-outcome="correct"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="iq-review-detail-3"');
    expect(markup).toMatch(/id="iq-review-detail-3"[^>]*hidden=""/);
    expect(markup).toContain('Q3 · Number sequence');
    expect(markup).toContain(solvedDisplay(q));
    expect(markup).toContain('4.2s');
    expect(markup).not.toContain(q.explanation.en);
  });

  it('opens to the options with the pick and the right answer tagged, plus the explanation', () => {
    const q = questionOf('analogy');
    const picked = wrongIndex(q);
    const markup = renderToStaticMarkup(
      <ReviewRow entry={entry(q, picked, 8000)} number={1} open onToggle={noop} language="en" />,
    );
    expect(markup).toContain('data-outcome="wrong"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toMatch(/id="iq-review-detail-1"[^>]*hidden/);
    expect(markup.match(/data-state="answer"/g)).toHaveLength(1);
    expect(markup.match(/data-state="picked"/g)).toHaveLength(1);
    expect(markup.match(/data-state="other"/g)).toHaveLength(2);
    expect(markup).toMatch(
      new RegExp(`data-state="picked".*?>${picked + 1}\\.<.*?>${q.options[picked]}<.*?>Your answer<`),
    );
    expect(markup).toMatch(
      new RegExp(`data-state="answer".*?>${q.answerIndex + 1}\\.<.*?>${q.options[q.answerIndex]}<.*?>Correct answer<`),
    );
    expect(markup).toContain(q.explanation.en);
    expect(markup).not.toContain('No answer');
  });

  it('tags a correct pick as both the player’s answer and the right one', () => {
    const q = questionOf('letter');
    const markup = renderToStaticMarkup(
      <ReviewRow entry={entry(q, q.answerIndex, 1000)} number={2} open onToggle={noop} language="ja" />,
    );
    expect(markup.match(/data-state="answer"/g)).toHaveLength(1);
    expect(markup).not.toContain('data-state="picked"');
    expect(markup).toMatch(/data-state="answer".*?data-tone="ok"[^>]*>あなたの解答<.*?data-tone="ok"[^>]*>正解</);
    expect(markup).toContain(q.explanation.ja);
  });

  it('says so when the timer ran out, and tags no option as the player’s', () => {
    const q = questionOf('geometric');
    const markup = renderToStaticMarkup(
      <ReviewRow entry={entry(q, null, 25000)} number={4} open onToggle={noop} language="ja" />,
    );
    expect(markup).toContain('data-outcome="timeout"');
    expect(markup).toContain('時間切れのため未解答');
    expect(markup).not.toContain('あなたの解答');
    expect(markup).toContain('第4問 · 数列');
    expect(markup).toContain('25.0秒');
  });

  it('draws a matrix question as figures with localized labels', () => {
    const q = questionOf('matrix');
    const cells = q.matrix!.cellOptions;
    const ja = renderToStaticMarkup(
      <ReviewRow entry={entry(q, wrongIndex(q), 5000)} number={5} open onToggle={noop} language="ja" />,
    );
    expect(ja).toContain('aria-label="3×3 の図形マトリックス"');
    expect(ja).toContain('aria-label="空欄"');
    // 8 grid cells + 4 options + the answer in the collapsed line.
    expect(ja.match(/<svg[^>]*role="img"/g)).toHaveLength(13);
    for (const cell of cells) expect(ja).toContain(`aria-label="${describeCell(cell).ja}"`);
    expect(ja).not.toContain('matrix cell');

    const en = renderToStaticMarkup(
      <ReviewRow entry={entry(q, wrongIndex(q), 5000)} number={5} open onToggle={noop} language="en" />,
    );
    expect(en).toContain('aria-label="3 by 3 pattern matrix"');
    expect(en).toContain(`aria-label="${describeCell(cells[q.answerIndex]).en}"`);
  });

  it('lists the per-type tally with counts and mean times', () => {
    const seq = questionOf('fibonacci');
    const matrix = questionOf('matrix');
    const history = [entry(seq, seq.answerIndex, 4000), entry(seq, wrongIndex(seq), 2000), entry(matrix, null, 9000)];
    const markup = renderToStaticMarkup(<CategoryBreakdown history={history} language="en" />);
    expect(markup.match(/data-category="/g)).toHaveLength(2);
    expect(markup).toMatch(/data-category="sequence".*?Number sequence.*?1 \/ 2 correct · avg 3\.0s.*?width:50%/);
    expect(markup).toMatch(/data-category="matrix".*?Figure matrix.*?0 \/ 1 correct · avg 9\.0s.*?width:0%/);
    expect(markup).toContain('Average time per question: 5.0s');
  });

  it('starts with every row collapsed and offers the missed-only filter only when it would change the list', () => {
    const a = questionOf('letter');
    const b = questionOf('analogy');
    const mixed = [entry(a, a.answerIndex, 1000), entry(b, wrongIndex(b), 1000)];
    const markup = renderToStaticMarkup(<ReviewPanel history={mixed} language="en" />);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(markup).not.toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Questions to show"');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>All \(2\)</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Missed only \(1\)</);

    const allRight = renderToStaticMarkup(<ReviewPanel history={[mixed[0]]} language="en" />);
    expect(allRight).not.toContain('aria-pressed');
    const allWrong = renderToStaticMarkup(<ReviewPanel history={[mixed[1]]} language="en" />);
    expect(allWrong).not.toContain('aria-pressed');
  });
});

describe('strings and styles', () => {
  it('has every review string in both languages', () => {
    const ja = getIqStrings('ja');
    const en = getIqStrings('en');
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const category of CATEGORY_ORDER) {
      expect(ja.categoryLabel[category]).toBeTruthy();
      expect(en.categoryLabel[category]).toBeTruthy();
      expect(ja.categoryLabel[category]).not.toBe(en.categoryLabel[category]);
    }
  });

  it('takes right/wrong text colours from per-theme variables and stacks review options on narrow screens', () => {
    const css = readFileSync(
      path.resolve(__dirname, '../../../../../src/components/game/IqTest/IqTest.module.css'),
      'utf8',
    );
    expect(css).toMatch(/\.root \{[^}]*--iq-ok: #15803d;[^}]*--iq-no: #b91c1c;/);
    expect(css).toMatch(/:global\(html\.dark\) \.root \{[^}]*--iq-ok: #4ade80;[^}]*--iq-no: #fca5a5;/);
    expect(css).toMatch(/\.reviewMarkOk \{ color: var\(--iq-ok\); \}/);
    expect(css).toMatch(/\.reviewTag\[data-tone='no'\] \{ color: var\(--iq-no\); \}/);
    expect(css).toMatch(/@media \(max-width: 390px\) \{\s*\.reviewOptions \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
