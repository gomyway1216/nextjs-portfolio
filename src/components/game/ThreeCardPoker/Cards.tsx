'use client';

import type { Card, Rank } from './engine';
import styles from './ThreeCardPoker.module.css';

export const rankLabel = (rank: Rank) => (rank === 'T' ? '10' : rank);
export const cardLabel = (card: Card) => `${rankLabel(card.rank)}${card.suit}`;

interface PlayingCardProps {
  card: Card;
  /** A face-down card being turned over: flip in place instead of sliding in from the shoe. */
  flip?: boolean;
}

/** A face-up card. It slides in and turns over when it mounts (or just turns over, with `flip`). */
export const PlayingCard = ({ card, flip = false }: PlayingCardProps) => {
  const red = card.suit === '♥' || card.suit === '♦';
  const label = rankLabel(card.rank);
  return (
    <span
      className={`${styles.card} ${red ? styles.cardRed : ''} ${flip ? styles.cardFlip : ''}`}
      role="img"
      aria-label={cardLabel(card)}
      data-rank={card.rank}
      data-suit={card.suit}
    >
      <span className={styles.cardFace} aria-hidden="true">
        <span className={styles.cardCorner}>
          {label}
          <br />
          {card.suit}
        </span>
        <span className={styles.cardPip}>{card.suit}</span>
        <span className={`${styles.cardCorner} ${styles.cardCornerBottom}`}>
          {label}
          <br />
          {card.suit}
        </span>
      </span>
      <span className={styles.cardBack} aria-hidden="true" />
    </span>
  );
};

/** A face-down card. It carries no rank or suit: nothing in the DOM gives the dealer's hand away. */
export const HoleCard = ({ label }: { label: string }) => (
  <span className={`${styles.card} ${styles.cardDown}`} role="img" aria-label={label} data-hole="true">
    <span className={styles.cardBack} aria-hidden="true" />
  </span>
);
