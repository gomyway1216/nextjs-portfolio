'use client';

import { RANK_LABELS, SUITS, cardLabel, isRed, rankOf, suitOf } from './engine';
import styles from './VideoPoker.module.css';

/** A face-up card that flips over when it mounts. */
export const PlayingCard = ({ card, delay = 0 }: { card: number; delay?: number }) => {
  const rank = RANK_LABELS[rankOf(card)];
  const suit = SUITS[suitOf(card)];
  return (
    <span
      className={`${styles.card} ${isRed(card) ? styles.cardRed : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      role="img"
      aria-label={cardLabel(card)}
      data-card={card}
    >
      <span className={styles.cardFace} aria-hidden="true">
        <span className={styles.cardCorner}>
          {rank}
          <br />
          {suit}
        </span>
        <span className={styles.cardPip}>{suit}</span>
        <span className={`${styles.cardCorner} ${styles.cardCornerBottom}`}>
          {rank}
          <br />
          {suit}
        </span>
      </span>
      <span className={styles.cardBack} aria-hidden="true" />
    </span>
  );
};

/** A face-down card (before the first deal). */
export const CardBack = ({ label }: { label: string }) => (
  <span className={`${styles.card} ${styles.cardDown}`} role="img" aria-label={label}>
    <span className={styles.cardBack} aria-hidden="true" />
  </span>
);

/** A card as inline text, for lists of holds. */
export const MiniCard = ({ card }: { card: number }) => (
  <span className={styles.miniCard} data-red={isRed(card) ? 'true' : undefined}>
    {cardLabel(card)}
  </span>
);
