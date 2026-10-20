'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import { COLUMN_WEIGHTS, OUT_WEIGHTS, PAYS, PLAYERS, SIZE, WINDOWS, checkPlays, ratioOf, seeded, valueOf, type Player } from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_SMART_BALL_ODDS } from './published';
import styles from './SmartBall.module.css';

/** How many plays the check plays for each hand. */
export const CHECK_PLAYS = 20_000;

/** Hot Spring Smart Ball's exact odds (engine.ts, written out in published.ts): the three hands, the lines, the strengths, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const odds = PUBLISHED_SMART_BALL_ODDS;

  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState<Record<Player, number> | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the plays are played.
    window.setTimeout(() => {
      const random = seeded(20_261_019 + seed);
      setSeen({ perfect: checkPlays(CHECK_PLAYS, 'perfect', random).back, typical: checkPlays(CHECK_PLAYS, 'typical', random).back, blind: checkPlays(CHECK_PLAYS, 'blind', random).back });
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const hands: { key: Player; label: string; note: string; testId: string }[] = [
    { key: 'perfect', label: t.perfectLabel, note: t.perfectNote, testId: 'smb-perfect' },
    { key: 'typical', label: t.typicalLabel, note: t.typicalNote, testId: 'smb-typical' },
    { key: 'blind', label: t.blindLabel, note: t.blindNote, testId: 'smb-blind' },
  ];

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        {hands.map((hand) => (
          <div className={styles.stat} key={hand.key}>
            <span className={styles.statLabel}>{hand.label}</span>
            <span className={styles.statValue} data-testid={hand.testId}>
              {pct(valueOf(odds[hand.key].back))}
            </span>
            <span className={styles.statNote}>{hand.note}</span>
            <span className={styles.statFraction}>{t.fractionNote(ratioOf(odds[hand.key].back))}</span>
          </div>
        ))}
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
        <h2 className={styles.blockTitle}>{t.linesTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="smb-lines-table">
            <thead>
              <tr>
                <th scope="col">{t.colLines}</th>
                <th scope="col" className={styles.num}>
                  {t.colPays}
                </th>
                {hands.map((hand) => (
                  <th scope="col" className={styles.num} key={hand.key}>
                    {hand.key === 'perfect' ? t.colPerfect : hand.key === 'typical' ? t.colTypical : t.colBlind}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAYS.map((pays, n) => (
                <tr key={n} data-lines={n}>
                  <th scope="row">{t.lineCount(n)}</th>
                  <td className={styles.num}>{pays}</td>
                  {PLAYERS.map((player) => (
                    <td className={styles.num} key={player}>
                      {pct(valueOf(odds[player].lines[n]), 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.windowsTitle}</h2>
        <p className={styles.note}>{t.windowsNote}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="smb-windows-table">
            <thead>
              <tr>
                <th scope="col">{t.colWindow}</th>
                {Array.from({ length: SIZE }, (_, col) => (
                  <th scope="col" className={`${styles.num} ${styles.colName}`} key={col}>
                    {t.columnName(col)}
                  </th>
                ))}
                <th scope="col" className={styles.num}>
                  {t.colOut}
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: WINDOWS }, (_, w) => (
                <tr key={w} data-window={w}>
                  <th scope="row">{t.windowName(w)}</th>
                  {COLUMN_WEIGHTS[w].map((weight, col) => (
                    <td className={styles.num} key={col}>
                      {weight}
                    </td>
                  ))}
                  <td className={styles.num}>{OUT_WEIGHTS[w]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.checkTitle}</h2>
        <p className={styles.note}>{t.checkNote(fmt(CHECK_PLAYS))}</p>
        <button type="button" className={styles.btn} onClick={runCheck} disabled={running} data-testid="smb-check">
          {running ? t.checkRunning : t.checkRun}
        </button>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="smb-check-table">
            <thead>
              <tr>
                <th scope="col">{t.colHand}</th>
                <th scope="col" className={styles.num}>
                  {t.colExact}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colSeen}
                </th>
              </tr>
            </thead>
            <tbody>
              {hands.map((hand) => (
                <tr key={hand.key}>
                  <th scope="row">{hand.label}</th>
                  <td className={styles.num}>{pct(valueOf(odds[hand.key].back))}</td>
                  <td className={styles.num}>{seen ? pct(seen[hand.key]) : '—'}</td>
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
