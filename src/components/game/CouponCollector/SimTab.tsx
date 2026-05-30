'use client';

import { useEffect, useRef, useState } from 'react';
import { DistributionChart } from './charts';
import { SimSummary, runCollectorMonteCarloAsync } from './engine';

const LIMITS = {
  n: { min: 3, max: 500 },
  trials: { min: 100, max: 200_000 },
};
const DEFAULTS = { n: 50, trials: 5000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const [n, setN] = useState(DEFAULTS.n);
  const [trials, setTrials] = useState(DEFAULTS.trials);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimSummary | null>(null);

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

  const runLabel = running && progress
    ? `Running… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : 'シミュレーション実行';

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <NumField label="コレクションのサイズ n" value={n} {...LIMITS.n} onChange={setN} />
        <NumField label="試行回数" value={trials} {...LIMITS.trials} onChange={setTrials} />
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
            minWidth: 240,
          }}
        >
          {runLabel}
        </button>
      </div>

      {result ? <Results summary={result} /> : <Intro />}
    </div>
  );
};

const Intro = () => (
  <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
    <strong style={{ color: '#fbbf24' }}>クーポンコレクター問題:</strong> 全 n 種を集めるのに必要な期待 draw 数は
    <code style={{ color: '#67e8f9', margin: '0 0.3em' }}>E[T] = n · H<sub>n</sub></code>
    ≈ n · (ln n + γ)。<br />
    n=50 で約 225 draws、n=100 で約 519 draws — n をちょっと増やすだけで急増します。
    シミュレーションで分布の右側の長い尻尾を見てください。これが「あと1個が出ない」現象の正体です。
  </div>
);

const Results = ({ summary }: { summary: SimSummary }) => {
  const ratio = summary.meanDraws / summary.theoreticalMean;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>結果 (n = {summary.n}, {summary.trials.toLocaleString()} 試行)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          <Stat label="平均 draws" value={summary.meanDraws.toFixed(1)} color="#fbbf24" />
          <Stat label="中央値" value={summary.medianDraws.toFixed(0)} color="#4ade80" />
          <Stat label="最小 / 最大" value={`${summary.minDraws} / ${summary.maxDraws}`} color="#67e8f9" />
          <Stat label="理論平均 E[T]" value={summary.theoreticalMean.toFixed(1)} color="#fbbf24" />
          <Stat label="理論標準偏差 σ" value={summary.theoreticalStd.toFixed(1)} color="#a78bfa" />
          <Stat label="平均 / 理論" value={`${ratio.toFixed(3)}×`} color="#f472b6" />
        </div>
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
          中央値より平均がかなり大きい — 分布が右に長い尻尾を持つ証拠（運悪く最後の1個が出ない人がいる）。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>完成までの draws の分布</h4>
        <DistributionChart values={summary.drawCounts} mean={summary.meanDraws} median={summary.medianDraws} />
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.6rem 0.8rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.3rem', fontWeight: 800 }}>{value}</div>
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
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</span>
    <input
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
      style={{
        background: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '0.5rem 0.7rem',
        fontSize: '0.95rem',
        width: 140,
      }}
    />
  </label>
);
