import { RANK_NAMES, SUIT_SIGNS, rankOf, suitOf, type Card } from './engine';
import styles from './HighLow.module.css';

/**
 * The machine's cards: a face drawn in type (the rank in two corners, the suit's sign large in the middle), and a
 * back of the machine's own, a lattice in its colours round a little ladder. Nothing of any real deck's art.
 */

const isRed = (card: Card): boolean => suitOf(card) === 1 || suitOf(card) === 2;

export const CardFace = ({ card }: { card: Card }) => {
  const rank = RANK_NAMES[rankOf(card)];
  const suit = SUIT_SIGNS[suitOf(card)];
  return (
    <span className={styles.face} data-red={isRed(card) ? 'true' : 'false'} aria-hidden="true">
      <span className={styles.corner}>
        <span className={styles.cornerRank}>{rank}</span>
        <span className={styles.cornerSuit}>{suit}</span>
      </span>
      <span className={styles.pip}>{suit}</span>
      <span className={`${styles.corner} ${styles.cornerLow}`}>
        <span className={styles.cornerRank}>{rank}</span>
        <span className={styles.cornerSuit}>{suit}</span>
      </span>
    </span>
  );
};

/** The back: a lattice in the cabinet's crimson and gold, a little ladder in its middle. */
export const CardBack = () => (
  <span className={styles.back} aria-hidden="true">
    <svg className={styles.backLadder} viewBox="0 0 20 32" focusable="false">
      <path d="M5 2V30M15 2V30" />
      <path d="M5 7H15M5 13H15M5 19H15M5 25H15" />
    </svg>
  </span>
);

/** A small card for the row of cards turned this game. */
export const MiniCard = ({ card }: { card: Card }) => (
  <span className={styles.mini} data-red={isRed(card) ? 'true' : 'false'}>
    <span>{RANK_NAMES[rankOf(card)]}</span>
    <span>{SUIT_SIGNS[suitOf(card)]}</span>
  </span>
);
