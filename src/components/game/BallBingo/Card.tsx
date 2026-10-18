'use client';

import { memo } from 'react';
import { CARD, LINES, countMarks, linesHeld, reachOf, type Marks } from './engine';
import styles from './BallBingo.module.css';

/** Where a cell's middle is on the card's drawing (a 3 × 3 grid of 30-unit cells), for the lines drawn over it. */
const cellAt = (cell: number) => ({ x: 15 + (cell % 3) * 30, y: 15 + Math.floor(cell / 3) * 30 });

export interface CardProps {
  marks: Marks;
  /** Whether REACH may be shown: balls are still to come. */
  live: boolean;
  /** The number marked last, which is stamped as the ball drops in. */
  fresh: number | null;
  label: string;
}

/**
 * The bingo card on the machine's glass: the nine numbers, a stamp on each
 * one marked, a light through each line held, and a blinking ring round each
 * number that would finish a line (REACH) while balls are still to come.
 */
export const Card = memo(function Card({ marks, live, fresh, label }: CardProps) {
  const held = linesHeld(marks);
  const reach = live ? reachOf(marks) : [];
  return (
    <div className={styles.card} role="img" aria-label={label} data-testid="bingo-card" data-marks={marks} data-lines={held.length} data-count={countMarks(marks)}>
      <div className={styles.cardGrid}>
        {CARD.map((n) => {
          const marked = (marks & (1 << (n - 1))) !== 0;
          return (
            <span
              key={n}
              className={styles.cell}
              data-number={n}
              data-marked={marked}
              data-reach={!marked && reach.includes(n)}
              data-fresh={marked && fresh === n}
              data-testid={`bingo-cell-${n}`}
            >
              <span className={styles.cellNumber}>{n}</span>
            </span>
          );
        })}
      </div>
      <svg className={styles.cardLines} viewBox="0 0 90 90" aria-hidden focusable="false">
        {held.map((line) => {
          const [a, , c] = LINES[line];
          const from = cellAt(a);
          const to = cellAt(c);
          return <line key={line} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={styles.cardLine} />;
        })}
      </svg>
    </div>
  );
});
