'use client';

import type { CSSProperties } from 'react';
import type { Card } from './engine';
import styles from './Blackjack.module.css';

const rankLabel = (card: Card) => (card.rank === 'T' ? '10' : card.rank);
export const cardLabel = (card: Card) => `${rankLabel(card)}${card.suit}`;

interface PlayingCardProps {
  card: Card;
  /** Delay before the deal animation starts (ms). */
  delay?: number;
  /** A hole card being turned over: flip in place instead of sliding from the shoe. */
  flip?: boolean;
}

/** A face-up card that slides out of the shoe and turns over when it mounts. */
export const PlayingCard = ({ card, delay = 0, flip = false }: PlayingCardProps) => {
  const red = card.suit === '♥' || card.suit === '♦';
  const label = rankLabel(card);
  return (
    <span
      className={`${styles.card} ${red ? styles.cardRed : ''} ${flip ? styles.cardFlip : ''}`}
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
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

/** The dealer's hole card, face down. */
export const HoleCard = ({ delay = 0, label }: { delay?: number; label: string }) => (
  <span className={`${styles.card} ${styles.cardDown}`} style={{ animationDelay: `${delay}ms` }} role="img" aria-label={label} data-hole="true">
    <span className={styles.cardBack} aria-hidden="true" />
  </span>
);
