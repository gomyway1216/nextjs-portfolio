import type { Ref } from 'react';

import type { RunStats } from './engine';
import type { GhostTetrisStrings } from './i18n';
import styles from './GhostTetris.module.css';

/** How the lines were cleared and how many pieces the run used. */
export const RunSummary = ({ stats, t }: { stats: RunStats; t: GhostTetrisStrings }) => (
  <dl className={styles.summary}>
    {t.clearNames.map((name, i) => (
      <div key={name} className={styles.summaryItem}>
        <dt>{name}</dt>
        <dd>{stats.clears[i]}</dd>
      </div>
    ))}
    <div className={`${styles.summaryItem} ${styles.summaryWide}`}>
      <dt>{t.piecesPlaced}</dt>
      <dd>{stats.pieces}</dd>
    </div>
  </dl>
);

interface RevealBarProps {
  gaps: number;
  t: GhostTetrisStrings;
  noteId: string;
  backRef?: Ref<HTMLButtonElement>;
  onBack: () => void;
}

/** Legend under the revealed board, with the way back to the results. */
export const RevealBar = ({ gaps, t, noteId, backRef, onBack }: RevealBarProps) => (
  <div className={styles.revealBar}>
    <p className={styles.revealCount}>
      <span className={`${styles.gap} ${styles.gapSwatch}`} aria-hidden />
      {t.buriedGaps}: <strong>{gaps}</strong>
    </p>
    <p id={noteId} className={styles.revealNote}>
      {t.revealNote}
    </p>
    <button
      type="button"
      ref={backRef}
      className={styles.overlayGhostBtn}
      aria-describedby={noteId}
      onClick={onBack}
    >
      {t.backToResults}
    </button>
  </div>
);
