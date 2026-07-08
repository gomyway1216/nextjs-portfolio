'use client';

import { useEffect, useRef, useState } from 'react';
import { ConvergenceChart, OutcomeBars, StepHistogram, TrajectoryChart } from './charts';
import { RuinConfig, SimSummary, runRuin, runRuinMonteCarloAsync, theoreticalRuinProb } from './engine';
import type { TFn } from './i18n';
import styles from './GamblersRuin.module.css';

const LIMITS = {
  start: { min: 1, max: 199 },
  target: { min: 2, max: 200 },
  winProb: { min: 0.01, max: 0.99 },
  maxSteps: { min: 100, max: 200_000 },
  trials: { min: 100, max: 50_000 },
};
const DEFAULTS = {
  config: { start: 10, target: 20, winProb: 0.5 } as RuinConfig,
  maxSteps: 10_000,
  trials: 2000,
};
const SAMPLE_PATH_COUNT = 30;

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = ({ t }: { t: TFn }) => {
  const [config, setConfig] = useState<RuinConfig>(DEFAULTS.config);
  const [maxSteps, setMaxSteps] = useState(DEFAULTS.maxSteps);
  const [trials, setTrials] = useState(DEFAULTS.trials);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimSummary | null>(null);
  const [samplePaths, setSamplePaths] = useState<number[][]>([]);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const updateConfig = <K extends keyof RuinConfig>(key: K, value: RuinConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    setSamplePaths([]);

    const safeConfig: RuinConfig = {
      start: clamp(config.start, LIMITS.start.min, Math.max(2, config.target) - 1),
      target: clamp(config.target, Math.max(LIMITS.target.min, config.start + 1), LIMITS.target.max),
      winProb: clamp(config.winProb, LIMITS.winProb.min, LIMITS.winProb.max),
    };
    const safeMax = clamp(maxSteps, LIMITS.maxSteps.min, LIMITS.maxSteps.max);
    const safeTrials = clamp(trials, LIMITS.trials.min, LIMITS.trials.max);
    setProgress({ done: 0, total: safeTrials });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runRuinMonteCarloAsync(safeConfig, safeTrials, safeMax, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (mountedRef.current) setProgress({ done, total });
        },
      });
      if (!mountedRef.current || controller.signal.aborted || !summary) return;
      const paths: number[][] = [];
      for (let i = 0; i < SAMPLE_PATH_COUNT; i++) {
        paths.push(runRuin(safeConfig, safeMax).trajectory);
      }
      setResult(summary);
      setSamplePaths(paths);
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
      runningRef.current = false;
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const runLabel = running && progress
    ? `${t('running')}… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : t('run');
  const pct = progress ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className={styles.simControls}>
        <Slider label={t('start')} value={config.start} min={LIMITS.start.min} max={Math.max(LIMITS.start.min, config.target - 1)} onChange={(v) => updateConfig('start', v)} disabled={running} />
        <Slider label={t('target')} value={config.target} min={Math.max(LIMITS.target.min, config.start + 1)} max={LIMITS.target.max} onChange={(v) => updateConfig('target', v)} disabled={running} />
        <Slider label={t('winProb')} value={config.winProb} min={LIMITS.winProb.min} max={LIMITS.winProb.max} step={0.01} onChange={(v) => updateConfig('winProb', v)} disabled={running} format={(v) => v.toFixed(2)} />
        <NumField label={t('maxSteps')} value={maxSteps} min={LIMITS.maxSteps.min} max={LIMITS.maxSteps.max} onChange={setMaxSteps} disabled={running} />
        <NumField label={t('trials')} value={trials} min={LIMITS.trials.min} max={LIMITS.trials.max} onChange={setTrials} disabled={running} />
      </div>

      <div className={styles.runRow}>
        <button onClick={run} disabled={running} className={styles.btnRun}>{runLabel}</button>
        {running && (
          <button onClick={stop} className={`${styles.btn} ${styles.btnOrange}`}>⏹ {t('stop')}</button>
        )}
        <button
          onClick={() => { setConfig(DEFAULTS.config); setMaxSteps(DEFAULTS.maxSteps); setTrials(DEFAULTS.trials); }}
          disabled={running}
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          {t('restoreDefaults')}
        </button>
      </div>

      {running && progress && (
        <div className={styles.progressWrap} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.progressBar} style={{ width: `${pct}%` }} />
        </div>
      )}

      {result ? <Results summary={result} samplePaths={samplePaths} t={t} /> : <Intro config={config} t={t} />}
    </div>
  );
};

const Intro = ({ config, t }: { config: RuinConfig; t: TFn }) => {
  const th = theoreticalRuinProb(config);
  return (
    <div className={styles.intro}>
      <strong>{t('title')}:</strong> {t('introBody')}
      <div style={{ marginTop: '0.6rem' }}>
        a={config.start}, N={config.target}, p={config.winProb.toFixed(2)} → {t('currentTheoRuin')}:{' '}
        <strong style={{ color: 'var(--gr-ruin)' }}>{(th * 100).toFixed(2)}%</strong>
      </div>
    </div>
  );
};

const Results = ({ summary, samplePaths, t }: { summary: SimSummary; samplePaths: number[][]; t: TFn }) => {
  const emp = {
    ruin: summary.ruinedCount / summary.trials,
    reach: summary.reachedCount / summary.trials,
    capped: summary.cappedCount / summary.trials,
  };
  const diff = summary.empiricalRuinProb - summary.theoreticalRuinProb;
  const legend = { ruin: t('legendRuin'), reach: t('legendReach'), cap: t('legendCap') };

  return (
    <div className={styles.results}>
      <div>
        <h3 className={styles.sectionHeading}>
          {summary.trials.toLocaleString()} {t('trials')} · a={summary.config.start}, N={summary.config.target}, p={summary.config.winProb.toFixed(2)}
        </h3>
        <div className={styles.statGridWide}>
          <Stat label={t('empRuin')} value={`${(summary.empiricalRuinProb * 100).toFixed(2)}%`} color="var(--gr-ruin)" />
          <Stat label={t('theoRuinShort')} value={`${(summary.theoreticalRuinProb * 100).toFixed(2)}%`} color="var(--gr-accent-strong)" />
          <Stat label={t('diff')} value={`${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(2)}pt`} color="var(--gr-purple)" />
          <Stat label={t('meanSteps')} value={summary.meanSteps.toFixed(1)} color="var(--gr-info)" />
          <Stat label={t('theoMeanSteps')} value={Number.isFinite(summary.theoreticalMeanSteps) ? summary.theoreticalMeanSteps.toFixed(1) : '—'} color="var(--gr-accent-strong)" />
          <Stat label={t('medianSteps')} value={summary.medianSteps.toFixed(0)} color="var(--gr-info)" />
          <Stat label={t('undecided')} value={`${summary.cappedCount}`} color="var(--gr-text-dim)" />
        </div>
      </div>

      <div>
        <h4 className={styles.subHeading}>{t('outcomeBreakdown')}</h4>
        <OutcomeBars empirical={emp} theoretical={summary.theoreticalRuinProb} />
        <p className={styles.caption}>{t('outcomeCaption')}</p>
      </div>

      <div>
        <h4 className={styles.subHeading}>{t('convergenceHeading')}</h4>
        <ConvergenceChart points={summary.convergence} theoretical={summary.theoreticalRuinProb} />
        <p className={styles.caption}>{t('convergenceCaption')}</p>
      </div>

      <div>
        <h4 className={styles.subHeading}>{t('durationHeading')}</h4>
        <StepHistogram bins={summary.stepHistogram} theoreticalMean={summary.theoreticalMeanSteps} />
        <p className={styles.caption}>{t('durationCaption')}</p>
      </div>

      <div>
        <h4 className={styles.subHeading}>{t('samplePaths')} ({samplePaths.length})</h4>
        <TrajectoryChart trajectories={samplePaths} start={summary.config.start} target={summary.config.target} legend={legend} />
        <p className={styles.caption}>{t('samplePathsCaption')}</p>
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className={styles.stat} style={{ borderColor: `color-mix(in srgb, ${color} 40%, var(--gr-border))` }}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>{value}</div>
  </div>
);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  format?: (v: number) => string;
}

const Slider = ({ label, value, min, max, step = 1, onChange, disabled, format }: SliderProps) => (
  <label className={`${styles.field} ${disabled ? styles.disabled : ''}`}>
    <span className={styles.fieldLabel}>
      {label}
      <span className={styles.fieldValue}>{format ? format(value) : value}</span>
    </span>
    <input
      type="range"
      className={styles.slider}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);

const NumField = ({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) => (
  <label className={`${styles.field} ${disabled ? styles.disabled : ''}`}>
    <span className={styles.fieldLabel}>{label}</span>
    <input
      type="number"
      className={styles.numInput}
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
