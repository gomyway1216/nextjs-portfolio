import { MiniCard } from './Cards';
import { rankOf, suitOf, type Move } from './engine';
import type { HighLowStrings } from './i18n';
import type { GameReview } from './review';
import styles from './HighLow.module.css';

/** Medals a choice gave up, to two places; a little that would round to nothing keeps its first digit. */
export const gaveUpText = (medals: number, locale: string): string =>
  medals > 0 && medals < 0.005 ? medals.toLocaleString(locale, { maximumSignificantDigits: 1 }) : medals.toLocaleString(locale, { maximumFractionDigits: 2 });

export interface ReviewPanelProps {
  /** The game looked back over: null until one has ended on this page. */
  review: GameReview | null;
  /** The visit's choices so far, and how many of them were a best one. */
  visit: { choices: number; matched: number };
  t: HighLowStrings;
  locale: string;
}

/** A finished game beside best play: each choice, how it came out, and what it gave up on average (review.ts). */
export function ReviewPanel({ review, visit, t, locale }: ReviewPanelProps) {
  const moveWord = (move: Move): string => (move === 'take' ? t.take : move === 'high' ? t.high : t.low);
  const resultWord = { right: t.reviewRight, wrong: t.reviewWrong, tie: t.reviewTie };
  return (
    <section className={styles.panel} aria-labelledby="hl-review-title" data-testid="hl-review">
      <h2 id="hl-review-title" className={styles.panelTitle}>
        {t.reviewTitle}
      </h2>
      {review === null ? (
        <p className={styles.muted}>{t.reviewEmpty}</p>
      ) : (
        <>
          <p className={styles.reviewSummary} data-testid="hl-review-summary">
            {t.reviewSummary(review.matched, review.decisions.length)}
            {review.gaveUp > 0 && ` ${t.reviewGaveUp(gaveUpText(review.gaveUp, locale))}`}
          </p>
          <ol className={styles.reviewList}>
            {review.decisions.map((decision) => (
              <li key={decision.rung} className={styles.reviewRow} data-matched={decision.matched ? 'true' : 'false'} data-testid="hl-review-row">
                <span role="img" aria-label={t.cardName(rankOf(decision.card), suitOf(decision.card))}>
                  <MiniCard card={decision.card} />
                </span>
                <span className={styles.reviewMove}>
                  <span className={styles.reviewAt}>{t.chartRung(decision.rung)}</span>
                  <span className={styles.reviewDid}>
                    {moveWord(decision.move)}
                    {decision.result !== null && <span className={styles.reviewResult}>{` · ${resultWord[decision.result]}`}</span>}
                  </span>
                </span>
                <span className={styles.reviewVerdict}>
                  {decision.matched ? t.reviewBest : t.reviewBetter(decision.best.map(moveWord).join(' / '), gaveUpText(decision.gaveUp, locale))}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.note}>{t.reviewNote}</p>
        </>
      )}
      {visit.choices > 0 && (
        <p className={styles.reviewVisit} data-testid="hl-review-visit">
          {t.reviewVisit(visit.matched, visit.choices)}
        </p>
      )}
    </section>
  );
}
