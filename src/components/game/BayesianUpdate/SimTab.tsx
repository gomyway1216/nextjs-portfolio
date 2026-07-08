'use client';

import { useEffect, useRef, useState } from 'react';
import type { BayesianStrings } from './i18n';
import { MultiTrajectoryChart } from './charts';
import { ConvergenceSummary, runConvergenceSimAsync } from './engine';
import styles from './BayesianUpdate.module.css';

const LIMITS = {
  trueP: { min: 0.01, max: 0.99 },
  steps: { min: 50, max: 5000 },
  trials: { min: 10, max: 500 },
};
const DEFAULTS = { trueP: 0.7, steps: 500, trials: 100 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = ({ t }: { t: BayesianStrings }) => {
  const [trueP, setTrueP] = useState(DEFAULTS.trueP);
  const [steps, setSteps] = useState(DEFAULTS.steps);
  const [trials, setTrials] = useState(DEFAULTS.trials);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ConvergenceSummary | null>(null);

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
    const safeP = clamp(trueP, LIMITS.trueP.min, LIMITS.trueP.max);
    const safeSteps = Math.floor(clamp(steps, LIMITS.steps.min, LIMITS.steps.max));
    const safeTrials = Math.floor(clamp(trials, LIMITS.trials.min, LIMITS.trials.max));
    setProgress({ done: 0, total: safeTrials });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runConvergenceSimAsync(safeP, safeSteps, safeTrials, {
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

  const runLabel = running && progress ? t.simRunning(progress.done, progress.total) : t.simRun;
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className={styles.card} style={{ marginBottom: '1rem' }}>
        <div className={styles.simControls}>
          <NumField label={t.simTrueP} value={trueP} {...LIMITS.trueP} step={0.01} float onChange={setTrueP} disabled={running} />
          <NumField label={t.simSteps} value={steps} {...LIMITS.steps} onChange={setSteps} disabled={running} />
          <NumField label={t.simTrials} value={trials} {...LIMITS.trials} onChange={setTrials} disabled={running} />
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={run}
            disabled={running}
            style={{ minWidth: 220 }}
            aria-busy={running}
          >
            {runLabel}
          </button>
          {running && (
            <div className={styles.progressTrack} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.progressBar} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>

      {result ? <Results summary={result} t={t} /> : <Intro t={t} />}
    </div>
  );
};

const Intro = ({ t }: { t: BayesianStrings }) => (
  <div className={styles.intro}>
    <strong style={{ color: 'var(--primary)' }}>{t.simIntroTitle}:</strong> {t.simIntroBody}
  </div>
);

const Results = ({ summary, t }: { summary: ConvergenceSummary; t: BayesianStrings }) => {
  const theoryStd = Math.sqrt((summary.trueP * (1 - summary.trueP)) / summary.steps);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className={styles.card}>
        <h3 className={styles.panelTitle}>{t.simTrajHeading(summary.trials, summary.trueP.toFixed(2))}</h3>
        <MultiTrajectoryChart
          trajectories={summary.trajectories}
          trueP={summary.trueP}
          axisLabel={t.posteriorMeanAxis(summary.trials)}
          startLabel={t.flipsAxis('0')}
          endLabel={t.flipsAxis((summary.steps).toLocaleString())}
        />
        <p className={styles.caption}>{t.simTrajCaption(summary.trueP.toFixed(2))}</p>
      </div>

      <div className={styles.card}>
        <h4 className={styles.panelTitle} style={{ fontSize: '0.95rem' }}>
          {t.simFinalHeading(summary.steps)}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.55rem' }}>
          <Stat label={t.simStatTrueP} value={summary.trueP.toFixed(3)} />
          <Stat label={t.simStatMeanOfMeans} value={summary.finalMeanOfMeans.toFixed(4)} />
          <Stat label={t.simStatSpread} value={summary.finalStd.toFixed(4)} />
          <Stat label={t.simStatTheory} value={theoryStd.toFixed(4)} />
        </div>
        <p className={styles.caption}>{t.simFinalCaption}</p>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue}>{value}</div>
  </div>
);

interface NumFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  float?: boolean;
  onChange: (v: number) => void;
  disabled?: boolean;
}
const NumField = ({ label, value, min, max, step, float, onChange, disabled }: NumFieldProps) => (
  <label className={styles.numField} style={{ opacity: disabled ? 0.6 : 1 }}>
    <span className={styles.statLabel}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(0);
        const v = float ? parseFloat(raw) : Number(raw);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
