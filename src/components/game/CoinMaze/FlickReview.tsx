import { GATE_PATTERNS, STAGES, passed, type Play, type Slot } from './engine';
import type { CoinMazeStrings } from './i18n';
import { reviewOf } from './review';
import styles from './CoinMaze.module.css';

const GLYPH: Readonly<Record<Slot, string>> = { open: 'O', half: '½', shut: '×' };

export interface FlickReviewProps {
  t: CoinMazeStrings;
  /** The last play that ended, or null before there is one. */
  play: Play | null;
}

/**
 * The last play, gate by gate: each gate's turn as a strip of its windows with the one flicked in marked, and how the
 * flick stood against it. It always has its four gates and the pins, so that nothing under it moves as plays end.
 */
export const FlickReview = ({ t, play }: FlickReviewProps) => {
  const gates = play ? reviewOf(play) : Array.from({ length: STAGES }, () => null);
  return (
    <section className={styles.panel} aria-labelledby="cm-review-title" data-testid="cm-review">
      <h2 id="cm-review-title" className={styles.panelTitle}>
        {t.reviewTitle}
      </h2>
      <p className={`${styles.muted} ${styles.reviewLead}`} data-testid="cm-review-lead">
        {play ? t.outcome(play).status : t.reviewEmpty}
      </p>
      <ol className={styles.reviewList}>
        {gates.map((gate, stage) => (
          <li key={stage} className={styles.reviewRow} data-testid={`cm-review-gate-${stage + 1}`} data-end={gate?.played.end ?? ''} data-off={gate?.off ?? ''}>
            <span className={styles.reviewGate}>{t.reviewGate(stage, gate?.played.gate ?? null)}</span>
            {/* The strip repeats what the line under it says in words. */}
            <span className={styles.reviewStrip} aria-hidden="true">
              {gate
                ? GATE_PATTERNS[gate.played.gate].map((slot, window) => (
                    <span key={window} className={styles.reviewCell} data-slot={slot} data-flicked={window === gate.played.window ? 'true' : 'false'}>
                      {GLYPH[slot]}
                    </span>
                  ))
                : GATE_PATTERNS.mid.map((_, window) => <span key={window} className={styles.reviewCell} data-slot="none" data-flicked="false" />)}
            </span>
            <span className={`${styles.reviewLine} ${gate ? (passed(gate.played.end) ? styles.pos : styles.neg) : styles.reviewNone}`}>{gate ? t.reviewLine(gate) : play ? t.reviewNotReached : '—'}</span>
          </li>
        ))}
        <li className={`${styles.reviewRow} ${styles.reviewPins}`} data-testid="cm-review-pins">
          <span className={`${styles.reviewLine} ${play?.pocket ? (play.won > 0 ? styles.pos : styles.neg) : styles.reviewNone}`}>{play ? t.reviewPins(play) : '—'}</span>
        </li>
      </ol>
      <p className={`${styles.muted} ${styles.reviewKey}`}>{t.reviewKey}</p>
    </section>
  );
};

export default FlickReview;
