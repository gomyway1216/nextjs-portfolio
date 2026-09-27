'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { expectedShooterRolls, shooterSurvival, toNumber } from './analysis';
import { EdgeChart, HandsChart, Histogram, TrajectoryChart } from './charts';
import { getStrings } from './i18n';
import {
  STRATEGY_COLORS,
  STRATEGY_IDS,
  simulateHands,
  simulateSessions,
  simulateStrategies,
  theoreticalEdge,
  type ConvergenceResult,
  type HandSummary,
  type SessionConfig,
  type SessionSummary,
  type StrategyId,
} from './sim';
import styles from './Craps.module.css';

export const ROLL_OPTIONS = [10_000, 100_000, 1_000_000] as const;
export const HAND_OPTIONS = [1_000, 10_000, 100_000] as const;
const HAND_CHART_MAX = 40;
const DEFAULT_SESSION: SessionConfig = { strategy: 'pass', bankroll: 200, maxRolls: 300 };
const LIMITS = { bankroll: [5, 100_000], maxRolls: [1, 5_000], trials: [1, 10_000] } as const;
const EXPECTED_ROLLS = toNumber(expectedShooterRolls());
const SURVIVAL = shooterSurvival(HAND_CHART_MAX);
/** P(a hand lasts exactly n rolls) for n = 1…HAND_CHART_MAX. */
const EXACT_LENGTH = Array.from({ length: HAND_CHART_MAX }, (_, i) => SURVIVAL[i] - SURVIVAL[i + 1]);

