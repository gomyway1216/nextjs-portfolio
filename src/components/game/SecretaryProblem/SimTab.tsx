'use client';

import { useEffect, useRef, useState } from 'react';
import { SuccessCurveChart } from './charts';
import { SweepSummary, runSecretarySweepAsync } from './engine';
import type { SecretaryStrings } from './i18n';
import styles from './SecretaryProblem.module.css';

const LIMITS = {
  n: { min: 5, max: 200 },
  trialsPerR: { min: 100, max: 20_000 },
};
const DEFAULTS = { n: 50, trialsPerR: 1000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

interface SimTabProps {
  t: SecretaryStrings;
}

export const SimTab = ({ t }: SimTabProps) => {
  const [n, setN] = useState(DEFAULTS.n);
  const [trialsPerR, setTrialsPerR] = useState(DEFAULTS.trialsPerR);
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
    const safeN = clamp(n, LIMITS.n.min, LIMITS.n.max);
    const safeT = clamp(trialsPerR, LIMITS.trialsPerR.min, LIMITS.trialsPerR.max);
    setProgress({ done: 0, total: safeT });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runSecretarySweepAsync(safeN, safeT, {
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
    running && progress ? t.running(progress.done, progress.total) : t.runSim;
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className={styles.simControls}>
        <NumField
          label={t.numCandidates}
          value={n}
          {...LIMITS.n}
          onChange={setN}
          disabled={running}
        />
        <NumField
          label={t.trialsPerR}
          value={trialsPerR}
          {...LIMITS.trialsPerR}
          onChange={setTrialsPerR}
          disabled={running}
        />
        <button className={styles.runBtn} onClick={run} disabled={running}>
          {runLabel}
        </button>
      </div>

      {running && (
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      )}

      {result ? <Results summary={result} t={t} /> : <Intro t={t} />}
    </div>
  );
};

const Intro = ({ t }: { t: SecretaryStrings }) => (
  <div className={styles.simIntro}>
    <strong>{t.simIntroTitle}:</strong> {t.simIntroBody}
    <br />
    <br />
    {t.simIntroHighlight}
  </div>
);

const Results = ({ summary, t }: { summary: SweepSummary; t: SecretaryStrings }) => {
  const bestRatio = summary.bestR / summary.n;
  const keyRs = Array.from(
    new Set(
      [0, 0.1, 0.2, Math.round(summary.n / Math.E) / summary.n, 0.5, 0.7].map((ratio) =>
        Math.round(ratio * summary.n),
      ),
    ),
  ).sort((a, b) => a - b);

  return (
    <div className={styles.results}>
      <div>
        <h3 className={styles.cardTitle}>{t.successVsSkip(summary.n, summary.trialsPerR)}</h3>
        <SuccessCurveChart
          points={summary.points}
          empiricalBestR={summary.bestR}
          theoreticalBestR={summary.theoreticalBestR}
          t={t}
        />
        <p className={styles.chartCaption}>
          {t.empiricalBest}:{' '}
          <strong>r = {summary.bestR}</strong> ({(bestRatio * 100).toFixed(1)}%) /{' '}
          {(summary.bestRate * 100).toFixed(2)}%. {t.theoreticalBest}:{' '}
          <strong>r = {summary.theoreticalBestR}</strong> (n/e) /{' '}
          {(summary.theoreticalBestRate * 100).toFixed(2)}%. {t.convergesTo}
        </p>
      </div>

      <div>
        <h3 className={styles.cardTitle}>{t.keyRatios}</h3>
        <div className={styles.ratioGrid}>
          {keyRs.map((r) => {
            const p = summary.points[r];
            if (!p) return null;
            const isOptimum = r === summary.theoreticalBestR;
            return (
              <div
                key={r}
                className={`${styles.ratioCard} ${isOptimum ? styles.ratioCardOpt : ''}`}
              >
                <div className={styles.ratioTop}>
                  r = {r} ({(p.ratio * 100).toFixed(0)}%){isOptimum && ' ⭐'}
                </div>
                <div
                  className={`${styles.ratioMain} ${isOptimum ? styles.ratioMainOpt : ''}`}
                >
                  {(p.successRate * 100).toFixed(1)}%
                </div>
                <div className={styles.ratioTheory}>
                  {t.theoryShort} {(p.theoretical * 100).toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
        <p className={styles.chartCaption}>{t.ratiosNote}</p>
      </div>
    </div>
  );
};

interface NumFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}
const NumField = ({ label, value, min, max, onChange, disabled }: NumFieldProps) => (
  <label className={styles.numField} style={{ opacity: disabled ? 0.6 : 1 }}>
    <span className={styles.numLabel}>{label}</span>
    <input
      type="number"
      className={styles.numInput}
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(0);
        const v = Number(raw);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
