'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getBanditStrings } from './i18n';
import { MultiLineChart } from './charts';
import { BanditConfig, StrategyName, StrategySummary, runStrategyMonteCarloAsync } from './engine';

const STRATEGY_META: { name: StrategyName; color: string }[] = [
  { name: 'optimal', color: '#fbbf24' },
  { name: 'thompson', color: '#4ade80' },
  { name: 'ucb1', color: '#67e8f9' },
  { name: 'eps-greedy', color: '#a78bfa' },
  { name: 'greedy', color: '#f472b6' },
  { name: 'random', color: '#94a3b8' },
];

const LIMITS = {
  T: { min: 50, max: 5000 },
  trials: { min: 20, max: 2000 },
};
const DEFAULTS = {
  trueProbs: [0.5, 0.55, 0.6],
  T: 1000,
  trials: 200,
  epsilon: 0.1,
};

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getBanditStrings(language);

  const [probsText, setProbsText] = useState(DEFAULTS.trueProbs.join(', '));
  const [T, setT] = useState(DEFAULTS.T);
  const [trials, setTrials] = useState(DEFAULTS.trials);
  const [epsilon, setEpsilon] = useState(DEFAULTS.epsilon);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; strategyIdx: number } | null>(null);
  const [results, setResults] = useState<StrategySummary[]>([]);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const labelFor = (name: StrategyName) => {
    if (name === 'eps-greedy') return `${t.strategyLabels[name]} (ε=${clamp(epsilon, 0, 1)})`;
    return t.strategyLabels[name] ?? name;
  };
  const colorFor = (name: StrategyName) => STRATEGY_META.find((s) => s.name === name)?.color ?? '#94a3b8';

  const parsedProbs = (): number[] => {
    const xs = probsText
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1);
    return xs.length >= 2 ? xs : DEFAULTS.trueProbs;
  };

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setResults([]);
    const trueProbs = parsedProbs();
    const safeT = clamp(T, LIMITS.T.min, LIMITS.T.max);
    const safeTrials = clamp(trials, LIMITS.trials.min, LIMITS.trials.max);
    const config: BanditConfig = { trueProbs, epsilon: clamp(epsilon, 0, 1) };
    const controller = new AbortController();
    abortRef.current = controller;
    const summaries: StrategySummary[] = [];
    try {
      for (let i = 0; i < STRATEGY_META.length; i++) {
        setProgress({ done: 0, total: safeTrials, strategyIdx: i });
        const summary = await runStrategyMonteCarloAsync(STRATEGY_META[i].name, config, safeT, safeTrials, {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (mountedRef.current) setProgress({ done, total, strategyIdx: i });
          },
        });
        if (!mountedRef.current || controller.signal.aborted || !summary) return;
        summaries.push(summary);
        if (mountedRef.current) setResults([...summaries]);
      }
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
      runningRef.current = false;
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const runLabel = running && progress
    ? t.running(labelFor(STRATEGY_META[progress.strategyIdx].name), progress.done.toLocaleString(), progress.total.toLocaleString())
    : t.runComparison;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', opacity: running ? 0.6 : 1 }}>
          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{t.trueProbsInput}</span>
          <input
            type="text"
            aria-label={t.trueProbsInput}
            value={probsText}
            disabled={running}
            onChange={(e) => setProbsText(e.target.value)}
            style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
          />
        </label>
        <NumField label={t.steps} value={T} {...LIMITS.T} onChange={setT} disabled={running} />
        <NumField label={t.trialsPerStrategy} value={trials} {...LIMITS.trials} onChange={setTrials} disabled={running} />
        <NumField label={t.epsilon} value={epsilon} min={0} max={1} step={0.01} float onChange={setEpsilon} disabled={running} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          onClick={run}
          disabled={running}
          style={{
            background: running ? '#1e293b' : '#22c55e',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '0.65rem 1.4rem',
            fontWeight: 800,
            cursor: running ? 'wait' : 'pointer',
            fontSize: '1rem',
            minWidth: 280,
          }}
        >
          {runLabel}
        </button>
        {running && (
          <button onClick={stop} style={{ background: '#7f1d1d', color: '#fecaca', border: '1px solid #b91c1c', borderRadius: 10, padding: '0.65rem 1.1rem', fontWeight: 700, cursor: 'pointer' }}>
            {t.stop}
          </button>
        )}
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{t.simCaption}</span>
      </div>

      {results.length > 0
        ? <Results results={results} t={t} labelFor={labelFor} colorFor={colorFor} />
        : <Intro t={t} />}
    </div>
  );
};

const Intro = ({ t }: { t: ReturnType<typeof getBanditStrings> }) => (
  <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
    <strong style={{ color: '#fbbf24' }}>{t.introTitle}</strong>{' '}
    {t.simCaption}
    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
      {t.introList.map((it) => (
        <li key={it.name}><strong style={{ color: it.color }}>{it.name}</strong>: {it.desc}</li>
      ))}
    </ul>
    {t.introFooter}
  </div>
);

interface ResultsProps {
  results: StrategySummary[];
  t: ReturnType<typeof getBanditStrings>;
  labelFor: (name: StrategyName) => string;
  colorFor: (name: StrategyName) => string;
}

const Results = ({ results, t, labelFor, colorFor }: ResultsProps) => {
  const rewardSeries = results.map((r) => ({ label: labelFor(r.strategy), color: colorFor(r.strategy), values: r.avgCumReward }));
  const regretSeries = results.filter((r) => r.strategy !== 'optimal').map((r) => ({ label: labelFor(r.strategy), color: colorFor(r.strategy), values: r.avgCumRegret }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>{t.cumRewardChart(results[0].T, results[0].trials.toLocaleString())}</h3>
        <MultiLineChart series={rewardSeries} yLabel={t.cumReward} />
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>{t.cumRegretChart}</h3>
        <MultiLineChart series={regretSeries} yLabel={t.cumRegret} />
        <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>{t.regretNote}</p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>{t.finalScores}</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '0.3rem 0.5rem' }}>{t.colStrategy}</th>
                <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t.colReward}</th>
                <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t.colRegret}</th>
                <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{t.colVsOptimal}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const optReward = results.find((x) => x.strategy === 'optimal')?.meanFinalReward ?? r.meanFinalReward;
                return (
                  <tr key={r.strategy} style={{ borderTop: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.45rem 0.5rem', color: colorFor(r.strategy), fontWeight: 700 }}>{labelFor(r.strategy)}</td>
                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{r.meanFinalReward.toFixed(1)}</td>
                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: r.meanFinalRegret > 10 ? '#f87171' : '#4ade80' }}>
                      {r.meanFinalRegret.toFixed(1)}
                    </td>
                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>
                      {((r.meanFinalReward / Math.max(1e-9, optReward)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

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
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', opacity: disabled ? 0.6 : 1 }}>
    <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</span>
    <input
      type="number"
      aria-label={label}
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
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);
