'use client';

import { useMemo } from 'react';
import { LAST_BALL_TIMES } from './engine';
import type { KenoStrings, Result } from './i18n';
import { chanceText, reviewOf } from './review';
import styles from './Keno.module.css';

/** A game that has ended: its ticket, its twenty balls in the order they came out, and what it came to. */
export interface ReviewedGame extends Result {
  ticket: readonly number[];
  balls: readonly number[];
  bet: number;
}

export interface GameReviewProps {
  t: KenoStrings;
  locale: string;
  game: ReviewedGame;
  /** Whether the game's spots may be marked on the board now (not while a game is drawn, or the medals are elsewhere). */
  canMark: boolean;
  onMark: () => void;
  onClose: () => void;
}

/**
 * A game from the list of last games, looked back at: the whole board in small with the spots, the balls and the
 * catches on it, the balls in the order they came out, and how the win was made up. Nothing here plays: the one
 * thing it does to the machine is mark the game's spots on the board again.
 */
export const GameReview = ({ t, locale, game, canMark, onMark, onClose }: GameReviewProps) => {
  const review = useMemo(() => reviewOf(game.ticket, game.balls), [game.ticket, game.balls]);
  const fmt = (n: number) => n.toLocaleString(locale);
  const spots = new Set(game.ticket);
  const chance = chanceText(review.chance, locale);

  return (
    <div className={styles.review} id="kn-review" role="group" aria-labelledby="kn-review-title" data-testid="kn-review">
      <h3 id="kn-review-title" className={styles.reviewTitle}>
        {t.reviewTitle}
      </h3>
      <p className={styles.reviewResult} data-testid="kn-review-result">
        {t.result(game).status}
      </p>

      {/* The board in small. The lines under it say the same in words, so this is for the eye alone. */}
      <div className={styles.reviewBoard} aria-hidden="true" data-testid="kn-review-board">
        {review.marks.map((mark, i) => (
          <span key={i} className={styles.reviewCell} data-mark={mark}>
            {i + 1}
          </span>
        ))}
      </div>
      <ul className={styles.reviewLegend} aria-hidden="true">
        <li>
          <span className={styles.reviewCell} data-mark="spot" />
          {t.legendSpot}
        </li>
        <li>
          <span className={styles.reviewCell} data-mark="caught" />
          {t.legendCaught}
        </li>
        <li>
          <span className={styles.reviewCell} data-mark="drawn" />
          {t.legendDrawn}
        </li>
      </ul>
      <p className={styles.reviewLine} data-testid="kn-review-spots">
        {t.reviewSpots(game.ticket)}
      </p>
      <p className={styles.reviewLine} data-testid="kn-review-caught">
        {t.reviewCaught(review.caught)}
      </p>

      <h4 className={styles.reviewSub} id="kn-review-balls-title">
        {t.reviewBalls}
      </h4>
      <ol className={styles.reviewBalls} aria-labelledby="kn-review-balls-title" data-testid="kn-review-balls">
        {game.balls.map((ball, i) => (
          <li key={i} className={styles.reviewCell} data-mark={spots.has(ball) ? 'caught' : 'drawn'} data-last={i === game.balls.length - 1 ? 'true' : 'false'}>
            {ball}
            {spots.has(ball) && <span className={styles.srOnly}>{t.reviewBallCaught}</span>}
          </li>
        ))}
      </ol>
      {review.lastBall !== null && (
        <p className={styles.reviewLine} data-testid="kn-review-last">
          {t.reviewLastBall(review.lastBall, review.lastCaught)}
        </p>
      )}

      <dl className={styles.reviewFacts}>
        <div>
          <dt>{t.reviewBet}</dt>
          <dd data-testid="kn-review-bet">{fmt(game.bet)}</dd>
        </div>
        <div>
          <dt>{t.reviewPays(game.caught, game.spots)}</dt>
          <dd data-testid="kn-review-pay">{fmt(review.pay)}</dd>
        </div>
        <div>
          <dt>{t.reviewTimes}</dt>
          <dd data-testid="kn-review-times">{review.times > 1 ? `×${LAST_BALL_TIMES}` : t.noPay}</dd>
        </div>
        <div>
          <dt>{t.reviewWon}</dt>
          <dd data-testid="kn-review-won">{fmt(game.won)}</dd>
        </div>
        <div>
          <dt>{t.reviewChance(game.caught, game.spots)}</dt>
          <dd data-testid="kn-review-chance">{chance}</dd>
        </div>
      </dl>

      <div className={styles.reviewButtons}>
        <button type="button" className={styles.btn} data-testid="kn-review-mark" onClick={onMark} disabled={!canMark}>
          {t.reviewMark}
        </button>
        <button type="button" className={styles.btn} data-testid="kn-review-close" onClick={onClose}>
          {t.reviewClose}
        </button>
      </div>
    </div>
  );
};

export default GameReview;
