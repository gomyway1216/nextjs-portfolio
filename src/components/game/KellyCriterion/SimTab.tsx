'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ConvergenceChart, Marker } from './charts';
import { SCENARIOS, SCENARIO_IDS, type ScenarioId } from './engine';
import { formatMultiple, percent, signedPercent } from './format';
import { getStrings } from './i18n';
import { STRATEGY_COLORS, STRATEGY_IDS, STRATEGY_MARKERS, exactFor, simulateSessions, type SimResult, type StrategyId } from './sim';
import styles from './KellyCriterion.module.css';

export const SESSION_OPTIONS = [1_000, 10_000, 100_000] as const;
export const FLIP_OPTIONS = [100, 300, 1_000] as const;
/**
 * The largest run on offer. The simulation runs on the main thread, so the
 * biggest session count is only available with the shorter sessions: 30
 * million flips take about a second and a half on a laptop.
 */
export const MAX_TOTAL_FLIPS = 30_000_000;
/** The session counts that stay within the limit for sessions of `flips` flips. */
export const sessionOptionsFor = (flips: number) => SESSION_OPTIONS.filter((sessions) => sessions * flips <= MAX_TOTAL_FLIPS);
/** All in never recovers from a loss, so its growth is −∞ and it has no line to draw. */
const CHARTED: StrategyId[] = ['half', 'kelly', 'double', 'triple'];

interface Run {
  scenario: ScenarioId;
  result: SimResult;
}

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const scenarioId = useId();
  const sessionsId = useId();
  const flipsId = useId();

  // A new run cancels the one before it; whatever is running is cancelled on unmount.
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const [scenario, setScenario] = useState<ScenarioId>('coin60');
  const [sessions, setSessions] = useState<number>(SESSION_OPTIONS[1]);
  const [flips, setFlips] = useState<number>(FLIP_OPTIONS[1]);
  // The result keeps the bet it was run with, so changing the controls afterwards does not relabel it.
  const [run, setRun] = useState<Run | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const start = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setProgress(0);
    const chosen = scenario;
    let result: SimResult | null = null;
    try {
      result = await simulateSessions(sessions, flips, SCENARIOS[chosen], {
        signal: c.signal,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
    } finally {
      // A failed run must not leave the button stuck on "Running…" (a newer run owns it otherwise).
      if (!result && controller.current === c) setProgress(null);
    }
    if (c.signal.aborted || !result) return;
    setRun({ scenario: chosen, result });
    setProgress(null);
  };

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setProgress(null);
  };

  const busy = progress !== null;
  const wager = run ? SCENARIOS[run.scenario] : null;
  const sessionOptions = sessionOptionsFor(flips);

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="kelly-sim-title">
        <h3 id="kelly-sim-title" className={styles.blockTitle}>
          {t.simTitle}
        </h3>
        <p className={styles.note}>{t.simIntro}</p>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={scenarioId}>
              {t.scenarioLabel}
            </label>
            <select id={scenarioId} className={styles.input} value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)} disabled={busy}>
              {SCENARIO_IDS.map((id) => (
                <option key={id} value={id}>
                  {t.scenarioName[id]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={flipsId}>
              {t.flipsPerSession}
            </label>
            <select
              id={flipsId}
              className={styles.input}
              value={flips}
              onChange={(e) => {
                const next = Number(e.target.value);
                setFlips(next);
                // Longer sessions allow fewer of them: fall back to the largest count still on offer.
                const allowed = sessionOptionsFor(next);
                if (!allowed.includes(sessions as (typeof SESSION_OPTIONS)[number])) setSessions(allowed[allowed.length - 1]);
              }}
              disabled={busy}
            >
              {FLIP_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={sessionsId}>
              {t.sessionsLabel}
            </label>
            <select id={sessionsId} className={styles.input} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} disabled={busy}>
              {sessionOptions.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={start} disabled={busy}>
            {busy ? t.running(progress) : t.run}
          </button>
          {busy && (
            <button type="button" className={styles.btn} onClick={cancel}>
              {t.cancel}
            </button>
          )}
        </div>

        {run && wager && (
          <div data-testid="kelly-sim-result" data-scenario={run.scenario}>
            <ul className={styles.legend} aria-hidden="true">
              {CHARTED.map((id) => (
                <li key={id}>
                  <svg width={30} height={14} viewBox="0 0 30 14">
                    <line x1={1} x2={29} y1={7} y2={7} stroke={STRATEGY_COLORS[id]} strokeWidth={2} />
                    <Marker shape={STRATEGY_MARKERS[id]} x={15} y={7} color={STRATEGY_COLORS[id]} />
                  </svg>{' '}
                  {t.strategyName[id]}
                </li>
              ))}
            </ul>
            <div className={styles.chartBlock}>
              <ConvergenceChart
                xLabel={t.simChartX}
                ariaLabel={t.simChartAria}
                series={CHARTED.map((id) => ({
                  id,
                  color: STRATEGY_COLORS[id],
                  marker: STRATEGY_MARKERS[id],
                  label: t.strategyName[id],
                  exact: exactFor(wager, id, run.result.flips).growth,
                  points: run.result.strategies[id].points,
                }))}
              />
            </div>
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="kelly-sim-table">
                <caption className={styles.caption}>
                  {t.scenarioName[run.scenario]} · {t.flipsPerSession}: {fmt(run.result.flips)} · {t.sessionsLabel}: {fmt(run.result.sessions)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" rowSpan={2}>
                      {t.colStrategy}
                    </th>
                    <th scope="col" rowSpan={2} className={styles.num}>
                      {t.colStake}
                    </th>
                    <th scope="colgroup" colSpan={2} className={styles.group}>
                      {t.colGrowth}
                    </th>
                    <th scope="colgroup" colSpan={2} className={styles.group}>
                      {t.colTypical}
                    </th>
                    <th scope="colgroup" colSpan={2} className={styles.group}>
                      {t.colBelowStart}
                    </th>
                    <th scope="colgroup" colSpan={2} className={styles.group}>
                      {t.colEverHalf}
                    </th>
                  </tr>
                  <tr>
                    {[0, 1, 2, 3].flatMap((group) => [
                      <th key={`${group}-sim`} scope="col" className={styles.num}>
                        {t.colSimulated}
                      </th>,
                      <th key={`${group}-exact`} scope="col" className={styles.num}>
                        {t.colExact}
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {STRATEGY_IDS.map((id) => {
                    const sim = run.result.strategies[id];
                    const exact = exactFor(wager, id, run.result.flips);
                    return (
                      <tr key={id} data-strategy={id} data-best={id === 'kelly' ? 'true' : undefined}>
                        <th scope="row">
                          <span className={styles.swatch} style={{ background: STRATEGY_COLORS[id] }} /> {t.strategyName[id]}
                        </th>
                        <td className={styles.num}>{percent(sim.fraction)}</td>
                        <td className={styles.num}>{signedPercent(sim.growth)}</td>
                        <td className={styles.num}>{signedPercent(exact.growth)}</td>
                        <td className={styles.num}>{formatMultiple(sim.median, locale)}</td>
                        <td className={styles.num}>{formatMultiple(exact.median, locale)}</td>
                        <td className={styles.num}>{percent(sim.belowStart, 1)}</td>
                        <td className={styles.num}>{percent(exact.belowStart, 1)}</td>
                        <td className={styles.num}>{percent(sim.everHalf, 1)}</td>
                        <td className={styles.num}>{percent(exact.everHalf, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note} data-testid="kelly-sim-note">
              {t.simNote(percent(run.result.winRate), percent(wager.p))}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
