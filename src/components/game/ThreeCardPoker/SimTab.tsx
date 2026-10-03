'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { HAND_COUNT, qualifyingHands } from './analysis';
import { EdgeChart } from './charts';
import type { StrategyId } from './engine';
import { getStrings } from './i18n';
import { STRATEGY_COLORS, exactEdge, simulateStrategies, type SimResult } from './sim';
import styles from './ThreeCardPoker.module.css';

export const HAND_OPTIONS = [10_000, 100_000, 1_000_000] as const;
/** Cheapest strategy first, as on the Odds tab. */
const ORDER: StrategyId[] = ['optimal', 'mimic', 'always'];

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;

  // A new run cancels the one before it; whatever is running is cancelled on unmount.
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const [hands, setHands] = useState<number>(HAND_OPTIONS[1]);
  const [result, setResult] = useState<SimResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const run = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setProgress(0);
    let res: SimResult | null = null;
    try {
      res = await simulateStrategies(hands, { signal: c.signal, onProgress: (done, total) => setProgress(Math.round((done / total) * 100)) });
    } finally {
      // A failed run must not leave the button stuck on "Running…" (a newer run owns it otherwise).
      if (!res && controller.current === c) setProgress(null);
    }
    if (c.signal.aborted || !res) return;
    setResult(res);
    setProgress(null);
  };

  const busy = progress !== null;
  const gap = ((exactEdge('mimic') - exactEdge('optimal')) * 100).toFixed(2);

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="tcp-sim-title">
        <h3 id="tcp-sim-title" className={styles.blockTitle}>
          {t.simTitle}
        </h3>
        <p className={styles.note}>{t.simIntro}</p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t.handsLabel}</span>
            <select className={styles.input} value={hands} onChange={(e) => setHands(Number(e.target.value))} disabled={busy}>
              {HAND_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={run} disabled={busy}>
            {busy ? t.running(progress) : t.run}
          </button>
        </div>
        {result && (
          <>
            <EdgeChart
              xLabel={t.handsLabel}
              series={ORDER.map((id) => ({
                id,
                color: STRATEGY_COLORS[id],
                label: t.strategyName[id],
                theory: exactEdge(id),
                points: result.strategies[id].points,
              }))}
            />
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="tcp-sim-table">
                <thead>
                  <tr>
                    <th>{t.colStrategy}</th>
                    <th className={styles.num}>{t.colSimulated(fmt(result.hands))}</th>
                    <th className={styles.num}>{t.colExact}</th>
                    <th className={styles.num}>{t.colPlayed}</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDER.map((id) => {
                    const s = result.strategies[id];
                    return (
                      <tr key={id} data-strategy={id}>
                        <td>
                          <span className={styles.swatch} style={{ background: STRATEGY_COLORS[id] }} /> {t.strategyName[id]}
                        </td>
                        <td className={styles.num}>
                          {pct(s.edge, 3)} <small className={styles.muted}>± {pct(1.96 * s.se, 2)}</small>
                        </td>
                        <td className={styles.num}>{pct(exactEdge(id), 3)}</td>
                        <td className={styles.num}>{pct(s.played / result.hands, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note} data-testid="tcp-sim-note">
              {t.simNote(pct(result.dealerQualified / result.hands), pct(qualifyingHands() / HAND_COUNT), gap)}
            </p>
          </>
        )}
      </section>
    </div>
  );
};
