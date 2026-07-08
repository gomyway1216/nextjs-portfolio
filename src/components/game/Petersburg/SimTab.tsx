'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ConvergenceChart, PayoffHistogram } from './charts';
import { SweepSummary, runPetersburgSweepAsync } from './engine';
import { getPetersburgStrings } from './i18n';
import styles from './petersburg.module.css';

const LIMITS = { maxN: { min: 1000, max: 1_000_000 } };
const DEFAULTS = { maxN: 100_000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

const fmtMoney = (v: number) =>
  v >= Number.MAX_SAFE_INTEGER ? '$9e15+' : `$${Math.round(v).toLocaleString()}`;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getPetersburgStrings(language);

  const [maxN, setMaxN] = useState(DEFAULTS.maxN);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SweepSummary | null>(null);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    const safeN = clamp(maxN, LIMITS.maxN.min, LIMITS.maxN.max);
    setProgress({ done: 0, total: safeN });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runPetersburgSweepAsync(safeN, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (mountedRef.current) setProgress({ done, total });
        },
      });
      if (!mountedRef.current || controller.signal.aborted || !summary) return;
      setResult(summary);
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
      runningRef.current = false;
      abortRef.current = null;
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setResult(null);
    setProgress(null);
  };

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const runLabel =
    running && progress
      ? `${t.running}… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
      : t.runSim;

  return (
    <div>
      <div className={styles.simControls}>
        <label className={styles.field} style={{ opacity: running ? 0.6 : 1 }}>
          <span className={styles.fieldLabel}>{t.trials}</span>
          <input
            type="number"
            value={maxN}
            min={LIMITS.maxN.min}
            max={LIMITS.maxN.max}
            step={1000}
            disabled={running}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return setMaxN(0);
              const v = Number(raw);
              if (Number.isFinite(v)) setMaxN(v);
            }}
            className={styles.numberInput}
            aria-label={t.trials}
          />
        </label>
        <button className={styles.runBtn} onClick={run} disabled={running}>
          {runLabel}
        </button>
        {result && !running && (
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={reset}>
            {t.reset}
          </button>
        )}
        <span className={styles.simHint}>{t.simHint}</span>
      </div>

      {running && progress && (
        <div className={styles.progressTrack} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      )}

      {result ? <Results summary={result} t={t} /> : <Intro t={t} />}
    </div>
  );
};

const Intro = ({ t }: { t: ReturnType<typeof getPetersburgStrings> }) => (
  <div className={styles.explainer} style={{ marginTop: 0 }}>
    {t.simIntro}
  </div>
);

const Results = ({
  summary,
  t,
}: {
  summary: SweepSummary;
  t: ReturnType<typeof getPetersburgStrings>;
}) => {
  const last = summary.points[summary.points.length - 1];
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <h3 className={styles.sectionTitle} style={{ color: '#f59e0b' }}>
          {t.convergence} ({summary.total.toLocaleString()})
        </h3>
        <div className={styles.chartWrap}>
          <ConvergenceChart points={summary.points} t={t} />
        </div>
        <p className={styles.caption}>{t.convergenceCaption}</p>
      </div>

      <div className={styles.card}>
        <h4 className={styles.sectionTitle}>{t.finalReadout}</h4>
        <div className={styles.readoutGrid}>
          <Stat label="N" value={last.N.toLocaleString()} color="#38bdf8" />
          <Stat label={t.meanLabel} value={`$${last.mean.toFixed(2)}`} color="#38bdf8" />
          <Stat label={t.fairTheory} value={`$${last.fairPrice.toFixed(2)}`} color="#f59e0b" />
          <Stat label={t.medianLabel} value={`$${last.median.toFixed(2)}`} color="#22c55e" />
          <Stat label={t.maxPayout} value={fmtMoney(last.max)} color="#ec4899" />
          <Stat label={t.longestStreak} value={`${summary.maxFlips} ${t.flips}`} color="#a78bfa" />
        </div>
      </div>

      <div className={styles.card}>
        <h4 className={styles.sectionTitle}>{t.distribution}</h4>
        <div className={styles.chartWrap}>
          <PayoffHistogram log2Hist={summary.log2Hist} total={summary.total} t={t} />
        </div>
        <p className={styles.caption}>{t.distributionCaption}</p>
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>
      {value}
    </div>
  </div>
);
