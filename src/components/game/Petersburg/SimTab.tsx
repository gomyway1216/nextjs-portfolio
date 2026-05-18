'use client';

import { useEffect, useRef, useState } from 'react';
import { ConvergenceChart, PayoffHistogram } from './charts';
import { SweepSummary, runPetersburgSweepAsync } from './engine';

const LIMITS = { maxN: { min: 1000, max: 1_000_000 } };
const DEFAULTS = { maxN: 100_000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const [maxN, setMaxN] = useState(DEFAULTS.maxN);
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
    const safeN = clamp(maxN, LIMITS.maxN.min, LIMITS.maxN.max);
    setProgress({ done: 0, total: safeN });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runPetersburgSweepAsync(safeN, {
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', opacity: running ? 0.6 : 1 }}>
          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>最大試行数</span>
          <input
            type="number"
            value={maxN}
            min={LIMITS.maxN.min}
            max={LIMITS.maxN.max}
            disabled={running}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return setMaxN(0);
              const v = Number(raw);
              if (Number.isFinite(v)) setMaxN(v);
            }}
            style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem', width: 140 }}
          />
        </label>
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
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
          実測 平均は N にゆっくり比例して伸びる — 「無限期待値」の正体を可視化。
        </span>
      </div>

      {result ? <Results summary={result} /> : <Intro />}
    </div>
  );
};

const Intro = () => (
  <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
    <strong style={{ color: '#fbbf24' }}>このタブ:</strong> N ゲームをプレイし、N を増やすごとに実測の (1) 平均 (2) 中央値 (3) 最大配当 (4) 「公正な価格」 log₂(N)/2 をプロット。
    <strong> 平均は無限大に発散しないが、対数的に増える</strong>のがわかります — 巨大な配当が稀に出るたびに平均が跳ね上がる。
  </div>
);

const Results = ({ summary }: { summary: SweepSummary }) => {
  const last = summary.points[summary.points.length - 1];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>収束の振る舞い ({summary.total.toLocaleString()} ゲーム)</h3>
        <ConvergenceChart points={summary.points} />
        <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
          実測平均 (水色) ≈ 公正価格 log₂(N)/2 (黄破線)。中央値 (緑) は常に $1-2 付近で停滞。最大 (ピンク) は指数的に増える — これが「無限期待値」の数学的源泉。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>最終地点での実測値</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          <Stat label="N" value={last.N.toLocaleString()} color="#67e8f9" />
          <Stat label="平均配当" value={`$${last.mean.toFixed(2)}`} color="#67e8f9" />
          <Stat label="log₂(N)/2 (理論)" value={`$${last.fairPrice.toFixed(2)}`} color="#fbbf24" />
          <Stat label="中央値" value={`$${last.median.toFixed(2)}`} color="#4ade80" />
          <Stat label="最大配当" value={`$${last.max.toLocaleString()}`} color="#f472b6" />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>配当の分布 (log₂ バケット)</h4>
        <PayoffHistogram log2Hist={summary.log2Hist} total={summary.total} />
        <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
          各バケットは前の半分の頻度 — 完璧な幾何分布。黄色のマーカー = 理論度数 N · (1/2)^(k+1)。
          高額バケットほどサンプル数は少ないが、その 1 回が平均を大きく動かす。
        </p>
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.15rem', fontWeight: 800 }}>{value}</div>
  </div>
);
