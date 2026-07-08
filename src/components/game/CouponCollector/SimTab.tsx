'use client';

import { useEffect, useRef, useState } from 'react';
import { ConvergenceChart, DistributionChart } from './charts';
import { SimSummary, runCollectorMonteCarloAsync } from './engine';
import type { CouponStrings } from './i18n';
import styles from './CouponCollector.module.css';

const LIMITS = {
  n: { min: 3, max: 500 },
  trials: { min: 100, max: 200_000 },
};
const DEFAULTS = { n: 50, trials: 5000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = ({ t }: { t: CouponStrings }) => {
  const [n, setN] = useState(DEFAULTS.n);
  const [trials, setTrials] = useState(DEFAULTS.trials);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimSummary | null>(null);

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
    const safeN = clamp(n, LIMITS.n.min, LIMITS.n.max);
    const safeT = clamp(trials, LIMITS.trials.min, LIMITS.trials.max);
    setProgress({ done: 0, total: safeT });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runCollectorMonteCarloAsync(safeN, safeT, {
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

  const runLabel =
    running && progress
      ? t.running(progress.done.toLocaleString(), progress.total.toLocaleString())
      : t.runSim;
  const progressPct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className={styles.simControls}>
        <NumField label={t.simSizeLabel} value={n} {...LIMITS.n} onChange={setN} />
        <NumField label={t.trialsLabel} value={trials} {...LIMITS.trials} onChange={setTrials} />
        <button type="button" className={styles.runBtn} onClick={run} disabled={running}>
          {runLabel}
        </button>
      </div>

      {running && progress && (
        <div className={styles.simProgressTrack} aria-hidden>
          <div className={styles.simProgressFill} style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {result ? <Results summary={result} t={t} /> : <Intro t={t} />}
    </div>
  );
};

const Intro = ({ t }: { t: CouponStrings }) => (
  <div className={styles.intro}>
    <strong>{t.introTitle}:</strong> {t.introBody}
  </div>
);

const Results = ({ summary, t }: { summary: SimSummary; t: CouponStrings }) => {
  const ratio = summary.meanDraws / summary.theoreticalMean;
  return (
    <div className={styles.resultsStack}>
      <div>
        <h3 className={styles.sectionTitle}>{t.resultHeading(summary.n, summary.trials.toLocaleString())}</h3>
        <div className={styles.simStatGrid}>
          <Stat label={t.meanDraws} value={summary.meanDraws.toFixed(1)} color="#f59e0b" />
          <Stat label={t.theoreticalMean} value={summary.theoreticalMean.toFixed(1)} color="#f59e0b" />
          <Stat label={t.meanRatio} value={`${ratio.toFixed(3)}×`} color="#f472b6" />
          <Stat label={t.median} value={summary.medianDraws.toFixed(0)} color="#4ade80" />
          <Stat label={t.empiricalStd} value={summary.empiricalStd.toFixed(1)} color="#a78bfa" />
          <Stat label={t.theoreticalStd} value={summary.theoreticalStd.toFixed(1)} color="#a78bfa" />
          <Stat label={t.p90} value={summary.p90Draws.toFixed(0)} color="#38bdf8" />
          <Stat label={t.p99} value={summary.p99Draws.toFixed(0)} color="#38bdf8" />
          <Stat label={t.minMax} value={`${summary.minDraws} / ${summary.maxDraws}`} color="#94a3b8" />
        </div>
        <p className={styles.note}>{t.skewNote}</p>
      </div>

      <div>
        <h4 className={styles.chartTitle}>{t.convergenceTitle}</h4>
        <ConvergenceChart
          points={summary.convergence}
          theoretical={summary.theoreticalMean}
          theoryLabel={t.theoryLabel}
          trialsAxisLabel={t.trialsAxis}
        />
        <p className={styles.note}>{t.convergenceNote}</p>
      </div>

      <div>
        <h4 className={styles.chartTitle}>{t.distTitle}</h4>
        <DistributionChart
          values={summary.drawCounts}
          mean={summary.meanDraws}
          median={summary.medianDraws}
          meanLabel={t.meanLabel}
          medianLabel={t.medianLabel}
          axisLabel={t.distAxis}
        />
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className={styles.statCard} style={{ borderColor: `${color}44` }}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>
      {value}
    </div>
  </div>
);

interface NumFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}
const NumField = ({ label, value, min, max, onChange }: NumFieldProps) => (
  <label className={styles.field}>
    <span className={styles.fieldLabel}>
      {label} ({min}–{max.toLocaleString()})
    </span>
    <input
      type="number"
      className={styles.input}
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(0);
        const v = Number(raw);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
