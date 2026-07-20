'use client';

import { useEffect, useRef, useState } from 'react';
import { BankrollChart, Histogram } from './charts';
import {
  MartingaleConfig,
  MonteCarloSummary,
  RunResult,
  runMartingale,
  runMonteCarloAsync,
} from './engine';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import styles from './Roulette.module.css';

const defaults: MartingaleConfig = {
  initialBankroll: 1000,
  baseBet: 1,
  tableMax: 500,
  maxSpins: 1000,
  side: 'red',
};

const LIMITS = {
  initialBankroll: { min: 10, max: 10_000_000 },
  baseBet: { min: 1, max: 1_000_000 },
  tableMax: { min: 1, max: 10_000_000 },
  maxSpins: { min: 10, max: 50_000 },
  trials: { min: 1, max: 20_000 },
};

interface SimState {
  sample: RunResult;
  summary: MonteCarloSummary;
  trials: number;
  config: MartingaleConfig;
}

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

const sanitizeConfig = (raw: MartingaleConfig): MartingaleConfig => ({
  initialBankroll: clamp(raw.initialBankroll, LIMITS.initialBankroll.min, LIMITS.initialBankroll.max),
  baseBet: clamp(raw.baseBet, LIMITS.baseBet.min, LIMITS.baseBet.max),
  tableMax: clamp(raw.tableMax, LIMITS.tableMax.min, LIMITS.tableMax.max),
  maxSpins: clamp(raw.maxSpins, LIMITS.maxSpins.min, LIMITS.maxSpins.max),
  side: raw.side,
});

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [config, setConfig] = useState<MartingaleConfig>(defaults);
  const [trials, setTrials] = useState(1000);
  const [result, setResult] = useState<SimState | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const updateConfig = <K extends keyof MartingaleConfig>(key: K, value: MartingaleConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress({ done: 0, total: trials });

    const safeConfig = sanitizeConfig(config);
    const safeTrials = clamp(trials, LIMITS.trials.min, LIMITS.trials.max);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const summary = await runMonteCarloAsync(
        safeConfig,
        safeTrials,
        {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (mountedRef.current) setProgress({ done, total });
          },
        },
      );
      if (!mountedRef.current || controller.signal.aborted || !summary) return;
      const sample = runMartingale(safeConfig);
      setResult({ sample, summary, trials: safeTrials, config: safeConfig });
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
      runningRef.current = false;
      abortRef.current = null;
    }
  };

  const runLabel = running && progress
    ? `${t.running}… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : t.runSim;

  return (
    <div>
      <div className={styles.formGrid}>
        <NumField label={t.initialBankroll} value={config.initialBankroll} {...LIMITS.initialBankroll} onChange={(v) => updateConfig('initialBankroll', v)} />
        <NumField label={t.baseBet} value={config.baseBet} {...LIMITS.baseBet} onChange={(v) => updateConfig('baseBet', v)} />
        <NumField label={t.tableMax} value={config.tableMax} {...LIMITS.tableMax} onChange={(v) => updateConfig('tableMax', v)} />
        <NumField label={t.maxSpins} value={config.maxSpins} {...LIMITS.maxSpins} onChange={(v) => updateConfig('maxSpins', v)} />
        <NumField label={t.trialsLabel} value={trials} {...LIMITS.trials} onChange={setTrials} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={run} disabled={running} className={`${styles.btn} ${styles.btnPrimary}`} style={{ minWidth: 220 }}>
          {runLabel}
        </button>
        <button onClick={() => setConfig(defaults)} disabled={running} className={styles.btn}>
          {t.restoreDefaults}
        </button>
        <span style={{ color: 'var(--games-route-muted)', fontSize: '0.8rem' }}>
          {t.trialsNote(LIMITS.trials.max.toLocaleString())}
        </span>
      </div>

      {result && <Results state={result} />}

      {!result && (
        <div className={styles.intro}>
          <p><strong>{t.simIntroTitle}</strong></p>
          {t.simIntro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
};

const Results = ({ state }: { state: SimState }) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const { sample, summary, trials, config } = state;
  const bustRate = (summary.bustRate * 100).toFixed(1);
  const tableHitRate = ((summary.tableMaxHitCount / trials) * 100).toFixed(1);
  const sampleOutcomeLabel: Record<RunResult['outcome'], string> = {
    bust: t.outcomeBust,
    capped: t.outcomeCapped(config.maxSpins),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 className={styles.blockTitle} style={{ color: 'var(--rl-gold)' }}>{t.mcResult(trials)}</h3>
        <div className={styles.statGrid}>
          <Stat label={t.bustRate} value={`${bustRate}%`} accent="var(--rl-lose)" />
          <Stat label={t.medianSpinsToBust} value={summary.medianSpinsToBust === null ? '—' : `${summary.medianSpinsToBust}`} accent="#38bdf8" />
          <Stat label={t.medianFinal} value={summary.medianFinalBankroll.toFixed(0)} accent="#a78bfa" />
          <Stat label={t.meanFinal} value={summary.meanFinalBankroll.toFixed(1)} accent="#a78bfa" />
          <Stat label={t.tableMaxHitRate} value={`${tableHitRate}%`} accent="var(--rl-gold)" />
        </div>
        <p className={styles.note}>{t.meanFinalNote(config.initialBankroll)}</p>
      </div>

      <div>
        <h4 className={styles.subTitle}>{t.finalDist}</h4>
        <Histogram values={summary.finalBankrolls} color="#a78bfa" xLabel={t.medianFinal} />
      </div>

      <div>
        <h4 className={styles.subTitle}>{t.sampleRun}</h4>
        <div style={{ marginBottom: '0.4rem', color: 'var(--games-route-muted)', fontSize: '0.85rem' }}>
          <span style={{ color: sample.outcome === 'bust' ? 'var(--rl-lose)' : 'var(--rl-win)', fontWeight: 700 }}>
            {sampleOutcomeLabel[sample.outcome]}
          </span>{' '}
          / {t.sampleMeta(sample.spins, sample.finalBankroll, sample.maxBetReached)}
          {sample.hitTableMax && <span style={{ color: 'var(--rl-gold)' }}>{t.hitCapSuffix}</span>}
        </div>
        <BankrollChart
          trajectory={sample.trajectory}
          initialBankroll={config.initialBankroll}
          yLabel={t.balance}
          xLabel={t.spinsAxis}
        />
      </div>
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <div className={styles.stat} style={{ borderColor: `color-mix(in srgb, ${accent} 44%, var(--games-route-border))` }}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color: accent }}>{value}</div>
  </div>
);

interface NumFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}
const NumField = ({ label, value, min, max, onChange }: NumFieldProps) => (
  <label className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      className={styles.input}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow empty (interpret as 0) so users can clear and re-type.
        // Out-of-range values are accepted here and clamped at run time.
        if (raw === '') return onChange(0);
        const v = Number(raw);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </label>
);
