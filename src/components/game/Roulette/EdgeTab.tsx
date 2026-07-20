'use client';

import { useEffect, useRef, useState } from 'react';
import { EdgeChart } from './charts';
import { Bet, HOUSE_EDGE, HouseEdgeResult, simulateHouseEdge } from './engine';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings, betName } from './i18n';
import styles from './Roulette.module.css';

// Representative bet of each family so the demo shows the edge is identical.
const BET_OPTIONS: { id: string; label: string; bet: Bet }[] = [
  { id: 'red', label: 'red', bet: { kind: 'red' } },
  { id: 'dozen', label: 'dozen', bet: { kind: 'dozen', which: 1 } },
  { id: 'column', label: 'column', bet: { kind: 'column', which: 1 } },
  { id: 'corner', label: 'corner', bet: { kind: 'corner', numbers: [1, 2, 4, 5] } },
  { id: 'straight', label: 'straight', bet: { kind: 'straight', number: 7 } },
];

const SPIN_OPTIONS = [10_000, 100_000, 1_000_000];

export const EdgeTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [betId, setBetId] = useState('red');
  const [spins, setSpins] = useState(100_000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<HouseEdgeResult | null>(null);
  const runTimer = useRef<number | null>(null);

  // Cancel a pending simulation on unmount so navigating away doesn't run the
  // heavy compute and setState on an unmounted component.
  useEffect(() => () => {
    if (runTimer.current !== null) window.clearTimeout(runTimer.current);
  }, []);

  const run = () => {
    setRunning(true);
    const option = BET_OPTIONS.find((o) => o.id === betId) ?? BET_OPTIONS[0];
    // Yield to the event loop so the browser can paint the "running" state
    // before the heavy synchronous compute (up to ~1M spins) blocks the main
    // thread. requestAnimationFrame fires before paint, so it wouldn't help.
    runTimer.current = window.setTimeout(() => {
      const res = simulateHouseEdge(option.bet, spins);
      setResult(res);
      setRunning(false);
    }, 10);
  };

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

  return (
    <div>
      <h3 className={styles.blockTitle} style={{ color: 'var(--rl-gold)' }}>{t.edgeTitle}</h3>

      <div className={styles.formGrid} style={{ marginBottom: '1rem' }}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t.edgeBetLabel}</span>
          <select className={styles.input} value={betId} onChange={(e) => setBetId(e.target.value)} disabled={running}>
            {BET_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {betName(o.label, language)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t.edgeSpinsLabel}</span>
          <select className={styles.input} value={spins} onChange={(e) => setSpins(Number(e.target.value))} disabled={running}>
            {SPIN_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.field} style={{ justifyContent: 'flex-end' }}>
          <button onClick={run} disabled={running} className={`${styles.btn} ${styles.btnPrimary}`}>
            {running ? t.edgeRunning : t.edgeRun}
          </button>
        </div>
      </div>

      {!result && (
        <div className={styles.intro}>
          {t.edgeIntro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.statGrid}>
            <Stat label={t.theoretical} value={fmtPct(-HOUSE_EDGE)} accent="var(--rl-gold)" />
            <Stat label={t.empirical} value={fmtPct(result.finalEdge)} accent="#38bdf8" />
          </div>

          <div>
            <h4 className={styles.subTitle}>{t.edgeChartTitle}</h4>
            <EdgeChart
              points={result.points}
              theoretical={-HOUSE_EDGE}
              theoreticalLabel={t.theoretical}
            />
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#38bdf8' }} /> {t.empirical}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#e0a83c' }} /> {t.theoretical}
              </span>
            </div>
          </div>

          <p className={styles.note}>{t.edgeConverges(fmtPct(result.finalEdge))}</p>
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <div className={styles.stat} style={{ borderColor: `color-mix(in srgb, ${accent} 44%, var(--games-route-border))` }}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color: accent }}>{value}</div>
  </div>
);
