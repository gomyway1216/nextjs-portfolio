'use client';

import { memo } from 'react';
import type { GameLanguage } from '../constants/gameTranslations';
import { getStrings } from './i18n';
import { recordOf, tallyOf } from './record';
import styles from './BallBingo.module.css';

export interface BallRecordProps {
  language: GameLanguage;
  /** The pockets drawn for the game, or null with no game to list. */
  draws: readonly number[] | null;
  /** How many of its balls have landed: only those are listed. */
  shown: number;
  /** Whether the game listed is one played earlier this visit, not the one on the machine. */
  earlier: boolean;
}

/**
 * The balls of a game in the order they were shot, each as the pocket it went
 * into; a ball that finished a line is starred. The list and the line under it
 * keep the room of the longest game, so nothing below moves as balls land.
 */
export const BallRecord = memo(function BallRecord({ language, draws, shown, earlier }: BallRecordProps) {
  const t = getStrings(language);
  const record = draws ? recordOf(draws, shown) : [];
  const tally = tallyOf(record);
  return (
    <section className={styles.panel} aria-labelledby="bingo-record-title" data-testid="bingo-record" data-earlier={earlier}>
      <h2 id="bingo-record-title" className={styles.panelTitle}>
        {earlier ? t.recordTitleEarlier : t.recordTitle}
      </h2>
      <ol className={styles.recordList} aria-label={t.recordListLabel} data-testid="bingo-record-list" data-count={record.length}>
        {record.map((entry) => (
          <li key={entry.ball} className={styles.recordBall} data-kind={entry.kind} data-line={entry.linesMade > 0}>
            <span aria-hidden>
              {entry.kind === 'number' ? entry.number : t.pocketKind[entry.kind]}
              {entry.linesMade > 0 ? '★' : ''}
            </span>
            <span className={styles.srOnly}>{t.recordBall(entry.ball, t.pocketName(entry.kind, entry.number), entry.linesMade, entry.gave)}</span>
          </li>
        ))}
      </ol>
      <p className={styles.recordNote} data-testid="bingo-record-note">
        {record.length === 0 ? t.recordEmpty : t.recordTally(tally.shots, tally.numbers, tally.outs, tally.frees, tally.chance)}
      </p>
      <p className={styles.recordLegend}>{t.recordLegend}</p>
    </section>
  );
});
