/**
 * Post-game review: every move of the finished game with its grade against
 * perfect play. Selecting a move asks the parent to show that position.
 */

import { HUMAN_MARK, MoveReview } from './analysis';
import type { TicTacToeCopy } from './i18n';
import styles from './TicTacToe.module.css';

interface GameReviewProps {
  reviews: MoveReview[];
  /** Index of the move whose position is on the board, or null for the final position. */
  selected: number | null;
  onSelect: (index: number | null) => void;
  copy: TicTacToeCopy;
}

const GameReview = ({ reviews, selected, onSelect, copy }: GameReviewProps) => {
  const slips = reviews.filter(r => r.mark === HUMAN_MARK && r.grade !== 'good').length;
  const current = selected !== null ? reviews[selected] : undefined;

  return (
    <section className={styles.review} aria-label={copy.reviewTitle}>
      <h2 className={styles.reviewTitle}>{copy.reviewTitle}</h2>
      <p className={styles.reviewIntro}>{copy.reviewIntro}</p>
      <ol className={styles.reviewList}>
        {reviews.map((review, index) => (
          <li key={index}>
            <button
              type="button"
              className={styles.reviewMove}
              data-grade={review.grade}
              aria-pressed={selected === index}
              onClick={() => onSelect(selected === index ? null : index)}
            >
              <span className={styles.reviewNumber}>{index + 1}.</span>
              <span
                className={review.mark === HUMAN_MARK ? styles.markX : styles.markO}
                aria-hidden
              >
                {review.mark === HUMAN_MARK ? '✕' : '○'}
              </span>
              <span className={styles.reviewName}>
                {review.mark === HUMAN_MARK ? copy.you : copy.ai} · {copy.cellNames[review.cell]}
              </span>
              <span className={styles.reviewGrade}>{copy.grades[review.grade]}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className={styles.reviewVerdict} aria-live="polite">
        {current
          ? copy.verdict(
              current,
              current.grade === 'good' ? [] : current.bestCells.map(cell => copy.cellNames[cell])
            )
          : copy.reviewSummary(slips)}
      </p>
      {selected !== null && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSecondary} ${styles.reviewBack}`}
          onClick={() => onSelect(null)}
        >
          {copy.finalPosition}
        </button>
      )}
    </section>
  );
};

export default GameReview;
