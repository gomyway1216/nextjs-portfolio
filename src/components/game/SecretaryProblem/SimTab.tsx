'use client';

import { useEffect, useRef, useState } from 'react';
import { SuccessCurveChart } from './charts';
import { SweepSummary, runSecretarySweepAsync } from './engine';

const LIMITS = {
  n: { min: 5, max: 200 },
  trialsPerR: { min: 100, max: 20_000 },
};
const DEFAULTS = { n: 50, trialsPerR: 1000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const [n, setN] = useState(DEFAULTS.n);
  const [trialsPerR, setTrialsPerR] = useState(DEFAULTS.trialsPerR);
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
    const safeN = clamp(n, LIMITS.n.min, LIMITS.n.max);
    const safeT = clamp(trialsPerR, LIMITS.trialsPerR.min, LIMITS.trialsPerR.max);
    setProgress({ done: 0, total: safeN });
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

  const runLabel = running && progress
    ? `Running… r=${progress.done} / ${progress.total}`
    : 'シミュレーション実行';

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <NumField label="候補者数 n" value={n} {...LIMITS.n} onChange={setN} disabled={running} />
        <NumField label="r ごとの試行回数" value={trialsPerR} {...LIMITS.trialsPerR} onChange={setTrialsPerR} disabled={running} />
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
    <strong style={{ color: '#fbbf24' }}>このタブ:</strong> 各 r (スキップする人数) について「最初の r 人は無条件で見送り、その後に観測期の最高を超えた最初の人を採用」戦略を試行し、
    <strong> 最高スコア人を引き当てる確率</strong>を r の関数として描きます。<br />
    特徴的な単峰カーブの<strong>頂点が r = n/e (≈ 37%)</strong> に出てくるのが見どころです。理論線 (黄) とシミュレーション (水色) がぴったり重なります。
  </div>
);

const Results = ({ summary }: { summary: SweepSummary }) => {
  const bestRatio = summary.bestR / summary.n;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>成功率 vs スキップ数 (n = {summary.n}, {summary.trialsPerR.toLocaleString()} 試行/r)</h3>
        <SuccessCurveChart
          points={summary.points}
          empiricalBestR={summary.bestR}
          theoreticalBestR={summary.theoreticalBestR}
        />
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
          実測ベスト: <strong style={{ color: '#67e8f9' }}>r = {summary.bestR}</strong> (n の {(bestRatio * 100).toFixed(1)}%) / 成功率 {(summary.bestRate * 100).toFixed(2)}%。
          {' '}理論ベスト: <strong style={{ color: '#fbbf24' }}>r = {summary.theoreticalBestR}</strong> (n/e) / 成功率 {(summary.theoreticalBestRate * 100).toFixed(2)}%。
          {' '}n → ∞ で <strong>1/e ≈ 36.79%</strong> に収束。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>主要な r 比率のスナップショット</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
          {[0, 0.1, 0.2, Math.round(summary.n / Math.E) / summary.n, 0.5, 0.7].map((ratio) => {
            const r = Math.round(ratio * summary.n);
            const p = summary.points[r];
            if (!p) return null;
            const isOptimum = r === summary.theoreticalBestR;
            return (
              <div key={r} style={{ background: '#020617', border: `1px solid ${isOptimum ? '#fbbf24' : '#33415544'}`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>r = {r} ({(p.ratio * 100).toFixed(0)}%){isOptimum && ' ⭐'}</div>
                <div style={{ color: isOptimum ? '#fbbf24' : '#67e8f9', fontSize: '1.2rem', fontWeight: 800 }}>{(p.successRate * 100).toFixed(1)}%</div>
                <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>理論 {(p.theoretical * 100).toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
          r=0 (最初を採用) は 1/n。r=n-1 (最後を強制) も 1/n。中間に山ができるのが秘書問題の本質。
        </p>
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
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: disabled ? 0.6 : 1 }}>
    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</span>
    <input
      type="number"
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
