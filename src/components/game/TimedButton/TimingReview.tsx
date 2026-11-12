import {
  TENDENCY_THRESHOLD_MS,
  summarizeTiming,
  timingSide,
  type RoundRecord,
} from './gameLogic';
import type { TimedButtonCopy } from './i18n';
import styles from './TimedButton.module.css';

/** "24 ms early" / "24 ms late" / "Dead on", at whole-millisecond resolution. */
export const timingText = (offsetMs: number, copy: TimedButtonCopy): string => {
  const side = timingSide(offsetMs);
  if (side === 'onTime') return copy.timingOnTime;
  const ms = Math.abs(Math.round(offsetMs));
  return side === 'early' ? copy.timingEarly(ms) : copy.timingLate(ms);
};

const pct = (fraction: number): string => `${Math.max(0, Math.min(1, fraction)) * 100}%`;

interface TimingReviewProps {
  records: RoundRecord[];
  /** Half-width of the target zone the run was played with (fraction of the track). */
  targetHalfWidth: number;
  copy: TimedButtonCopy;
}

/** Post-run breakdown: where each tap landed, how early or late it was, and the overall lean. */
export const TimingReview = ({ records, targetHalfWidth, copy }: TimingReviewProps) => {
  if (records.length === 0) return null;

  const timing = summarizeTiming(records.map((r) => r.offsetMs));
  const medianMs = Math.abs(Math.round(timing.medianOffsetMs));
  const tendency =
    timing.tendency === 'early'
      ? copy.tendencyEarly(medianMs)
      : timing.tendency === 'late'
        ? copy.tendencyLate(medianMs)
        : copy.tendencyBalanced(TENDENCY_THRESHOLD_MS);

  return (
    <div className={styles.review} data-testid="timing-review">
      <h3 className={styles.reviewTitle}>{copy.timingReviewTitle}</h3>
      <p className={styles.reviewTendency} data-tendency={timing.tendency}>
        {tendency}
      </p>
      {/* Two paragraphs, not one with a <br>: the site hides a <br> inside a <p> on phones. */}
      <div className={styles.reviewNote}>
        <p>{copy.timingCounts(timing.early, timing.late, timing.onTime)}</p>
        <p>{copy.timingNote(timing.taps)}</p>
      </div>

      <ol className={styles.reviewList}>
        {records.map((record, index) => (
          <li key={index} className={styles.reviewRow}>
            <span className={styles.reviewRound}>
              <span className={styles.srOnly}>{copy.roundLabel(index + 1)}</span>
              <span aria-hidden="true">{index + 1}</span>
            </span>
            <div className={styles.reviewBody}>
              <div className={styles.miniTrack} aria-hidden="true">
                <div
                  className={styles.miniZone}
                  style={{
                    left: pct(record.targetCenter - targetHalfWidth),
                    width: pct(targetHalfWidth * 2),
                  }}
                />
                <div className={styles.miniCenter} style={{ left: pct(record.targetCenter) }} />
                <div
                  className={styles.miniMarker}
                  data-rating={record.rating}
                  style={{ left: pct(record.markerPos) }}
                />
              </div>
              <span className={styles.reviewText}>
                <span className={styles.reviewRating}>{copy[record.rating]}</span>
                <span className={styles.reviewTiming}>{timingText(record.offsetMs, copy)}</span>
              </span>
            </div>
            <span className={styles.reviewScore}>+{record.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
