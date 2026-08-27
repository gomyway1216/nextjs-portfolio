'use client';

import type { Card } from './engine';
import styles from './texas-holdem.module.css';

const rankLabel: Record<Card['rank'], string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};

export function PlayingCard({ card, hidden = false, compact = false }: { card?: Card; hidden?: boolean; compact?: boolean }) {
  if (hidden || !card) {
    return (
      <span
        className={`${styles.playingCard} ${styles.cardBack} ${compact ? styles.cardCompact : ''}`}
        role="img"
        aria-label="Hidden card"
      >
        <span className={styles.cardBackPattern} aria-hidden="true" />
      </span>
    );
  }
  const red = card.suit === '♥' || card.suit === '♦';
  const label = `${rankLabel[card.rank]}${card.suit}`;
  return (
    <span
      className={`${styles.playingCard} ${red ? styles.cardRed : styles.cardBlack} ${compact ? styles.cardCompact : ''}`}
      role="img"
      aria-label={label}
    >
      <span className={styles.cardCorner} aria-hidden="true">{rankLabel[card.rank]}<small>{card.suit}</small></span>
      <span className={styles.cardSuit} aria-hidden="true">{card.suit}</span>
    </span>
  );
}
