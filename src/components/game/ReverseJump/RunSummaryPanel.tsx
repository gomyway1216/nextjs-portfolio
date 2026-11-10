import type { ReverseJumpCopy } from './i18n';
import styles from './ReverseJump.module.css';
import { RunSummary, tenthsOfSecond } from './gameLogic';

interface RunSummaryPanelProps {
  summary: RunSummary | null;
  copy: ReverseJumpCopy;
}

const flipLine = (summary: RunSummary, copy: ReverseJumpCopy): string => {
  const { mode, msSinceFlip } = summary.hit;
  const modeLabel = mode === 'inverted' ? copy.modeInverted : copy.modeNormal;
  if (msSinceFlip === null) return copy.flipNone(modeLabel);
  const seconds = tenthsOfSecond(msSinceFlip);
  if (seconds < 0.1) return copy.flipJust(modeLabel);
  return copy.flipAgo(modeLabel, seconds.toFixed(1));
};

/**
 * What ended the most recent run and how it went. The same rows are rendered
 * before the first run (with placeholders) so the panel never changes height.
 */
export const RunSummaryPanel = ({ summary, copy }: RunSummaryPanelProps) => {
  const difficultyLabel = summary
    ? { easy: copy.easy, medium: copy.medium, hard: copy.hard }[summary.difficulty]
    : '';
  const stats: Array<[string, string]> = [
    [copy.score, summary ? String(summary.score) : '–'],
    [copy.statTime, summary ? copy.runSeconds(tenthsOfSecond(summary.elapsedMs).toFixed(1)) : '–'],
    [copy.statLow, summary ? String(summary.lowCleared) : '–'],
    [copy.statHigh, summary ? String(summary.highCleared) : '–'],
    [copy.statFlips, summary ? String(summary.flips) : '–'],
    [copy.statTopSpeed, summary ? `×${summary.topSpeedRatio.toFixed(2)}` : '–'],
  ];

  return (
    <section className={styles.runPanel} aria-labelledby="reverse-jump-last-run">
      <div className={styles.runHeader}>
        <h2 id="reverse-jump-last-run" className={styles.runTitle}>
          {copy.lastRun}
        </h2>
        <span className={styles.runMeta}>{difficultyLabel}</span>
      </div>
      <div aria-live="polite">
        <p className={styles.runLine}>
          {summary ? copy.hit[summary.hit.type][summary.hit.pose] : copy.lastRunEmpty}
        </p>
        <p className={`${styles.runLine} ${styles.runLineMuted}`}>
          {summary ? flipLine(summary, copy) : ''}
        </p>
      </div>
      <dl className={styles.runStats}>
        {stats.map(([label, value]) => (
          <div key={label} className={styles.runStat}>
            <dt className={styles.runStatLabel}>{label}</dt>
            <dd className={styles.runStatValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
