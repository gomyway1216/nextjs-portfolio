'use client';

import type { Card } from './engine';
import styles from './Baccarat.module.css';

const rankLabel = (card: Card) => (card.rank === 'T' ? '10' : card.rank);
export const cardLabel = (card: Card) => `${rankLabel(card)}${card.suit}`;

interface PlayingCardProps {
  card: Card;
  /** Third cards are dealt sideways, as at a real table. */
  sideways?: boolean;
  /** The hand's last card, squeezed: put down face down and its face peeled up ('peel'), then face up ('done'). */
  squeeze?: 'peel' | 'done';
  className?: string;
}

/** A face-up card that slides out of the shoe and flips over when it mounts. */
export const PlayingCard = ({ card, sideways = false, squeeze, className = '' }: PlayingCardProps) => {
  const red = card.suit === '♥' || card.suit === '♦';
  const label = rankLabel(card);
  const squeezing = squeeze === 'peel';
  return (
    <span className={`${styles.cardSlot} ${sideways ? styles.cardSideways : ''} ${className}`}>
      <span
        className={`${styles.card} ${red ? styles.cardRed : ''} ${squeezing ? styles.cardSqueeze : squeeze === 'done' ? styles.cardSqueezed : ''}`}
        role="img"
        // While it is squeezed the card is not read out: it is said once it is turned.
        aria-hidden={squeezing ? true : undefined}
        aria-label={squeezing ? undefined : cardLabel(card)}
        data-rank={card.rank}
        data-suit={card.suit}
        data-squeeze={squeeze}
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
