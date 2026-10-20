'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import selectStyles from '../common/select.module.css';
import { LAST_BALL_TIMES, SPOT_COUNTS, checkGames, payOf, seeded, valueOf, type Fraction } from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_KENO_ODDS } from './published';
import styles from './Keno.module.css';

/** How many games the check plays. */
export const CHECK_GAMES = 50_000;
/** The ticket whose paytable the tab opens on. */
export const FIRST_SHOWN = 5;

/** Video Keno's exact odds (engine.ts): every ticket's return, each paytable with its chances, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const ratio = (f: Fraction) => `${f.num.toString()}/${f.den.toString()}`;
  /** A chance as "1 in N", N to two figures after the point below 100 and to a whole number above. */
  const oneIn = (f: Fraction) => {
    const n = 1 / valueOf(f);
    return t.oneIn(fmt(n, n < 100 ? 2 : 0));
  };
  // Written out in published.ts: nothing is worked out as the tab is drawn (it is drawn, hidden, as the page opens).
  const odds = PUBLISHED_KENO_ODDS;

  const [spots, setSpots] = useState(FIRST_SHOWN);
  const ticket = odds.tickets[spots - 1];
  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState<{ spots: number; back: number } | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the games are played.
    window.setTimeout(() => {
      const result = checkGames(CHECK_GAMES, spots, seeded(20_261_019 + seed));
      setSeen({ spots, back: result.back });
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.bestLabel}</span>
          <span className={styles.statValue} data-testid="kn-best">
            {pct(valueOf(odds.best))}
          </span>
          <span className={styles.statNote}>{t.tablePickOption(odds.bestSpots)}</span>
          <span className={styles.statFraction}>{t.fractionNote(ratio(odds.best))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.worstLabel}</span>
          <span className={styles.statValue} data-testid="kn-worst">
            {pct(valueOf(odds.worst))}
          </span>
          <span className={styles.statNote}>{t.tablePickOption(odds.tickets.find((x) => x.back.num === odds.worst.num && x.back.den === odds.worst.den)!.spots)}</span>
          <span className={styles.statFraction}>{t.fractionNote(ratio(odds.worst))}</span>
        </div>
      </div>

      <section>
        <h2 className={styles.blockTitle}>{t.ticketsTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="kn-tickets-table">
            <thead>
              <tr>
                <th scope="col">{t.colSpots}</th>
                <th scope="col" className={styles.num}>
                  {t.colBack}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colTable}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colHit}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colTop}
                </th>
              </tr>
            </thead>
            <tbody>
              {odds.tickets.map((row) => (
                <tr key={row.spots} data-spots={row.spots}>
                  <th scope="row">{row.spots}</th>
                  <td className={styles.num} data-testid={`kn-back-${row.spots}`}>
                    {pct(valueOf(row.back))}
                  </td>
                  <td className={styles.num}>{pct(valueOf(row.table), 1)}</td>
                  <td className={styles.num}>{oneIn(row.hit)}</td>
                  <td className={styles.num}>
                    {fmt(payOf(row.spots, row.spots))} <span className={styles.percent}>×{LAST_BALL_TIMES} {fmt(payOf(row.spots, row.spots) * LAST_BALL_TIMES)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.oneSpotNote}</p>
        <p className={styles.note}>{t.twoSpotNote}</p>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.tableTitle}</h2>
        <label className={styles.pickRow}>
          <span>{t.tablePick}</span>
          <select className={`${styles.select} ${selectStyles.select}`} value={spots} onChange={(event) => setSpots(Number(event.target.value))} data-testid="kn-odds-spots">
            {SPOT_COUNTS.map((count) => (
              <option key={count} value={count}>
                {t.tablePickOption(count)}
              </option>
            ))}
          </select>
        </label>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="kn-pay-odds" data-spots={spots}>
            <thead>
              <tr>
                <th scope="col">{t.colCatch}</th>
                <th scope="col" className={styles.num}>
                  {t.colPays}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colShare}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...ticket.lines].reverse().map((line) => (
                <tr key={line.caught} data-caught={line.caught}>
                  <th scope="row">{line.caught}</th>
                  <td className={styles.num}>{line.pay > 0 ? fmt(line.pay) : t.noPay}</td>
                  <td className={styles.num}>{oneIn(line.chance)}</td>
                  <td className={styles.num}>{line.pay > 0 ? pct(valueOf(line.back)) : t.noPay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note} data-testid="kn-pay-odds-back">
          {pct(valueOf(ticket.back))} — {t.fractionNote(ratio(ticket.back))}
        </p>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.rulesTitle}</h2>
        <ul className={styles.ruleList}>
          {t.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.sourcesTitle}</h2>
        <ul className={styles.ruleList}>
          {t.sources.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.checkTitle}</h2>
        <p className={styles.note}>{t.checkNote(fmt(CHECK_GAMES), spots)}</p>
        <button type="button" className={styles.btn} onClick={runCheck} disabled={running} data-testid="kn-check">
          {running ? t.checkRunning : t.checkRun}
        </button>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="kn-check-table">
            <thead>
              <tr>
                <th scope="col">{t.colSpots}</th>
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
                <th scope="row">{spots}</th>
                <td className={styles.num}>{pct(valueOf(ticket.back))}</td>
                <td className={styles.num}>{seen && seen.spots === spots ? pct(seen.back) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </ScrollArea>
      </section>
    </div>
  );
};

export default OddsTab;