const clampInt = (v: number, [min, max]: readonly [number, number]) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min);

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;

  // One controller per section so a run elsewhere never cancels this one; all abort on unmount.
  const controllers = useRef<Record<string, AbortController>>({});
  useEffect(() => () => Object.values(controllers.current).forEach((c) => c.abort()), []);
  const begin = (key: string) => {
    controllers.current[key]?.abort();
    controllers.current[key] = new AbortController();
    return controllers.current[key].signal;
  };

  // --- Strategy comparison
  const [rolls, setRolls] = useState<number>(ROLL_OPTIONS[1]);
  const [edges, setEdges] = useState<ConvergenceResult | null>(null);
  const [edgesProgress, setEdgesProgress] = useState<number | null>(null);
  const runEdges = async () => {
    const signal = begin('edges');
    setEdgesProgress(0);
    const res = await simulateStrategies(rolls, { signal, onProgress: (d, total) => setEdgesProgress(Math.round((d / total) * 100)) });
    if (signal.aborted || !res) return;
    setEdges(res);
    setEdgesProgress(null);
  };

  // --- Sessions
  const [session, setSession] = useState<SessionConfig>(DEFAULT_SESSION);
  const [trials, setTrials] = useState(2_000);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryConfig, setSummaryConfig] = useState<SessionConfig>(DEFAULT_SESSION);
  const [sessionProgress, setSessionProgress] = useState<number | null>(null);
  const runSessions = async () => {
    const config: SessionConfig = {
      strategy: session.strategy,
      bankroll: clampInt(session.bankroll, LIMITS.bankroll),
      maxRolls: clampInt(session.maxRolls, LIMITS.maxRolls),
    };
    const count = clampInt(trials, LIMITS.trials);
    setSession(config);
    setTrials(count);
    const signal = begin('sessions');
    setSessionProgress(0);
    const res = await simulateSessions(config, count, { signal, onProgress: (d, total) => setSessionProgress(Math.round((d / total) * 100)) });
    if (signal.aborted || !res) return;
    setSummary(res);
    setSummaryConfig(config);
    setSessionProgress(null);
  };

  // --- Hands
  const [hands, setHands] = useState<number>(HAND_OPTIONS[1]);
  const [handResult, setHandResult] = useState<HandSummary | null>(null);
  const [handsProgress, setHandsProgress] = useState<number | null>(null);
  const runHands = async () => {
    const signal = begin('hands');
    setHandsProgress(0);
    const res = await simulateHands(hands, { signal, onProgress: (d, total) => setHandsProgress(Math.round((d / total) * 100)) });
    if (signal.aborted || !res) return;
    setHandResult(res);
    setHandsProgress(null);
  };

  const lastRolls = edges ? edges[STRATEGY_IDS[0]].at(-1)?.rolls ?? 0 : 0;
  const expectedFinal = summary ? summaryConfig.bankroll - summary.meanAction * theoreticalEdge(summaryConfig.strategy) : 0;

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="craps-sim-edge-title">
        <h3 id="craps-sim-edge-title" className={styles.blockTitle}>
          {t.simEdgeTitle}
        </h3>
        <p className={styles.note}>{t.simEdgeIntro}</p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.rollsLabel}</span>
            <select className={styles.input} value={rolls} onChange={(e) => setRolls(Number(e.target.value))} disabled={edgesProgress !== null}>
              {ROLL_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={runEdges} disabled={edgesProgress !== null}>
            {edgesProgress !== null ? t.running(edgesProgress) : t.run}
          </button>
        </div>
        {edges && (
          <>
            <EdgeChart
              xLabel={t.rollsLabel}
              series={STRATEGY_IDS.map((id) => ({
                id,
                color: STRATEGY_COLORS[id],
                label: t.strategyName[id],
                theory: theoreticalEdge(id),
                points: edges[id],
              }))}
            />
            <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="craps-sim-edges">
              <thead>
                <tr>
                  <th>{t.colStrategy}</th>
                  <th className={styles.num}>{t.colTheory}</th>
                  <th className={styles.num}>{t.colObserved(fmt(lastRolls))}</th>
                </tr>
              </thead>
              <tbody>
                {STRATEGY_IDS.map((id) => (
                  <tr key={id} data-strategy={id}>
                    <td>
                      <span className={styles.swatch} style={{ background: STRATEGY_COLORS[id] }} /> {t.strategyName[id]}
                    </td>
                    <td className={styles.num}>{pct(theoreticalEdge(id), 3)}</td>
                    <td className={styles.num}>{pct(edges[id].at(-1)!.edge, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="craps-sim-session-title">
        <h3 id="craps-sim-session-title" className={styles.blockTitle}>
          {t.sessionTitle}
        </h3>
        <p className={styles.note}>{t.sessionIntro}</p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.strategyLabel}</span>
            <select
              className={styles.input}
              value={session.strategy}
              onChange={(e) => setSession({ ...session, strategy: e.target.value as StrategyId })}
              disabled={sessionProgress !== null}
            >
              {STRATEGY_IDS.map((id) => (
                <option key={id} value={id}>
                  {t.strategyName[id]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.bankrollLabel}</span>
            <input
              className={styles.input}
              type="number"
              min={LIMITS.bankroll[0]}
              max={LIMITS.bankroll[1]}
              value={session.bankroll}
              onChange={(e) => setSession({ ...session, bankroll: Number(e.target.value) })}
              disabled={sessionProgress !== null}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.rollsPerSession}</span>
            <input
              className={styles.input}
              type="number"
              min={LIMITS.maxRolls[0]}
              max={LIMITS.maxRolls[1]}
              value={session.maxRolls}
              onChange={(e) => setSession({ ...session, maxRolls: Number(e.target.value) })}
              disabled={sessionProgress !== null}
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
              disabled={sessionProgress !== null}
            />
          </label>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={runSessions} disabled={sessionProgress !== null}>
          {sessionProgress !== null ? t.running(sessionProgress) : t.run}
        </button>
        {summary && (
          <div data-testid="craps-sim-sessions">
            <div className={styles.statGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.bustRate}</span>
                <span className={styles.statValue}>{pct(summary.bustRate, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.aheadRate}</span>
                <span className={styles.statValue}>{pct(summary.aheadRate, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.medianFinal}</span>
                <span className={styles.statValue}>{fmt(summary.medianFinal, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.meanFinal}</span>
                <span className={styles.statValue}>{fmt(summary.meanFinal, 1)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.expectedFinal}</span>
                <span className={styles.statValue}>{fmt(expectedFinal, 1)}</span>
                <span className={styles.statNote}>{t.expectedFinalNote(pct(theoreticalEdge(summaryConfig.strategy), 3))}</span>
              </div>
            </div>
            <h4 className={styles.subTitle}>{t.finalDist}</h4>
            <Histogram values={summary.finals} marker={summaryConfig.bankroll} xLabel={t.bankroll} />
            <h4 className={styles.subTitle}>{t.sampleSession}</h4>
            <TrajectoryChart trajectory={summary.sampleTrajectory} start={summaryConfig.bankroll} xLabel={t.survivalAxis} />
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="craps-sim-hands-title">
        <h3 id="craps-sim-hands-title" className={styles.blockTitle}>
          {t.handsTitle}
        </h3>
        <p className={styles.note}>{t.handsIntro}</p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.handsLabel}</span>
            <select className={styles.input} value={hands} onChange={(e) => setHands(Number(e.target.value))} disabled={handsProgress !== null}>
              {HAND_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={runHands} disabled={handsProgress !== null}>
            {handsProgress !== null ? t.running(handsProgress) : t.run}
          </button>
        </div>
        {handResult && (
          <>
            <HandsChart
              simulated={Array.from({ length: HAND_CHART_MAX }, (_, i) => (handResult.counts[i + 1] ?? 0) / handResult.hands)}
              exact={EXACT_LENGTH}
              xLabel={t.survivalAxis}
              simulatedLabel={t.simulatedShare}
              exactLabel={t.exactShare}
            />
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#38bdf8', height: 10 }} /> {t.simulatedShare}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#f59e0b' }} /> {t.exactShare}
              </span>
            </div>
            <p className={styles.note} data-testid="craps-sim-hands">
              {t.handsResult(fmt(handResult.hands), handResult.meanRolls.toFixed(2), EXPECTED_ROLLS.toFixed(2), handResult.longest)}
            </p>
          </>
        )}
      </section>
    </div>
  );
};
