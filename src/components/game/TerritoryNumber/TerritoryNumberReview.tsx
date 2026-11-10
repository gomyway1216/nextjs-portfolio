/**
 * Territory Number — post-game review.
 *
 * Steps through a finished match move by move. Every move is graded against
 * the exact solution of the position it was played from (see `review.ts`), so
 * the player sees which placements gave lines away and what would have kept
 * them.
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { evaluateBoard } from './gameLogic';
import {
  biggestMistakeIndex,
  boardsFromMoves,
  reviewMove,
  summarizeReview,
  type MoveGrade,
  type MoveRecord,
  type MoveReview,
} from './review';
import type { PlayerSlot } from './types';
import { getTerritoryNumberStrings } from './i18n';
import type { GameLanguage } from '../constants/gameTranslations';
import styles from './TerritoryNumber.module.css';

interface TerritoryNumberReviewProps {
  moves: MoveRecord[];
  mySlot: PlayerSlot;
  myLabel: string;
  opponentLabel: string;
  language: GameLanguage;
  onBack: () => void;
  onPlayAgain: () => void;
}

const P1_COLOR = { color: '#2563eb', soft: 'rgba(37, 99, 235, 0.16)' };
const P2_COLOR = { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.16)' };
const accent = (slot: PlayerSlot) => (slot === 'p1' ? P1_COLOR : P2_COLOR);

const GRADE_CLASS: Record<MoveGrade, string> = {
  best: styles.gradeBest,
  inaccuracy: styles.gradeInaccuracy,
  mistake: styles.gradeMistake,
};

export function TerritoryNumberReview({
  moves,
  mySlot,
  myLabel,
  opponentLabel,
  language,
  onBack,
  onPlayAgain,
}: TerritoryNumberReviewProps) {
  const s = getTerritoryNumberStrings(language);
  const total = moves.length;
  const oppSlot: PlayerSlot = mySlot === 'p1' ? 'p2' : 'p1';

  const boards = useMemo(() => boardsFromMoves(moves), [moves]);
  /** 0 = empty board, k = position after the k-th move. */
  const [step, setStep] = useState(Math.min(1, total));
  const [reviews, setReviews] = useState<Array<MoveReview | null>>(() => moves.map(() => null));

  // Solve one move per tick, cheapest (latest) first, so the screen paints and
  // stays responsive while the wide-open first moves are being solved.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let index = moves.length - 1;
    const solveNext = () => {
      const i = index;
      if (i < 0) return;
      const review = reviewMove(boards[i], moves[i]);
      setReviews(prev => prev.map((r, j) => (j === i ? review : r)));
      index -= 1;
      timer = setTimeout(solveNext, 0);
    };
    timer = setTimeout(solveNext, 0);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [boards, moves]);

  const done = reviews.every(r => r !== null);
  const solved = useMemo(
    () => (done ? (reviews as MoveReview[]) : null),
    [done, reviews]
  );
  const mistakeIndex = useMemo(
    () => (solved ? biggestMistakeIndex(solved, mySlot) : null),
    [solved, mySlot]
  );

  const labelFor = (slot: PlayerSlot) => (slot === mySlot ? myLabel : opponentLabel);
  const cellName = (cellIndex: number) =>
    s.cellName(Math.floor(cellIndex / 3) + 1, (cellIndex % 3) + 1);
  const gradeLabel = (grade: MoveGrade) =>
    grade === 'best' ? s.gradeBest : grade === 'inaccuracy' ? s.gradeInaccuracy : s.gradeMistake;
  /** A mover-relative margin, seen from the local player's side. */
  const forMe = (slot: PlayerSlot, margin: number) => (slot === mySlot ? margin : 0 - margin);

  const board = boards[step];
  const evaluation = useMemo(() => evaluateBoard(board), [board]);
  const myLines = mySlot === 'p1' ? evaluation.p1Captures : evaluation.p2Captures;
  const oppLines = mySlot === 'p1' ? evaluation.p2Captures : evaluation.p1Captures;

  const current = step > 0 ? moves[step - 1] : null;
  const currentReview = step > 0 ? reviews[step - 1] : null;
  const showBest = currentReview !== null && currentReview.loss > 0 ? currentReview.best : null;

  // Outlook for the position on screen: after the move shown, or — on the
  // empty board — what the first player can force. The full board needs none.
  let outlook: string | null = null;
  if (step === total) {
    outlook = null;
  } else if (currentReview) {
    outlook = s.outlook(forMe(currentReview.move.slot, currentReview.playedMargin));
  } else if (step === 0 && total > 0 && reviews[0]) {
    outlook = s.outlook(forMe(reviews[0].move.slot, reviews[0].bestMargin));
  }

  const summaryFor = (slot: PlayerSlot) => {
    if (!solved) return null;
    const sum = summarizeReview(solved, slot);
    return s.reviewSummary(labelFor(slot), sum.bestMoves, sum.moves, sum.linesLost);
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button type="button" onClick={onBack} className={styles.ghostButton}>
          ← {s.backToResult}
        </button>
        <span className={styles.headerTitle}>{s.reviewTitle}</span>
        <button type="button" onClick={onPlayAgain} className={styles.ghostButton}>
          {s.playAgain}
        </button>
      </div>

      <div className={styles.reviewBody}>
        <div className={styles.reviewBoardWrap}>
          <div
            className={`${styles.board} ${styles.reviewBoard}`}
            role="group"
            aria-label={step === 0 ? s.startPosition : s.moveOf(step, total)}
          >
            {board.map((cell, idx) => {
              const empty = cell.value === null || cell.owner === null;
              const acc = cell.owner ? accent(cell.owner) : null;
              const isLast = current !== null && current.cellIndex === idx;
              const isBest = showBest !== null && showBest.cellIndex === idx;
              const cellLabel = cell.value === null || cell.owner === null
                ? s.emptyCell(Math.floor(idx / 3) + 1, (idx % 3) + 1)
                : `${cellName(idx)}: ${s.filledCell(cell.value, labelFor(cell.owner))}`;
              return (
                <div
                  key={idx}
                  role="img"
                  aria-label={isBest && showBest ? `${cellLabel} (${s.bestMarker(showBest.card)})` : cellLabel}
                  className={[
                    styles.cell,
                    styles.reviewCell,
                    !empty ? styles.cellFilled : '',
                    isLast ? styles.reviewCellLast : '',
                    isBest && empty ? styles.reviewCellBest : '',
                  ].filter(Boolean).join(' ')}
                  style={
                    acc
                      ? ({ ['--own-color' as string]: acc.color, ['--own-soft' as string]: acc.soft } as React.CSSProperties)
                      : undefined
                  }
                >
                  {empty ? '' : cell.value}
                  {isBest && showBest && (
                    <span className={styles.reviewBestBadge} title={s.bestMarker(showBest.card)}>
                      ★{showBest.card}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.reviewScore}>
            <span style={{ color: accent(mySlot).color }}>{myLabel} {myLines}</span>
            <span className={styles.reviewScoreSep}>{s.lines}</span>
            <span style={{ color: accent(oppSlot).color }}>{oppLines} {opponentLabel}</span>
          </div>
        </div>

        <div className={styles.reviewDetail} aria-live="polite">
          <div className={styles.reviewDetailHead}>
            <span className={styles.reviewStepLabel}>
              {step === 0 ? s.startPosition : s.moveOf(step, total)}
            </span>
            {currentReview && (
              <span className={`${styles.gradeBadge} ${GRADE_CLASS[currentReview.grade]}`}>
                {gradeLabel(currentReview.grade)}
              </span>
            )}
          </div>
          {current && (
            <div className={styles.reviewMoveText}>
              {s.movePlaced(labelFor(current.slot), current.card, cellName(current.cellIndex))}
            </div>
          )}
          {current && !currentReview && (
            <div className={styles.reviewMuted}>{s.analysing}</div>
          )}
          {currentReview && (
            <div className={styles.reviewMuted}>
              {currentReview.loss === 0
                ? s.noLoss
                : `${s.lossText(currentReview.loss)} ${s.bestWas(
                    currentReview.best.card,
                    cellName(currentReview.best.cellIndex)
                  )}`}
            </div>
          )}
          {outlook && <div className={styles.reviewOutlook}>{outlook}</div>}
        </div>

        <div className={styles.reviewNav}>
          <button
            type="button"
            className={styles.reviewNavButton}
            onClick={() => setStep(0)}
            disabled={step === 0}
            aria-label={s.stepFirst}
            title={s.stepFirst}
          >
            <ChevronsLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.reviewNavButton}
            onClick={() => setStep(v => Math.max(0, v - 1))}
            disabled={step === 0}
            aria-label={s.stepPrev}
            title={s.stepPrev}
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.reviewNavButton}
            onClick={() => setStep(v => Math.min(total, v + 1))}
            disabled={step === total}
            aria-label={s.stepNext}
            title={s.stepNext}
          >
            <ChevronRight size={20} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.reviewNavButton}
            onClick={() => setStep(total)}
            disabled={step === total}
            aria-label={s.stepLast}
            title={s.stepLast}
          >
            <ChevronsRight size={20} aria-hidden />
          </button>
        </div>

        <div className={styles.reviewMoves} role="group" aria-label={s.moveList}>
          {moves.map((move, i) => {
            const review = reviews[i];
            const acc = accent(move.slot);
            const grade = review ? gradeLabel(review.grade) : s.analysing;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i + 1)}
                aria-pressed={step === i + 1}
                aria-label={s.moveChip(i + 1, labelFor(move.slot), grade)}
                className={`${styles.reviewMoveChip} ${step === i + 1 ? styles.reviewMoveChipActive : ''}`}
                style={{
                  ['--chip-border' as string]: acc.color,
                  ['--chip-soft' as string]: acc.soft,
                } as React.CSSProperties}
              >
                <span className={styles.reviewMoveChipCard}>{move.card}</span>
                <span className={styles.reviewMoveChipGrade}>
                  {review ? (review.loss === 0 ? '✓' : `−${review.loss}`) : '…'}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.reviewSummary}>
          <p className={styles.reviewIntro}>{s.reviewIntro}</p>
          {solved ? (
            <>
              <div className={styles.reviewSummaryRow}>
                <span className={styles.reviewDot} style={{ background: accent(mySlot).color }} />
                {summaryFor(mySlot)}
              </div>
              <div className={styles.reviewSummaryRow}>
                <span className={styles.reviewDot} style={{ background: accent(oppSlot).color }} />
                {summaryFor(oppSlot)}
              </div>
              {mistakeIndex !== null ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setStep(mistakeIndex + 1)}
                >
                  {s.jumpToMistake}
                </button>
              ) : (
                <div className={styles.reviewPraise}>{s.noMistakes}</div>
              )}
            </>
          ) : (
            <div className={styles.reviewSummaryRow} role="status">{s.analysing}</div>
          )}
        </div>
      </div>
    </div>
  );
}
