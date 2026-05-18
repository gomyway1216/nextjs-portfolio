'use client';

import { useEffect, useRef, useState } from 'react';
import { MultiTrajectoryChart } from './charts';
import { ConvergenceSummary, runConvergenceSimAsync } from './engine';

const LIMITS = {
  trueP: { min: 0.01, max: 0.99 },
  steps: { min: 50, max: 5000 },
  trials: { min: 10, max: 500 },
};
const DEFAULTS = { trueP: 0.7, steps: 500, trials: 100 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const [trueP, setTrueP] = useState(DEFAULTS.trueP);
  const [steps, setSteps] = useState(DEFAULTS.steps);
  const [trials, setTrials] = useState(DEFAULTS.trials);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ConvergenceSummary | null>(null);

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
    const safeP = clamp(trueP, LIMITS.trueP.min, LIMITS.trueP.max);
    const safeSteps = clamp(steps, LIMITS.steps.min, LIMITS.steps.max);
    const safeTrials = clamp(trials, LIMITS.trials.min, LIMITS.trials.max);
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

  const runLabel = running && progress
    ? `Running… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : 'シミュレーション実行';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <NumField label="真の確率 p" value={trueP} {...LIMITS.trueP} step={0.01} float onChange={setTrueP} disabled={running} />
        <NumField label="ステップ数" value={steps} {...LIMITS.steps} onChange={setSteps} disabled={running} />
        <NumField label="試行回数" value={trials} {...LIMITS.trials} onChange={setTrials} disabled={running} />
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
    <strong style={{ color: '#fbbf24' }}>このタブ:</strong> 独立な試行を多数回実行し、各試行で観測ベースの事後平均がどう推移するかを重ねて表示。
    <strong> 全試行とも真の p に収束する</strong>のが見えます — ばらつきは O(1/√N) で縮む。
  </div>
);

const Results = ({ summary }: { summary: ConvergenceSummary }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    <div>
      <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>事後平均の推移 ({summary.trials} 試行, true p = {summary.trueP.toFixed(2)})</h3>
      <MultiTrajectoryChart trajectories={summary.trajectories} trueP={summary.trueP} />
      <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
        水色 = 各試行の事後平均推移。最初はバラつくが、観測が増えると皆 <strong style={{ color: '#fbbf24' }}>真値 {summary.trueP.toFixed(2)}</strong> に収束。
      </p>
    </div>

    <div>
      <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>最終 ({summary.steps} flips 後) の事後平均</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
        <Stat label="真値 p" value={summary.trueP.toFixed(3)} color="#fbbf24" />
        <Stat label="平均 of 試行平均" value={summary.finalMeanOfMeans.toFixed(4)} color="#67e8f9" />
        <Stat label="試行間 std" value={summary.finalStd.toFixed(4)} color="#a78bfa" />
        <Stat label="理論 std ≈ √(p(1-p)/N)" value={Math.sqrt((summary.trueP * (1 - summary.trueP)) / summary.steps).toFixed(4)} color="#a78bfa" />
      </div>
      <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
        試行間 std が理論値 √(p(1-p)/N) と一致するなら、Bayesian 推定は最尤推定 (= 単純平均) と漸近的に同じ収束率を持つことを実感できる。
      </p>
    </div>
  </div>
);

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.15rem', fontWeight: 800 }}>{value}</div>
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
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', opacity: disabled ? 0.6 : 1 }}>
    <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</span>
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
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);
