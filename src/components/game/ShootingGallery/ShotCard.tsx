'use client';

import { SHELF, type Play } from './engine';
import type { ShootingGalleryStrings } from './i18n';
import styles from './ShootingGallery.module.css';

/** A play that has ended, as the panel lists it. */
export interface ReviewEntry {
  id: string;
  play: Play;
}

/** The play whose corks are listed: the one chosen while it is still among the last plays, or else the latest. */
export const reviewedOf = <E extends ReviewEntry>(history: readonly E[], chosen: string | null): E | null => history.find((entry) => entry.id === chosen) ?? history[0] ?? null;

const catDown = (play: Play) => play.fallen.some((target) => SHELF[target] === 'cat');

export interface PlayReviewProps {
  t: ShootingGalleryStrings;
  /** The last plays, the latest first. */
  history: readonly ReviewEntry[];
  /** The play picked from them (null: the latest). */
  chosen: string | null;
  onChoose: (id: string) => void;
}

/**
 * The last plays, and one of them cork by cork: which figure each cork was fired at, where on it the sight was, and
 * what the cork did. Only plays that have ended are listed, from what the stall already showed as they were played:
 * nothing here says what another aim would have done.
 */
export const PlayReview = ({ t, history, chosen, onChoose }: PlayReviewProps) => {
  const reviewed = reviewedOf(history, chosen);
  return (
    <section className={styles.panel} aria-labelledby="sht-history-title">
      <h2 id="sht-history-title" className={styles.panelTitle}>
        {t.historyTitle}
      </h2>
      {history.length === 0 ? (
        <p className={`${styles.muted} ${styles.historyEmpty}`}>{t.historyEmpty}</p>
      ) : (
        <ol className={styles.historyList} data-testid="sht-history">
          {history.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={styles.historyChip}
                data-won={entry.play.won > 0 ? 'true' : 'false'}
                data-cat={catDown(entry.play) ? 'true' : 'false'}
                aria-pressed={entry.id === reviewed?.id}
                title={t.historyEntryLabel(entry.play)}
                onClick={() => onChoose(entry.id)}
              >
                {t.historyEntry(entry.play)}
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Its room is kept while there is no play to list, so that what is under it does not move as the first one ends. */}
      <div className={styles.shotCard} data-testid="sht-shots" data-play={reviewed?.id ?? ''}>
        <h3 id="sht-shots-title" className={styles.shotCardTitle}>
          {t.shotCardTitle}
        </h3>
        {reviewed ? (
          <>
            <p className={styles.shotCardNote} data-testid="sht-shots-of">
              {t.historyEntryLabel(reviewed.play)}
            </p>
            <ol className={styles.shotList} aria-labelledby="sht-shots-title">
              {reviewed.play.corks.map((shot) => {
                const kind = SHELF[shot.target];
                return (
                  <li key={shot.cork} className={styles.shotRow} data-outcome={shot.outcome} data-blind={shot.blind ? 'true' : 'false'}>
                    <span className={styles.srOnly}>{t.shotSay(shot.cork, kind, shot.band, shot.outcome, shot.blind)}</span>
                    <span className={styles.shotNo} aria-hidden="true">
                      {shot.cork + 1}
                    </span>
                    <span className={styles.shotFigure} aria-hidden="true">
                      {t.shotFigure(kind)}
                      {shot.blind && <span className={styles.shotBlind}>{t.shotBlind}</span>}
                    </span>
                    <span className={styles.shotBand} aria-hidden="true">
                      {t.bandName(shot.band)}
                    </span>
                    <span className={styles.shotResult} aria-hidden="true">
                      {t.shotOutcome(shot.outcome, kind)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className={styles.shotCardNote}>{t.shotCardEmpty}</p>
        )}
      </div>
    </section>
  );
};

export default PlayReview;
