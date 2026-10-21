'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import { BETS, JACKPOT, LAMP_SETS, LEVELS, POCKETS, checkRuns, ratioOf, seeded, valueOf, type CheckResult } from './engine';
import { getStrings, pocketKindsOf } from './i18n';
import { PUBLISHED_BALL_TOWER_ODDS } from './published';
import styles from './BallTower.module.css';

/** How many balls the check plays. */
export const CHECK_RUNS = 200_000;

/** Firework Ball Tower's exact odds (engine.ts, written out in published.ts): the return on every bet, each disc's pockets and roulette, what a ball pays, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  /** A small chance as a percent with enough places to show it. */
  const small = (v: number) => pct(v, v < 0.001 ? 4 : v < 0.01 ? 3 : 2);
  const odds = PUBLISHED_BALL_TOWER_ODDS;

  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState<CheckResult | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the balls are played.
    window.setTimeout(() => {
      setSeen(checkRuns(CHECK_RUNS, seeded(20_261_021 + seed)));
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const jackpotOneIn = Math.round(1 / valueOf(odds.jackpot));
  const nothing = 1 - valueOf(odds.hit);

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.backLabel}</span>
          <span className={styles.statValue} data-testid="bt-back">
            {pct(valueOf(odds.back))}
          </span>
          <span className={styles.statNote}>{t.backNote}</span>
          <span className={styles.statFraction}>{t.fractionNote(ratioOf(odds.back))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.hitLabel}</span>
          <span className={styles.statValue} data-testid="bt-hit">
            {pct(valueOf(odds.hit))}
          </span>
          <span className={styles.statNote}>{t.hitNote}</span>
          <span className={styles.statFraction}>{t.fractionNote(ratioOf(odds.hit))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.jackpotOdds}</span>
          <span className={styles.statValue} data-testid="bt-jackpot-odds">
            {small(valueOf(odds.jackpot))}
          </span>
          <span className={styles.statNote}>{t.jackpotOddsNote(fmt(jackpotOneIn))}</span>
          <span className={styles.statFraction}>{t.fractionNote(ratioOf(odds.jackpot))}</span>
        </div>
      </div>

      <section>
        <h2 className={styles.blockTitle}>{t.rulesTitle}</h2>
        <ul className={styles.ruleList}>
          {t.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.betsTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bt-bets-table">
            <thead>
              <tr>
                <th scope="col">{t.colBet}</th>
                <th scope="col" className={styles.num}>
                  {t.colBack}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colJackpot}
                </th>
              </tr>
            </thead>
            <tbody>
              {BETS.map((bet, i) => (
                <tr key={bet} data-bet={bet}>
                  <th scope="row">{t.betRow(bet)}</th>
                  <td className={styles.num}>{pct(valueOf(odds.byBet[i]))}</td>
                  <td className={styles.num}>{fmt(JACKPOT * bet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.discsTitle}</h2>
        <p className={styles.note}>{t.discsNote}</p>
        {Array.from({ length: LEVELS }, (_, level) => (
          <ScrollArea className={styles.tableWrap} key={level}>
            <table className={styles.oddsTable} data-testid={`bt-disc-${level}`}>
              <caption className={styles.caption}>{t.discHeading(level, small(valueOf(odds.reach[level])))}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.colPocket}</th>
                  <th scope="col" className={styles.num}>
                    {t.colCount}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colChance}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pocketKindsOf(level).map((row) => (
                  <tr key={`${row.kind}-${row.pays}`} data-kind={row.kind} data-pays={row.pays}>
                    <th scope="row">{t.pocketWords(row.kind, level, row.pays)}</th>
                    <td className={styles.num}>
                      {row.count}/{POCKETS[level]}
                    </td>
                    <td className={styles.num}>{pct(row.count / POCKETS[level])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        ))}
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.lampsTitle}</h2>
        <p className={styles.note}>{t.lampsNote}</p>
        {LAMP_SETS.map((lamps, level) =>
          lamps.length === 0 ? null : (
            <ScrollArea className={styles.tableWrap} key={level}>
              <table className={styles.oddsTable} data-testid={`bt-lamps-${level}`}>
                <caption className={styles.caption}>{t.lampHeading(level)}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.colLampPays}</th>
                    <th scope="col" className={styles.num}>
                      {t.colLamps}
                    </th>
                    <th scope="col" className={styles.num}>
                      {t.colChance}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(lamps)].map((pays) => {
                    const count = lamps.filter((n) => n === pays).length;
                    return (
                      <tr key={pays}>
                        <th scope="row">×{pays}</th>
                        <td className={styles.num}>
                          {count}/{lamps.length}
                        </td>
                        <td className={styles.num}>{pct(count / lamps.length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          ),
        )}
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.paysTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bt-pays-table">
            <thead>
              <tr>
                <th scope="col">{t.colPays}</th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr data-pays="0">
                <th scope="row">{t.nothingRow}</th>
                <td className={styles.num}>{pct(nothing)}</td>
              </tr>
              {odds.pays.map((row) => (
                <tr key={row.pays} data-pays={row.pays}>
                  <th scope="row">{t.paysRow(row.pays)}</th>
                  <td className={styles.num}>{small(valueOf(row.chance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.checkTitle}</h2>
        <p className={styles.note}>{t.checkNote(fmt(CHECK_RUNS))}</p>
        <button type="button" className={styles.btn} onClick={runCheck} disabled={running} data-testid="bt-check">
          {running ? t.checkRunning : t.checkRun}
        </button>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bt-check-table">
            <thead>
              <tr>
                <th scope="col">{t.colWhat}</th>
                <th scope="col" className={styles.num}>
                  {t.colExact}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colSeen}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t.checkBack}</th>
                <td className={styles.num}>{pct(valueOf(odds.back))}</td>
                <td className={styles.num}>{seen ? pct(seen.back) : '—'}</td>
              </tr>
              {Array.from({ length: LEVELS - 1 }, (_, i) => i + 1).map((level) => (
                <tr key={level}>
                  <th scope="row">{t.checkReach(level)}</th>
                  <td className={styles.num}>{small(valueOf(odds.reach[level]))}</td>
                  <td className={styles.num}>{seen ? small(seen.reached[level] / seen.runs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>
    </div>
  );
};

export default OddsTab;
