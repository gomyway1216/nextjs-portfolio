'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  analyzeMachine,
  simulateConvergence,
  simulateSessions,
  type ConvergencePoint,
  type SessionConfig,
  type SessionSummary,
} from './engine';
import { ConvergenceChart, Histogram, TrajectoryChart } from './charts';
import { getStrings } from './i18n';
import styles from './SlotMachine.module.css';

const ODDS = analyzeMachine();
export const CONVERGENCE_SPINS = [10_000, 100_000, 1_000_000, 10_000_000] as const;
const SESSION_BETS = [1, 2, 5, 10] as const;
const DEFAULT_SESSION: SessionConfig = { bankroll: 100, bet: 1, maxSpins: 500 };
const DEFAULT_TRIALS = 2_000;
const LIMITS = { bankroll: [1, 100_000], maxSpins: [1, 20_000], trials: [1, 20_000] } as const;

const clampInt = (value: number, [min, max]: readonly [number, number]) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

  // Cancel any running simulation when the tab unmounts.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const begin = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  const [spins, setSpins] = useState<number>(CONVERGENCE_SPINS[1]);
  const [convergence, setConvergence] = useState<ConvergencePoint[] | null>(null);
  const [convergenceProgress, setConvergenceProgress] = useState<number | null>(null);

  const runConvergence = async () => {
    const signal = begin();
    setConvergenceProgress(0);
    const points = await simulateConvergence(spins, {
      signal,
      onProgress: (done, total) => setConvergenceProgress(Math.round((done / total) * 100)),
    });
    if (signal.aborted || !points) return;
    setConvergence(points);
    setConvergenceProgress(null);
  };

  const [session, setSession] = useState<SessionConfig>(DEFAULT_SESSION);
  const [trials, setTrials] = useState(DEFAULT_TRIALS);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryConfig, setSummaryConfig] = useState<SessionConfig>(DEFAULT_SESSION);
  const [sessionProgress, setSessionProgress] = useState<number | null>(null);

  const runSessions = async () => {
    const config: SessionConfig = {
      bet: session.bet,
      bankroll: Math.max(session.bet, clampInt(session.bankroll, LIMITS.bankroll)),
      maxSpins: clampInt(session.maxSpins, LIMITS.maxSpins),
    };
    const count = clampInt(trials, LIMITS.trials);
    setSession(config);
    setTrials(count);
    const signal = begin();
    setSessionProgress(0);
    const result = await simulateSessions(config, count, {
      signal,
      onProgress: (done, total) => setSessionProgress(Math.round((done / total) * 100)),
    });
    if (signal.aborted || !result) return;
    setSummary(result);
    setSummaryConfig(config);
    setSessionProgress(null);
  };

  const busy = convergenceProgress !== null || sessionProgress !== null;
  const lastPoint = convergence?.[convergence.length - 1];
  const halfBand = lastPoint ? (1.96 * ODDS.stdDev) / Math.sqrt(lastPoint.spins) : 0;
  const expectedFinal = summary ? summaryConfig.bankroll - summary.meanSpins * summaryConfig.bet * ODDS.houseEdge : 0;

  return (
    <div className={styles.simLayout}>
      <section className={styles.panel} aria-labelledby="slot-convergence-title">
        <h3 id="slot-convergence-title" className={styles.blockTitle}>
          {t.convergenceTitle}
        </h3>
        <p className={styles.note}>{t.convergenceIntro}</p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.spinsLabel}</span>
            <select className={styles.input} value={spins} onChange={(e) => setSpins(Number(e.target.value))} disabled={busy}>
              {CONVERGENCE_SPINS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={runConvergence} disabled={busy}>
            {convergenceProgress !== null ? t.running(convergenceProgress) : t.run}
          </button>
        </div>
        {convergence && lastPoint && (
          <>
            <ConvergenceChart
              points={convergence}
              rtp={ODDS.rtp}
              stdDev={ODDS.stdDev}
              theoreticalLabel={t.theoreticalRtp}
              bandLabel={t.band}
              xLabel={t.spinsAxis}
            />
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#38bdf8' }} /> {t.observedRtp}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#f59e0b' }} /> {t.theoreticalRtp} ({pct(ODDS.rtp, 2)})
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: 'rgba(251, 191, 36, 0.35)', height: 10 }} /> {t.band}
              </span>
            </div>
            <p className={styles.note} data-testid="slot-convergence-result">
              {t.observedAfter(fmt(lastPoint.spins), pct(lastPoint.rtp, 2), `${pct(ODDS.rtp - halfBand, 2)} – ${pct(ODDS.rtp + halfBand, 2)}`)}
            </p>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="slot-sessions-title">
        <h3 id="slot-sessions-title" className={styles.blockTitle}>
          {t.sessionsTitle}
        </h3>
        <p className={styles.note}>{t.sessionsIntro}</p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.bankrollLabel}</span>
            <input
              className={styles.input}
              type="number"
              min={LIMITS.bankroll[0]}
              max={LIMITS.bankroll[1]}
              value={session.bankroll}
              onChange={(e) => setSession({ ...session, bankroll: Number(e.target.value) })}
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.betLabel}</span>
            <select
              className={styles.input}
              value={session.bet}
              onChange={(e) => setSession({ ...session, bet: Number(e.target.value) })}
              disabled={busy}
            >
              {SESSION_BETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.spinsPerSession}</span>
            <input
              className={styles.input}
              type="number"
              min={LIMITS.maxSpins[0]}
              max={LIMITS.maxSpins[1]}
              value={session.maxSpins}
              onChange={(e) => setSession({ ...session, maxSpins: Number(e.target.value) })}
              disabled={busy}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.sessionsLabel}</span>
            <input
              className={styles.input}
              type="number"
              min={LIMITS.trials[0]}
              max={LIMITS.trials[1]}
              value={trials}
              onChange={(e) => setTrials(Number(e.target.value))}
              disabled={busy}
            />
          </label>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={runSessions} disabled={busy}>
          {sessionProgress !== null ? t.running(sessionProgress) : t.run}
        </button>

        {summary && (
          <div className={styles.sessionResults} data-testid="slot-session-results">
            <div className={styles.statGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.bustRate}</span>
                <span className={styles.statValue}>{pct(summary.bustRate)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.aheadRate}</span>
                <span className={styles.statValue}>{pct(summary.aheadRate)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.medianFinal}</span>
                <span className={styles.statValue}>{fmt(summary.medianFinal)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.meanFinal}</span>
                <span className={styles.statValue}>{fmt(summary.meanFinal, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.expectedFinal}</span>
                <span className={styles.statValue}>{fmt(expectedFinal, 1)}</span>
                <span className={styles.statNote}>{t.expectedFinalNote(pct(ODDS.houseEdge, 2))}</span>
              </div>
            </div>
            <h4 className={styles.subTitle}>{t.finalDist}</h4>
            <Histogram values={summary.finals} marker={summaryConfig.bankroll} xLabel={t.credits} />
            <h4 className={styles.subTitle}>{t.sampleSession}</h4>
            <TrajectoryChart trajectory={summary.sampleTrajectory} start={summaryConfig.bankroll} xLabel={t.spinsAxis} />
          </div>
        )}
      </section>
    </div>
  );
};
