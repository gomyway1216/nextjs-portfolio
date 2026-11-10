import type { Ref } from 'react';

import type { RouteReview as RouteReviewData, ScoreBreakdown } from './engine';
import type { MemoryMazeStrings } from './i18n';
import styles from './MemoryMaze.module.css';

interface RouteReviewProps {
  t: MemoryMazeStrings;
  review: RouteReviewData;
  /** Score parts of a cleared stage; null when the stage was lost. */
  breakdown: ScoreBreakdown | null;
  onBack: () => void;
  backButtonRef?: Ref<HTMLButtonElement>;
}

const headlineOf = (t: MemoryMazeStrings, review: RouteReviewData): string => {
  if (!review.reachedGoal) return t.reviewStopped(review.stepsFromGoal);
  return review.extraSteps === 0 ? t.reviewMatched : t.reviewLonger(review.extraSteps);
};

export const RouteReview = ({ t, review, breakdown, onBack, backButtonRef }: RouteReviewProps) => (
  <section className={styles.review} aria-labelledby="memory-maze-review-title">
    <h2 id="memory-maze-review-title" className={styles.reviewTitle}>
      {t.reviewTitle}
    </h2>
    <p className={styles.reviewHeadline} data-tone={review.reachedGoal ? 'good' : 'bad'}>
      {headlineOf(t, review)}
    </p>

    <dl className={styles.reviewRows}>
      <dt>{t.reviewSteps}</dt>
      <dd>{review.steps}</dd>
      <dt>{t.reviewShortest}</dt>
      <dd>{review.shortestSteps}</dd>
      <dt>{t.reviewRepeated}</dt>
      <dd>{review.repeatedSteps}</dd>
      <dt>{t.reviewWallHits}</dt>
      <dd>{t.reviewWallHitsValue(review.wallHits, review.wallsHit)}</dd>
    </dl>

    {breakdown && (
      <>
        <h3 className={styles.reviewSubtitle}>{t.reviewScoreTitle}</h3>
        <dl className={styles.reviewRows}>
          <dt>{t.reviewBase}</dt>
          <dd>+{breakdown.base}</dd>
          <dt>{t.reviewEfficiency}</dt>
          <dd>+{breakdown.efficiency}</dd>
          <dt>{t.reviewTimeBonus}</dt>
          <dd>+{breakdown.timeBonus}</dd>
          <dt>{t.reviewLivesBonus}</dt>
          <dd>+{breakdown.livesBonus}</dd>
          <dt>{t.reviewMultiplier}</dt>
          <dd>×{breakdown.multiplier}</dd>
          <dt className={styles.reviewTotal}>{t.reviewStageScore}</dt>
          <dd className={styles.reviewTotal}>{breakdown.total}</dd>
        </dl>
      </>
    )}

    <ul className={styles.legend} aria-label={t.reviewLegend}>
      <li>
        <span className={`${styles.swatch} ${styles.cellVisited}`} aria-hidden="true" />
        {t.legendYourRoute}
      </li>
      <li>
        <span className={`${styles.swatch} ${styles.swatchFloor} ${styles.cellShortest}`} aria-hidden="true" />
        {t.legendShortest}
      </li>
      <li>
        <span className={`${styles.swatch} ${styles.cellWall} ${styles.cellHit}`} aria-hidden="true" />
        {t.legendWallHit}
      </li>
      <li>
        <span className={`${styles.swatch} ${styles.swatchPlayer}`} aria-hidden="true" />
        {t.legendYou}
      </li>
      <li>
        <span className={`${styles.swatch} ${styles.swatchGoal}`} aria-hidden="true" />
        {t.legendGoal}
      </li>
    </ul>
    <p className={styles.reviewNote}>{t.reviewNote}</p>

    <div className={styles.actions}>
      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onBack} ref={backButtonRef}>
        {t.reviewBack}
      </button>
    </div>
  </section>
);
