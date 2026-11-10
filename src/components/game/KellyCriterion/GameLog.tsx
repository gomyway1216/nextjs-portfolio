'use client';

import { useMemo, useRef } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CAP, MAX_FLIPS, SCENARIOS } from './engine';
import { money, percent } from './format';
import { getStrings } from './i18n';
import { againstKelly, tallyOf, type GameRecord } from './record';
import styles from './KellyCriterion.module.css';

interface GameLogProps {
  /** Finished games, oldest first. */
  records: readonly GameRecord[];
  onClear: () => void;
}

/** The finished games of this visit, newest first, each beside what the Kelly stake made of the same flips. */
export const GameLog = ({ records, onClear }: GameLogProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const title = useRef<HTMLHeadingElement>(null);
  // The table re-renders on every flip; the list only changes when a game ends.
  const tally = useMemo(() => tallyOf(records), [records]);

  return (
    <div className={`${styles.panel} ${styles.logPanel}`} data-testid="kelly-log">
      <div className={styles.logHead}>
        <h3 ref={title} tabIndex={-1} className={`${styles.sectionLabel} ${styles.first} ${styles.logTitle}`}>
          {t.logTitle}
        </h3>
        {records.length > 0 && (
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              onClear();
              // The button goes away with the list: keep the keyboard where it was.
              title.current?.focus();
            }}
          >
            {t.logClear}
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <p className={styles.note} data-testid="kelly-log-empty">
          {t.logEmpty(money(CAP), MAX_FLIPS)}
        </p>
      ) : (
        <>
          <dl className={`${styles.statList} ${styles.logTally}`} data-testid="kelly-log-tally">
            <div>
              <dt>{t.logGames}</dt>
              <dd data-tally="games">{tally.games}</dd>
            </div>
            <div>
              <dt>{t.logBust}</dt>
              <dd data-tally="bust">{tally.bust}</dd>
            </div>
            <div>
              <dt>{t.logCap}</dt>
              <dd data-tally="cap">{tally.cap}</dd>
            </div>
            <div>
              <dt>{t.logAhead}</dt>
              <dd data-tally="ahead">{tally.ahead}</dd>
            </div>
          </dl>

          <div className={styles.logScroll} role="region" aria-label={t.logRegion} tabIndex={0}>
            <table className={styles.oddsTable} data-testid="kelly-log-table">
              <caption className={styles.srOnly}>{t.logRegion}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.logColGame}</th>
                  <th scope="col">{t.logColBet}</th>
                  <th scope="col">{t.logColEnded}</th>
                  <th scope="col" className={styles.num}>
                    {t.logColFlips}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.logColAverage}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.logColYou}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.logColKelly}
                  </th>
                </tr>
              </thead>
              <tbody>
                {records
                  .slice()
                  .reverse()
                  .map((record, index) => {
                    const number = records.length - index;
                    const wager = SCENARIOS[record.scenario];
                    const versus = againstKelly(record);
                    return (
                      <tr key={number} data-game={number} data-reason={record.reason} data-versus={versus}>
                        <th scope="row">{number}</th>
                        <td className={styles.logNoWrap}>{t.logBet(percent(wager.p), t.oddsShort(wager.b))}</td>
                        <td className={styles.logNoWrap}>{t.logReason[record.reason]}</td>
                        <td className={styles.num}>{record.flips}</td>
                        <td className={styles.num}>{percent(record.averageStake, 1)}</td>
                        <td className={styles.num} data-col="you" data-sign={versus === 'ahead' ? 'pos' : versus === 'behind' ? 'neg' : undefined}>
                          {money(record.final)}
                        </td>
                        <td className={styles.num} data-col="kelly">
                          {money(record.kellyFinal)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>{t.logNote}</p>
        </>
      )}
    </div>
  );
};
