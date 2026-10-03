'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { NetHistogram, PaybackChart } from './charts';
import { MAX_COINS, PAY_TABLES } from './engine';
import { getStrings } from './i18n';
import { PRECOMPUTED, STRATEGY_PAYBACK } from './precomputed';
import {
  STRATEGY_COLORS,
  STRATEGY_IDS,
  simulateSessions,
  simulateStrategies,
  type SessionsResult,
  type StrategiesResult,
} from './sim';
import styles from './VideoPoker.module.css';

export const HAND_OPTIONS = [10_000, 100_000, 1_000_000] as const;
export const SESSION_OPTIONS = [500, 1_000, 2_000] as const;
export const SESSION_HANDS_OPTIONS = [200, 500, 1_000] as const;
/** The game the simulations play. */
const PAYS = PAY_TABLES['9/6'];
const ROYAL = PRECOMPUTED['9/6'].final[9];
/** Session results above this many coins are gathered in the histogram's last bar. */
const HISTOGRAM_CAP = 1_000;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
  const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), digits)}`;

  // One controller per section so a run elsewhere never cancels this one; all abort on unmount.
  const controllers = useRef<Record<string, AbortController>>({});
  useEffect(() => {
    const all = controllers.current;
    return () => Object.values(all).forEach((c) => c.abort());
  }, []);
  const begin = (key: string) => {
    controllers.current[key]?.abort();
    const c = new AbortController();
    controllers.current[key] = c;
    return c;
  };

  const [hands, setHands] = useState<number>(HAND_OPTIONS[1]);
  const [strategies, setStrategies] = useState<StrategiesResult | null>(null);
  const [strategyHands, setStrategyHands] = useState(0);
  const [strategyProgress, setStrategyProgress] = useState<number | null>(null);
  const runStrategies = async () => {
    const c = begin('strategies');
    setStrategyProgress(0);
    let res: StrategiesResult | null = null;
    try {
      res = await simulateStrategies(hands, PAYS, { signal: c.signal, onProgress: (d, total) => setStrategyProgress(Math.round((d / total) * 100)) });
    } finally {
      // A failed run must not leave the button stuck on "Running…" (a newer run owns it otherwise).
      if (!res && controllers.current.strategies === c) setStrategyProgress(null);
    }
    if (c.signal.aborted || !res) return;
    setStrategies(res);
    setStrategyHands(hands);
    setStrategyProgress(null);
  };

  const [sessionCount, setSessionCount] = useState<number>(SESSION_OPTIONS[1]);
  const [sessionHands, setSessionHands] = useState<number>(SESSION_HANDS_OPTIONS[1]);
  const [sessions, setSessions] = useState<SessionsResult | null>(null);
  const [sessionProgress, setSessionProgress] = useState<number | null>(null);
  const runSessions = async () => {
    const c = begin('sessions');
    setSessionProgress(0);
    let res: SessionsResult | null = null;
    try {
      res = await simulateSessions(sessionCount, sessionHands, PAYS, {
        signal: c.signal,
        onProgress: (d, total) => setSessionProgress(Math.round((d / total) * 100)),
      });
    } finally {
      if (!res && controllers.current.sessions === c) setSessionProgress(null);
    }
    if (c.signal.aborted || !res) return;
    setSessions(res);
    setSessionProgress(null);
  };

  const select = (value: number, options: readonly number[], onChange: (n: number) => void, busy: boolean, label: string) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select className={styles.input} value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={busy}>
        {options.map((n) => (
          <option key={n} value={n}>
            {fmt(n)}
          </option>
        ))}
      </select>
    </label>
  );

  const expected = sessions ? -(1 - PRECOMPUTED['9/6'].payback) * sessions.handsPerSession * MAX_COINS : 0;
  const royalExact = sessions ? 1 - (1 - ROYAL) ** sessions.handsPerSession : 0;
  const offChart = sessions ? sessions.nets.filter((n) => n > HISTOGRAM_CAP).length : 0;

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="vp-sim-strategies-title">
        <h3 id="vp-sim-strategies-title" className={styles.blockTitle}>
          {t.stratTitle}
        </h3>
        <p className={styles.note}>{t.stratIntro}</p>
        <ul className={styles.ruleList}>
          {STRATEGY_IDS.map((id) => (
            <li key={id}>
              <span className={styles.swatch} style={{ background: STRATEGY_COLORS[id] }} /> <b>{t.strategyName[id]}</b> — {t.strategyRule[id]}
            </li>
          ))}
        </ul>
        <div className={styles.formRow}>
          {select(hands, HAND_OPTIONS, setHands, strategyProgress !== null, t.handsLabel)}
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={runStrategies} disabled={strategyProgress !== null}>
            {strategyProgress !== null ? t.running(strategyProgress) : t.run}
          </button>
        </div>
        {strategies && (
          <>
            <PaybackChart
              xLabel={t.handsLabel}
              series={STRATEGY_IDS.map((id) => ({
                id,
                color: STRATEGY_COLORS[id],
                label: t.strategyName[id],
                exact: STRATEGY_PAYBACK[id],
                points: strategies[id].points,
              }))}
            />
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="vp-sim-strategies">
                <thead>
                  <tr>
                    <th>{t.colStrategy}</th>
                    <th className={styles.num}>{t.colExact}</th>
                    <th className={styles.num}>{t.colSimulated(fmt(strategyHands))}</th>
                    <th className={styles.num}>{t.colDiffered}</th>
                    <th className={styles.num}>{t.colRoyals}</th>
                  </tr>
                </thead>
                <tbody>
                  {STRATEGY_IDS.map((id) => {
                    const s = strategies[id];
                    return (
                      <tr key={id} data-strategy={id}>
                        <td>
                          <span className={styles.swatch} style={{ background: STRATEGY_COLORS[id] }} /> {t.strategyName[id]}
                        </td>
                        <td className={styles.num}>{pct(STRATEGY_PAYBACK[id], 3)}</td>
                        <td className={styles.num}>
                          {pct(s.payback, 2)} <small className={styles.muted}>± {pct(1.96 * s.se, 2)}</small>
                        </td>
                        <td className={styles.num}>{pct(s.differed / strategyHands, 1)}</td>
                        <td className={styles.num}>{fmt(s.royals)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t.stratNote}</p>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="vp-sim-sessions-title">
        <h3 id="vp-sim-sessions-title" className={styles.blockTitle}>
          {t.sessionTitle}
        </h3>
        <p className={styles.note}>{t.sessionIntro}</p>
        <div className={styles.formRow}>
          {select(sessionCount, SESSION_OPTIONS, setSessionCount, sessionProgress !== null, t.sessionsLabel)}
          {select(sessionHands, SESSION_HANDS_OPTIONS, setSessionHands, sessionProgress !== null, t.handsPerSessionLabel)}
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={runSessions} disabled={sessionProgress !== null}>
            {sessionProgress !== null ? t.running(sessionProgress) : t.run}
          </button>
        </div>
        {sessions && (
          <div data-testid="vp-sim-sessions">
            <div className={styles.statGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.sessExpected}</span>
                <span className={styles.statValue} data-testid="vp-session-expected">
                  {signed(expected, 1)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.sessMean}</span>
                <span className={styles.statValue}>{signed(sessions.mean, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.sessMedian}</span>
                <span className={styles.statValue} data-testid="vp-session-median">
                  {signed(sessions.median)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.sessAhead}</span>
                <span className={styles.statValue}>{pct(sessions.ahead, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.sessRoyal}</span>
                <span className={styles.statValue}>{pct(sessions.withRoyal, 1)}</span>
                <span className={styles.statNote} data-testid="vp-session-royal-exact">
                  {t.sessRoyalExact(pct(royalExact, 2))}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.sessMedianNoRoyal}</span>
                <span className={styles.statValue}>{signed(sessions.medianWithoutRoyal)}</span>
              </div>
            </div>
            <div style={{ marginTop: '0.8rem' }}>
              <NetHistogram
                values={sessions.nets}
                cap={HISTOGRAM_CAP}
                marker={expected}
                xLabel={t.sessAxis}
                table={{
                  caption: t.sessTableCaption(signed(expected, 1)),
                  rangeHeader: t.sessColRange,
                  countHeader: t.sessColCount,
                  range: (from, to) => t.sessRange(signed(from), signed(to)),
                  over: t.sessRangeOver(fmt(HISTOGRAM_CAP)),
                  count: (n) => fmt(n),
                }}
              />
            </div>
            {offChart > 0 && <p className={styles.note}>{t.sessOffChart(fmt(offChart), fmt(HISTOGRAM_CAP))}</p>}
            <p className={styles.note}>{t.sessionNote}</p>
          </div>
        )}
      </section>
    </div>
  );
};
