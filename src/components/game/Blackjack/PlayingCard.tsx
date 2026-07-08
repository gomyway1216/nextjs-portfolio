'use client';

import type { Card } from './engine';
import styles from './blackjack.module.css';

const RANK_LABEL: Record<string, string> = {
  A: 'A', T: '10', J: 'J', Q: 'Q', K: 'K',
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
};

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  hiddenLabel?: string;
}

/** A single rendered playing card, or a face-down back when `faceDown`. */
export const PlayingCard = ({ card, faceDown = false, hiddenLabel = 'Hidden card' }: PlayingCardProps) => {
  if (faceDown || !card) {
    return (
      <div className={`${styles.card} ${styles.cardBack}`} role="img" aria-label={hiddenLabel}>
        <span className={styles.cardBackInner} aria-hidden />
      </div>
    );
  }
  const red = card.suit === '♥' || card.suit === '♦';
  const label = `${RANK_LABEL[card.rank]}${card.suit}`;
  return (
    <div
      className={`${styles.card} ${red ? styles.cardRed : styles.cardBlack}`}
      role="img"
      aria-label={label}
    >
      <span className={styles.cardCorner} aria-hidden>{RANK_LABEL[card.rank]}{card.suit}</span>
      <span className={styles.cardPip} aria-hidden>{card.suit}</span>
      <span className={`${styles.cardCorner} ${styles.cardCornerBottom}`} aria-hidden>{RANK_LABEL[card.rank]}{card.suit}</span>
    </div>
  );
};

interface CardRowProps {
  cards: Card[];
  hideIndex?: number; // index of the card to render face-down (dealer hole card)
  hiddenLabel?: string;
}

export const CardRow = ({ cards, hideIndex, hiddenLabel }: CardRowProps) => (
  <div className={styles.cardRow}>
    {cards.map((c, i) => (
      <PlayingCard key={i} card={c} faceDown={i === hideIndex} hiddenLabel={hiddenLabel} />
    ))}
  </div>
);
