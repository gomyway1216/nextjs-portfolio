'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { EdgeChart } from './charts';
import { getStrings } from './i18n';
import { STRATEGY_COLORS, STRATEGY_IDS, exactEdge, simulateStrategies, type StrategiesResult } from './sim';
import styles from './Blackjack.module.css';

export const ROUND_OPTIONS = [10_000, 100_000, 1_000_000] as const;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;

  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const [rounds, setRounds] = useState<number>(ROUND_OPTIONS[1]);
  const [result, setResult] = useState<StrategiesResult | null>(null);
  const [resultRounds, setResultRounds] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);

  const run = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setProgress(0);
    const res = await simulateStrategies(rounds, { signal: c.signal, onProgress: (d, total) => setProgress(Math.round((d / total) * 100)) });
    if (c.signal.aborted || !res) return;
    setResult(res);
    setResultRounds(rounds);
    setProgress(null);
  };

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="bj-sim-title">
        <h3 id="bj-sim-title" className={styles.blockTitle}>
          {t.simTitle}
        </h3>
        <p className={styles.note}>{t.simIntro}</p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.roundsLabel}</span>
            <select className={styles.input} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} disabled={progress !== null}>
              {ROUND_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={run} disabled={progress !== null}>
            {progress !== null ? t.running(progress) : t.run}
          </button>
        </div>
        {result && (
          <>
            <EdgeChart
              xLabel={t.roundsLabel}
              series={STRATEGY_IDS.map((id) => ({
                id,
                color: STRATEGY_COLORS[id],
                label: t.strategyName[id],
                theory: exactEdge(id),
                points: result[id].points,
              }))}
            />
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="bj-sim-table">
                <thead>
                  <tr>
                    <th>{t.colStrategy}</th>
                    <th className={styles.num}>{t.colExact}</th>
                    <th className={styles.num}>{t.colSimulated(fmt(resultRounds))}</th>
                    <th className={styles.num}>{t.colWinPushLose}</th>
                    <th className={styles.num}>{t.colBusts}</th>
                  </tr>
                </thead>
                <tbody>
                  {STRATEGY_IDS.map((id) => {
                    const s = result[id];
                    const n = resultRounds;
                    return (
                      <tr key={id} data-strategy={id}>
                        <td>
                          <span className={styles.swatch} style={{ background: STRATEGY_COLORS[id] }} /> {t.strategyName[id]}
                        </td>
                        <td className={styles.num}>{pct(exactEdge(id), 3)}</td>
                        <td className={styles.num}>
                          {pct(s.edge, 3)} <small className={styles.muted}>± {pct(1.96 * s.se, 2)}</small>
                        </td>
                        <td className={styles.num}>
                          {pct(s.wins / n, 1)} / {pct(s.pushes / n, 1)} / {pct(s.losses / n, 1)}
                        </td>
                        <td className={styles.num}>{pct(s.busts / n, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t.simNote}</p>
          </>
        )}
      </section>
    </div>
  );
};
