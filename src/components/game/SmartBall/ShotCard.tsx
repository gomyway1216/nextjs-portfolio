'use client';

import { useMemo } from 'react';
import type { MarblePlay } from './engine';
import type { SmartBallStrings } from './i18n';
import { cardOf, cellsOf } from './shotCard';
import styles from './SmartBall.module.css';

export interface ShotCardProps {
  t: SmartBallStrings;
  /** The marbles to show: those of the play under way that have come to rest, or all of the play last ended. */
  marbles: readonly MarblePlay[];
  /** The marble on the plunger or on its way, while a play is under way. */
  now: number | null;
  /** How many of the marbles the player shot, for a play that was finished blind; left out where they shot them all. */
  own?: number;
}

/**
 * The shot card beside the board: for each of a play's ten marbles, the strength it was shot at and the hole it lit
 * (or OUT), with the marbles that completed a line marked. Its ten places are there from the start, so nothing moves
 * as they fill.
 */
export const ShotCard = ({ t, marbles, now, own }: ShotCardProps) => {
  const cells = useMemo(() => cellsOf(cardOf(marbles, own)), [marbles, own]);
  return (
    <section className={styles.panel} aria-labelledby="smb-card-title">
      <h2 id="smb-card-title" className={styles.panelTitle}>
        {t.cardTitle}
      </h2>
      <ol className={styles.cardList} data-testid="smb-card" data-shown={marbles.length}>
        {cells.map((row, m) => (
          <li
            key={m}
            className={styles.cardCell}
            data-state={row ? (row.hole === null ? 'out' : 'hole') : now === m ? 'now' : 'waiting'}
            data-line={row && row.lines > 0 ? 'true' : 'false'}
            data-blind={row?.blind ? 'true' : 'false'}
          >
            <span className={styles.srOnly}>{row ? t.cardSay(m, row.window, row.hole, row.lines, row.blind) : t.cardWaiting(m)}</span>
            <span className={styles.cardMarble} aria-hidden="true">
              {m + 1}
            </span>
            <span className={styles.cardResult} aria-hidden="true">
              {row ? (row.hole === null ? t.outLabel : `${row.lines > 0 ? '★' : ''}${t.holeNumber(row.hole)}`) : '·'}
            </span>
            <span className={styles.cardStrength} aria-hidden="true">
              {row ? `${t.cardStrength(row.window)}${row.blind ? '*' : ''}` : '\u00a0'}
            </span>
          </li>
        ))}
      </ol>
      <p className={styles.cardLegend}>{t.cardLegend}</p>
    </section>
  );
};

export default ShotCard;
