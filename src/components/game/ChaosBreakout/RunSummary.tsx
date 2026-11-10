import styles from './ChaosBreakout.module.css';
import type { ChaosBreakoutStrings } from './i18n';
import { type DifficultyRecord, formatDuration, type Improved, type RunResult } from './records';

interface RunSummaryProps {
  t: ChaosBreakoutStrings;
  difficultyLabel: string;
  run: RunResult;
  improved: Improved;
  /** The difficulty's record with this run already folded in. */
  record: DifficultyRecord | undefined;
}

const plain = (value: number) => value.toLocaleString();
const combo = (value: number) => `x${value}`;

export const RunSummary = ({ t, difficultyLabel, run, improved, record }: RunSummaryProps) => {
  const title = t.summaryTitle(difficultyLabel);
  const recordLine = (key: keyof DifficultyRecord, format: (value: number) => string) => {
    // A run in another tab may have beaten this one since it was saved.
    if (improved[key] && (!record || run[key] >= record[key])) {
      return (
        <span className={styles.summaryRecord} data-new="true">
          {t.newRecord}
        </span>
      );
    }
    if (!record) return null;
    return <span className={styles.summaryRecord}>{t.recordValue(format(record[key]))}</span>;
  };

  return (
    <section className={styles.summary} aria-label={title}>
      <h2 className={styles.summaryTitle}>{title}</h2>
      <dl className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <dt>{t.score}</dt>
          <dd>
            <span className={styles.summaryValue}>{plain(run.score)}</span>
            {recordLine('score', plain)}
          </dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>{t.stage}</dt>
          <dd>
            <span className={styles.summaryValue}>{plain(run.stage)}</span>
            {recordLine('stage', plain)}
          </dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>{t.bestCombo}</dt>
          <dd>
            <span className={styles.summaryValue}>{combo(run.combo)}</span>
            {recordLine('combo', combo)}
          </dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>{t.bricksBroken}</dt>
          <dd>
            <span className={styles.summaryValue}>{plain(run.bricks)}</span>
          </dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>{t.chaosPulses}</dt>
          <dd>
            <span className={styles.summaryValue}>{plain(run.pulses)}</span>
          </dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>{t.playTime}</dt>
          <dd>
            <span className={styles.summaryValue}>{formatDuration(run.frames)}</span>
          </dd>
        </div>
      </dl>
      <p className={styles.summaryNote}>{t.recordsNote}</p>
    </section>
  );
};
