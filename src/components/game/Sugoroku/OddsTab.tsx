'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import {
  BOARD,
  FACES,
  JP_FACE,
  JP_LAMPS,
  JP_MISS_PAYS,
  JP_PAYS,
  LAMPS,
  LAMP_COUNT,
  STAR,
  checkRolls,
  fraction,
  isArrow,
  seeded,
  valueOf,
  type Fraction,
} from './engine';
import { getStrings, timesOf } from './i18n';
import { PUBLISHED_BOARD_ODDS } from './published';
import styles from './Sugoroku.module.css';

/** How many rolls the check plays. */
export const CHECK_ROLLS = 100_000;

interface CheckSeen {
  rolls: number;
  back: number;
  laps: number;
  rides: number;
  jackpots: number;
}

/** The lamps of a set grouped by what they pay, biggest first: how many lamps, and the chance of one of them. */
function lampRows(lamps: readonly (number | typeof STAR)[]): { pays: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const lamp of lamps) if (lamp !== STAR) counts.set(lamp, (counts.get(lamp) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([pays, count]) => ({ pays, count }));
}

/** Whale Isle Sugoroku's exact odds (engine.ts): every square's next roll, the long run, the chances, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const ratio = (f: Fraction) => `${f.num.toString()}/${f.den.toString()}`;
  // Written out in published.ts: nothing is worked out as the tab is drawn (it is drawn, hidden, as the page opens).
  const odds = PUBLISHED_BOARD_ODDS;
  const every = (f: Fraction) => fmt(1 / valueOf(f), 1);

  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState<CheckSeen | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the rolls are played.
    window.setTimeout(() => {
      setSeen(checkRolls(CHECK_ROLLS, seeded(20_261_018 + seed)));
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const twelfth = fraction(1, LAMP_COUNT);
  const often: { key: keyof typeof t.oftenRows; value: Fraction }[] = [
    { key: 'paid', value: odds.chances.paid },
    { key: 'lap', value: odds.chances.lap },
    { key: 'moved', value: odds.chances.moved },
    { key: 'lamp', value: odds.chances.lamp },
    { key: 'jpChance', value: odds.chances.jpChance },
    { key: 'ride', value: odds.chances.ride },
    { key: 'blowhole', value: odds.chances.blowhole },
    { key: 'jackpot', value: odds.chances.jackpot },
  ];

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.longRunLabel}</span>
          <span className={styles.statValue} data-testid="sg-rtp">
            {pct(valueOf(odds.longRun))}
          </span>
          <span className={styles.statNote}>{t.longRunNote}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.bestLabel}</span>
          <span className={styles.statValue} data-testid="sg-best">
            {pct(valueOf(odds.best))}
          </span>
          <span className={styles.statNote}>
            {ratio(odds.best)} · {t.bestNote(odds.bestSquares.length)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.worstLabel}</span>
          <span className={styles.statValue} data-testid="sg-worst">
            {pct(valueOf(odds.worst))}
          </span>
          <span className={styles.statNote}>{t.worstNote}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.bettingLabel}</span>
          <span className={styles.statValue} data-testid="sg-betting">
            {pct(valueOf(odds.betting.value))}
          </span>
          <span className={styles.statNote}>{t.bettingNote}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.jackpotLabel}</span>
          <span className={styles.statValue}>{timesOf(JP_PAYS)}</span>
          <span className={styles.statNote}>{t.jackpotNote(fmt(1 / valueOf(odds.chances.jackpot)))}</span>
        </div>
      </div>

      <section>
        <h2 className={styles.blockTitle}>{t.rulesTitle}</h2>
        <ul className={styles.drawList}>
          {t.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.squaresTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="sg-squares-table">
            <thead>
              <tr>
                <th scope="col">{t.colSquare}</th>
                <th scope="col">{t.colWhat}</th>
                <th scope="col" className={styles.num}>
                  {t.colNext}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colThere}
                </th>
              </tr>
            </thead>
            <tbody>
              {BOARD.map((square, s) => {
                const arrow = isArrow(square.kind);
                const value = odds.returns[s];
                return (
                  <tr key={s} data-square={s}>
                    <th scope="row" className={styles.num}>
                      {s}
                    </th>
                    <td>{arrow ? t.arrowTo(t.squareName(square.kind), square.to!) : t.squareName(square.kind)}</td>
                    <td className={styles.num} data-better={!arrow && odds.bestSquares.includes(s) ? 'true' : 'false'}>
                      {arrow ? (
                        t.never
                      ) : (
                        <>
                          <span className={styles.fraction}>{ratio(value)}</span>
                          <span className={styles.percent}>{pct(valueOf(value))}</span>
                        </>
                      )}
                    </td>
                    <td className={styles.num}>{arrow ? t.never : pct(valueOf(odds.rests[s]))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.squaresNote}</p>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.chancesTitle}</h2>
        <p className={styles.note}>{t.worthNote(`${ratio(odds.lampChance)} (×${fmt(valueOf(odds.lampChance), 3)})`)}</p>
        <div className={styles.chanceGrid}>
          <div>
            <h3 className={styles.subTitle}>{t.lampTitle}</h3>
            <table className={styles.oddsTable} data-testid="sg-lamp-table">
              <thead>
                <tr>
                  <th scope="col">{t.colPays}</th>
                  <th scope="col" className={styles.num}>
                    {t.colLamps}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colChance}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lampRows(LAMPS).map(({ pays, count }) => (
                  <tr key={pays}>
                    <th scope="row">{timesOf(pays)}</th>
                    <td className={styles.num}>{count}</td>
                    <td className={styles.num}>{ratio(fraction(count, LAMP_COUNT))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className={styles.subTitle}>{t.jpTitle}</h3>
            <table className={styles.oddsTable} data-testid="sg-jp-table">
              <thead>
                <tr>
                  <th scope="col">{t.colPays}</th>
                  <th scope="col" className={styles.num}>
                    {t.colChance}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    {timesOf(JP_PAYS)} <span className={styles.rowNote}>{t.finalRow(JP_FACE)}</span>
                  </th>
                  <td className={styles.num}>{ratio(fraction(1, LAMP_COUNT * FACES))}</td>
                </tr>
                <tr>
                  <th scope="row">
                    {timesOf(JP_MISS_PAYS)} <span className={styles.rowNote}>{t.finalMiss}</span>
                  </th>
                  <td className={styles.num}>{ratio(fraction(FACES - 1, LAMP_COUNT * FACES))}</td>
                </tr>
                {lampRows(JP_LAMPS).map(({ pays, count }) => (
                  <tr key={pays}>
                    <th scope="row">{pays === 0 ? t.noPrize : timesOf(pays)}</th>
                    <td className={styles.num}>{ratio(fraction(count, LAMP_COUNT))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.note}>
              {t.starRow}: {ratio(twelfth)}
            </p>
          </div>
        </div>
        <h3 className={styles.subTitle}>{t.rideTitle}</h3>
        <p className={styles.note}>{t.rideNote(pct(valueOf(fraction(1, 2)), 0))}</p>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.whyTitle}</h2>
        {t.why.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.chainTitle}</h2>
        {t.chain.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.oftenTitle}</h2>
        <table className={styles.oddsTable} data-testid="sg-often-table">
          <thead>
            <tr>
              <th scope="col">{t.colEvent}</th>
              <th scope="col" className={styles.num}>
                {t.colChance}
              </th>
              <th scope="col" className={styles.num}>
                {t.colEvery}
              </th>
            </tr>
          </thead>
          <tbody>
            {often.map(({ key, value }) => (
              <tr key={key}>
                <th scope="row">{t.oftenRows[key]}</th>
                <td className={styles.num}>{pct(valueOf(value), key === 'jackpot' ? 3 : 1)}</td>
                <td className={styles.num}>{t.inRolls(every(value))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.compareTitle}</h2>
        {t.compare.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section className={styles.check}>
        <h2 className={styles.blockTitle}>{t.checkTitle}</h2>
        <button type="button" className={styles.checkButton} onClick={runCheck} disabled={running} data-testid="sg-check">
          {running ? t.checkRunning : t.checkButton}
        </button>
        {seen && (
          <div data-testid="sg-check-result">
            <p className={styles.checkResult}>{t.checkResult(fmt(seen.rolls))}</p>
            <ul className={styles.checkList}>
              <li>{t.checkBack(pct(seen.back), pct(valueOf(odds.longRun)))}</li>
              <li>{t.checkLaps(fmt(seen.laps), fmt(seen.rolls * valueOf(odds.chances.lap)))}</li>
              <li>{t.checkRides(fmt(seen.rides), fmt(seen.rolls * valueOf(odds.chances.ride)))}</li>
              <li>{t.checkJackpots(fmt(seen.jackpots), fmt(seen.rolls * valueOf(odds.chances.jackpot), 1))}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};

export default OddsTab;
