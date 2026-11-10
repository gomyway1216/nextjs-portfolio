'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { GameLanguage } from '../constants/gameTranslations';

import { CellShapeSvg, MatrixGridView } from './figures';
import { getIqStrings } from './i18n';
import {
  ReviewEntry,
  ReviewFilter,
  averageTimeMs,
  categoryOf,
  formatSeconds,
  solvedDisplay,
  summarizeByCategory,
  visibleEntries,
} from './review';
import styles from './IqTest.module.css';

const outcomeOf = (entry: ReviewEntry): 'correct' | 'wrong' | 'timeout' =>
  entry.correct ? 'correct' : entry.selected === null ? 'timeout' : 'wrong';

export const CategoryBreakdown = ({
  history,
  language,
}: {
  history: readonly ReviewEntry[];
  language: GameLanguage;
}) => {
  const t = getIqStrings(language);
  return (
    <section className={styles.breakdown} aria-labelledby="iq-breakdown-title">
      <h2 id="iq-breakdown-title" className={styles.reviewSectionTitle}>
        {t.breakdownTitle}
      </h2>
      <ul className={styles.breakdownList}>
        {summarizeByCategory(history).map((row) => (
          <li key={row.category} className={styles.breakdownRow} data-category={row.category}>
            <span className={styles.breakdownLabel}>{t.categoryLabel[row.category]}</span>
            <span className={styles.breakdownScore}>
              {t.outOf(row.correct, row.total)} · {t.avgTime(formatSeconds(row.avgMs))}
            </span>
            <span className={styles.breakdownTrack} aria-hidden>
              <span
                className={styles.breakdownFill}
                style={{ width: `${(row.correct / row.total) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.breakdownNote}>{t.avgTimeOverall(formatSeconds(averageTimeMs(history)))}</p>
    </section>
  );
};

export const ReviewRow = ({
  entry,
  number,
  open,
  onToggle,
  language,
}: {
  entry: ReviewEntry;
  number: number;
  open: boolean;
  onToggle: () => void;
  language: GameLanguage;
}) => {
  const t = getIqStrings(language);
  const q = entry.question;
  const outcome = outcomeOf(entry);
  const outcomeText =
    outcome === 'correct' ? t.correctLabel : outcome === 'timeout' ? t.timeUp : t.wrongFeedback;
  const detailId = `iq-review-detail-${number}`;

  return (
    <li className={styles.reviewItem} data-outcome={outcome}>
      <button
        type="button"
        className={styles.reviewToggle}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span
          className={styles.reviewMark + ' ' + (entry.correct ? styles.reviewMarkOk : styles.reviewMarkNo)}
          aria-hidden
        >
          {outcome === 'correct' ? '◯' : outcome === 'timeout' ? '⏱' : '✗'}
        </span>
        <span className={styles.reviewBody}>
          <span className={styles.reviewMeta}>
            {t.questionNo(number)} · {t.categoryLabel[categoryOf(q.type)]}
            <span className={styles.srOnly}> · {outcomeText}</span>
          </span>
          {q.matrix ? (
            <span className={styles.reviewLine}>
              <span>{t.correctAnswerLabel}:</span>
              <CellShapeSvg cell={q.matrix.cellOptions[q.answerIndex]} size={30} language={language} />
            </span>
          ) : (
            <span className={styles.reviewLine}>{solvedDisplay(q)}</span>
          )}
        </span>
        <span className={styles.reviewTime}>{t.timeTaken(formatSeconds(entry.timeMs))}</span>
        <ChevronDown className={styles.reviewChevron} data-open={open} aria-hidden />
      </button>

      {/* Always in the DOM so aria-controls has a target; hidden when collapsed. */}
      <div id={detailId} className={styles.reviewDetail} hidden={!open}>
        {open && (
          <>
            <p className={styles.reviewPrompt}>{q.prompt[language]}</p>
            {q.matrix ? (
              <MatrixGridView grid={q.matrix.grid} language={language} compact />
            ) : (
              <div className={styles.reviewPuzzle}>{q.display}</div>
            )}
            <ul className={styles.reviewOptions}>
              {q.options.map((opt, i) => {
                const isAnswer = i === q.answerIndex;
                const isPicked = i === entry.selected;
                return (
                  <li
                    key={i}
                    className={styles.reviewOption}
                    data-state={isAnswer ? 'answer' : isPicked ? 'picked' : 'other'}
                  >
                    <span className={styles.optionKey}>{i + 1}.</span>
                    {q.matrix ? (
                      <CellShapeSvg cell={q.matrix.cellOptions[i]} size={36} language={language} />
                    ) : (
                      <span className={styles.reviewOptionValue}>{opt}</span>
                    )}
                    {isPicked && (
                      <span className={styles.reviewTag} data-tone={isAnswer ? 'ok' : 'no'}>
                        {t.yourAnswer}
                      </span>
                    )}
                    {isAnswer && (
                      <span className={styles.reviewTag} data-tone="ok">
                        {t.correctAnswerLabel}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {entry.selected === null && <p className={styles.reviewNoAnswer}>{t.noAnswer}</p>}
            <p className={styles.explanation}>{q.explanation[language]}</p>
          </>
        )}
      </div>
    </li>
  );
};

/**
 * End-of-test review: a tally per question type, then every question with the
 * player's pick, the right answer, the time it took and its explanation.
 * Mounted only on the result screen, so its filter and open rows start fresh
 * for every test.
 */
export const ReviewPanel = ({
  history,
  language,
}: {
  history: readonly ReviewEntry[];
  language: GameLanguage;
}) => {
  const t = getIqStrings(language);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [openRows, setOpenRows] = useState<ReadonlySet<number>>(new Set());

  const missed = history.filter((h) => !h.correct).length;
  const rows = visibleEntries(history, filter);

  const toggle = (number: number) =>
    setOpenRows((prev) => {
      const nextRows = new Set(prev);
      if (nextRows.has(number)) nextRows.delete(number);
      else nextRows.add(number);
      return nextRows;
    });

  return (
    <>
      <CategoryBreakdown history={history} language={language} />

      <section aria-labelledby="iq-review-title">
        <div className={styles.reviewHeader}>
          <h2 id="iq-review-title" className={styles.reviewSectionTitle}>
            {t.reviewTitle}
          </h2>
          {missed > 0 && missed < history.length && (
            <div className={styles.reviewFilter} role="group" aria-label={t.filterLabel}>
              {(['all', 'missed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={styles.filterBtn}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? t.filterAll(history.length) : t.filterMissed(missed)}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className={styles.reviewHintLine}>{t.reviewHint}</p>
        <ul className={styles.reviewList}>
          {rows.map(({ number, entry }) => (
            <ReviewRow
              key={number}
              entry={entry}
              number={number}
              open={openRows.has(number)}
              onToggle={() => toggle(number)}
              language={language}
            />
          ))}
        </ul>
      </section>
    </>
  );
};
