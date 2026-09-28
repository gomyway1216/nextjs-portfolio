'use client';

import type { Card } from './engine';
import styles from './Baccarat.module.css';

const rankLabel = (card: Card) => (card.rank === 'T' ? '10' : card.rank);
export const cardLabel = (card: Card) => `${rankLabel(card)}${card.suit}`;

interface PlayingCardProps {
  card: Card;
  /** Third cards are dealt sideways, as at a real table. */
  sideways?: boolean;
  className?: string;
}

/** A face-up card that slides out of the shoe and flips over when it mounts. */
export const PlayingCard = ({ card, sideways = false, className = '' }: PlayingCardProps) => {
  const red = card.suit === '♥' || card.suit === '♦';
  const label = rankLabel(card);
  return (
    <span className={`${styles.cardSlot} ${sideways ? styles.cardSideways : ''} ${className}`}>
      <span
        className={`${styles.card} ${red ? styles.cardRed : ''}`}
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
    </span>
  );
};
