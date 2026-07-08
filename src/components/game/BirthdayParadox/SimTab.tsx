'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CurveChart } from './charts';
import { SweepSummary, runBirthdaySweepAsync } from './engine';
import type { BirthdayStrings } from './i18n';
import type { GameLanguage } from '../constants/gameTranslations';
import styles from './BirthdayParadox.module.css';

const LIMITS = {
  maxN: { min: 10, max: 200 },
  trialsPerN: { min: 100, max: 10_000 },
};
const DEFAULTS = { maxN: 100, trialsPerN: 1000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

interface SimTabProps {
  t: BirthdayStrings;
  language: GameLanguage;
}

export const SimTab = ({ t, language }: SimTabProps) => {
  const [maxN, setMaxN] = useState(DEFAULTS.maxN);
  const [trialsPerN, setTrialsPerN] = useState(DEFAULTS.trialsPerN);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SweepSummary | null>(null);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    const safeMaxN = clamp(maxN, LIMITS.maxN.min, LIMITS.maxN.max);
    const safeTrials = clamp(trialsPerN, LIMITS.trialsPerN.min, LIMITS.trialsPerN.max);
    setProgress({ done: 0, total: safeMaxN });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runBirthdaySweepAsync(safeMaxN, safeTrials, {
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

  const runLabel = running && progress ? t.running(progress.done, progress.total) : t.runSim;
  const pct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className={styles.controls}>
        <NumField label={t.maxGroup} value={maxN} {...LIMITS.maxN} onChange={setMaxN} />
        <NumField label={t.trialsPerN} value={trialsPerN} {...LIMITS.trialsPerN} onChange={setTrialsPerN} />
        <button
          type="button"
          onClick={run}
          disabled={running}
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{ minWidth: 220, cursor: running ? 'wait' : undefined }}
        >
          {runLabel}
        </button>
      </div>

      {running && (
        <div className={styles.progress} aria-hidden>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      )}

      {result ? (
        <Results summary={result} t={t} language={language} />
      ) : (
        !running && <Intro t={t} />
      )}
    </div>
  );
};

const Intro = ({ t }: { t: BirthdayStrings }) => (
  <div className={styles.hint} style={{ marginTop: 0 }}>
    <strong>{t.simIntroTitle}: </strong>
    {t.simIntro}
  </div>
);

const Results = ({
  summary,
  t,
  language,
}: {
  summary: SweepSummary;
  t: BirthdayStrings;
  language: GameLanguage;
}) => {
  const annotations = [
    summary.fiftyPercentN !== null ? { n: summary.fiftyPercentN, label: '50%', color: '#f59e0b' } : null,
    summary.ninetyNinePercentN !== null ? { n: summary.ninetyNinePercentN, label: '99%', color: '#ec4899' } : null,
  ].filter((a): a is { n: number; label: string; color: string } => a !== null);

  const at = (n: number) => summary.points.find((p) => p.n === n) ?? null;
  const p23 = at(23);
  const p50 = at(50);
  const p70 = at(70);

  // Mean absolute error between simulation and theory — a single number that
  // shrinks as trials grow, quantifying "the sim matches the math".
  const mae = useMemo(() => {
    if (summary.points.length === 0) return 0;
    const sum = summary.points.reduce((acc, p) => acc + Math.abs(p.empirical - p.theoretical), 0);
    return sum / summary.points.length;
  }, [summary.points]);

  const nf = (n: number | null) => (n === null ? '—' : n.toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>{t.chartTitle(summary.trialsPerN.toLocaleString())}</h3>
        <div className={styles.chartWrap}>
          <CurveChart
            points={summary.points}
            annotations={annotations}
            legendTheoretical={t.legendTheoretical}
            legendSimulation={t.legendSimulation}
            axisLabel={t.axisN}
          />
        </div>
        <p className={styles.caption}>{t.crossing(nf(summary.fiftyPercentN), nf(summary.ninetyNinePercentN))}</p>
      </div>

      <div>
        <h4 className={styles.sectionTitle} style={{ fontSize: '0.95rem' }}>{t.snapshotTitle}</h4>
        <div className={styles.snapGrid}>
          {p23 && <Snapshot n={23} p={p23} accent="#d97706" simLabel={t.simEmpirical} />}
          {p50 && <Snapshot n={50} p={p50} accent="#0891b2" simLabel={t.simEmpirical} />}
          {p70 && <Snapshot n={70} p={p70} accent="#db2777" simLabel={t.simEmpirical} />}
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t.convergence}</div>
            <div className={styles.statValue} style={{ fontSize: '1.35rem' }}>
              {(mae * 100).toFixed(2)}%
            </div>
            <div className={styles.statSub}>{summary.trialsPerN.toLocaleString()} × {summary.maxN}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Snapshot = ({
  n,
  p,
  accent,
  simLabel,
}: {
  n: number;
  p: { empirical: number; theoretical: number };
  accent: string;
  simLabel: string;
}) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>n = {n}</div>
    <div className={styles.statValue} style={{ color: accent, fontSize: '1.4rem' }}>
      {(p.theoretical * 100).toFixed(1)}%
    </div>
    <div className={styles.statSub}>{simLabel}: {(p.empirical * 100).toFixed(1)}%</div>
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
    <span className={styles.fieldLabel}>{label}</span>
    <input
      className={styles.numInput}
      type="number"
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
