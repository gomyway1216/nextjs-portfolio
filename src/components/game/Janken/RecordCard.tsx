'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { LAMP_TONE } from './art';
import { analyzeMachine, valueOf } from './engine';
import { getStrings } from './i18n';
import { sumsOf, type PlayRecord, type RecordRound } from './record';
import styles from './Janken.module.css';

export interface RecordCardProps {
  record: PlayRecord;
  onClear: () => void;
}

/** The record of the sitting, under the plate: what the medals played here came to, and the last rounds. */
export const RecordCard = ({ record, onClear }: RecordCardProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
  const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
  const sums = sumsOf(record);
  const average = record.played * valueOf(analyzeMachine().rtp);
  const empty = sums.thrown === 0 && record.rounds.length === 0;

  /** A round in words, for a screen reader: its throws, its lamp, its double-ups, what it gave. */
  const inWords = (round: RecordRound): string =>
    [
      t.recordRound(round.n) + (round.carried ? ` (${t.recordCarried})` : ''),
      ...(round.earlier > 0 ? [t.recordEarlier(round.earlier)] : []),
      ...round.throws.map((thrown) => t.recordThrow(t.hands[thrown.player], t.hands[thrown.machine], t.recordOutcomes[thrown.outcome])),
      ...(round.lamp !== null ? [t.recordLamp(round.lamp)] : []),
      ...(round.doubles > 0 ? [t.recordDoubled(round.doubles)] : []),
      round.end === 'paid' ? t.recordPaid(round.medals) : t.recordLost,
    ].join(language === 'ja' ? '、' : '; ');

  return (
    <section className={styles.record} aria-labelledby="janken-record-title" data-testid="janken-record" data-played={record.played} data-back={record.back}>
      <h2 id="janken-record-title" className={styles.recordTitle}>
        {t.recordTitle}
      </h2>
      <p className={styles.recordIntro}>{t.recordIntro}</p>
      {empty ? (
        <p className={styles.recordEmpty} data-testid="janken-record-empty">
          {t.recordEmpty}
        </p>
      ) : (
        <>
          <dl className={styles.recordSums}>
            <div>
              <dt>{t.recordPlayed}</dt>
              <dd data-testid="janken-record-played">{fmt(record.played)}</dd>
            </div>
            <div>
              <dt>{t.recordBack}</dt>
              <dd data-testid="janken-record-back">{fmt(record.back)}</dd>
            </div>
            <div>
              <dt>{t.recordNet}</dt>
              <dd data-testid="janken-record-net" data-net={sums.net > 0 ? 'ahead' : sums.net < 0 ? 'behind' : 'even'}>
                {signed(sums.net)}
              </dd>
            </div>
          </dl>
          {record.played > 0 && (
            <p className={styles.recordAverage} data-testid="janken-record-average">
              {t.recordAverage(record.played === 1 ? 1 : fmt(record.played), fmt(average))}
            </p>
          )}
          <dl className={styles.recordFacts}>
            <div>
              <dt>{t.recordThrows}</dt>
              <dd data-testid="janken-record-throws">
                {(['win', 'draw', 'lose'] as const).map((outcome) => (
                  <span key={outcome} className={styles.recordFact}>
                    {t.recordOutcomes[outcome]} <b>{fmt(record.throws[outcome])}</b>
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>{t.recordCat}</dt>
              <dd data-testid="janken-record-cat">
                {sums.hands.map(({ hand, count }) => (
                  <span key={hand} className={styles.recordFact}>
                    {t.hands[hand]} <b>{fmt(count)}</b>
                  </span>
                ))}
              </dd>
            </div>
            {record.best > 0 && (
              <div>
                <dt>{t.recordBest}</dt>
                <dd>
                  <b>{fmt(record.best)}</b> {t.unit}
                </dd>
              </div>
            )}
            {record.doublesTried > 0 && (
              <div>
                <dt>{t.recordDoubles}</dt>
                <dd data-testid="janken-record-doubles">{t.recordOf(record.doublesWon, record.doublesTried)}</dd>
              </div>
            )}
          </dl>
          {record.rounds.length > 0 && (
            <>
              <h3 className={styles.recordSub}>{t.recordLast}</h3>
              <ol className={styles.recordRounds} data-testid="janken-record-rounds">
                {[...record.rounds].reverse().map((round) => (
                  <li key={round.n} className={styles.recordRound} data-end={round.end ?? ''} data-testid="janken-record-round">
                    <span className={styles.srOnly}>{inWords(round)}</span>
                    <span className={styles.recordNo} aria-hidden>
                      {round.n}
                    </span>
                    <span className={styles.recordRun} aria-hidden>
                      {round.carried && <span className={styles.recordTag}>{t.recordCarried}</span>}
                      {round.earlier > 0 && <span className={styles.recordMore}>+{round.earlier}</span>}
                      {round.throws.map((thrown, i) => (
                        <span key={i} className={styles.recordMark} data-outcome={thrown.outcome} data-kind={thrown.kind}>
                          {t.recordMarks[thrown.outcome]}
                        </span>
                      ))}
                      {round.lamp !== null && (
                        <span className={`${styles.lampChip} ${styles.recordLamp}`} data-tone={LAMP_TONE[round.lamp]}>
                          {round.lamp}
                        </span>
                      )}
                      {round.doubles > 0 && <span className={styles.recordTimes}>×{2 ** round.doubles}</span>}
                    </span>
                    <span className={styles.recordGave} data-gave={round.medals > 0} aria-hidden>
                      {round.medals > 0 ? `+${fmt(round.medals)}` : '0'}
                    </span>
                  </li>
                ))}
              </ol>
              {record.rounds.some((round) => round.carried) && <p className={styles.recordSmall}>{t.recordCarriedNote}</p>}
            </>
          )}
          <button type="button" className={styles.recordClear} data-testid="janken-record-clear" onClick={onClear}>
            {t.recordClear}
          </button>
        </>
      )}
      <p className={styles.recordSmall}>{t.recordNote}</p>
    </section>
  );
};

export default RecordCard;
