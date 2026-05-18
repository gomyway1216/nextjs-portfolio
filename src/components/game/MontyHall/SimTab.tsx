'use client';

import { useEffect, useRef, useState } from 'react';
import { BarCompare, ConvergenceChart } from './charts';
import { SimSummary, runMontyCarloAsync } from './engine';

const TRIAL_LIMITS = { min: 100, max: 1_000_000 };
const DEFAULT_TRIALS = 10_000;

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const [trials, setTrials] = useState<number>(DEFAULT_TRIALS);
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
    const safeTrials = clamp(trials, TRIAL_LIMITS.min, TRIAL_LIMITS.max);
    setProgress({ done: 0, total: safeTrials });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runMontyCarloAsync(safeTrials, {
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>試行回数 (最大 {TRIAL_LIMITS.max.toLocaleString()})</span>
          <input
            type="number"
            value={trials}
            min={TRIAL_LIMITS.min}
            max={TRIAL_LIMITS.max}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return setTrials(0);
              const v = Number(raw);
              if (Number.isFinite(v)) setTrials(v);
            }}
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '0.5rem 0.7rem',
              fontSize: '0.95rem',
              width: 180,
            }}
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
            minWidth: 220,
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
    <strong style={{ color: '#fbbf24' }}>モンティ・ホール問題:</strong> プレイヤーがドアを選んだ後、ホストが残り2つのうちから1つの🐐ドアを開ける。
    残ったドアに <strong>変える (Switch)</strong> か <strong>そのまま (Stay)</strong> か？<br />
    直感では「2択になったから 50/50」と思えますが、実は <strong>Switch が 2/3、Stay が 1/3</strong> です。
    シミュレーションを実行すれば、3つの戦略（Stay / Switch / Random）の勝率がそれぞれ理論値に収束する様子を見られます。
  </div>
);

const Results = ({ summary }: { summary: SimSummary }) => {
  const stayRate = summary.stayWins / summary.trials;
  const switchRate = summary.switchWins / summary.trials;
  const randomRate = summary.randomWins / summary.trials;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>勝率比較 ({summary.trials.toLocaleString()} 試行)</h3>
        <BarCompare
          bars={[
            { label: 'Stay', value: stayRate, color: '#94a3b8', reference: 1 / 3 },
            { label: 'Switch', value: switchRate, color: '#4ade80', reference: 2 / 3 },
            { label: 'Random (50/50)', value: randomRate, color: '#a78bfa', reference: 0.5 },
          ]}
        />
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
          黄色の点線が理論値。試行数が多いほどバーがそこに張り付きます。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>勝率の収束 (running win rate)</h4>
        <ConvergenceChart
          series={[
            { label: 'Stay (理論 33.3%)', color: '#94a3b8', values: summary.stayCurve, reference: 1 / 3 },
            { label: 'Switch (理論 66.7%)', color: '#4ade80', values: summary.switchCurve, reference: 2 / 3 },
            { label: 'Random (理論 50.0%)', color: '#a78bfa', values: summary.randomCurve, reference: 0.5 },
          ]}
          x={summary.curveX}
        />
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
          序盤は揺れるが、試行が増えるにつれて点線（理論値）に収束していくのが見えます。
        </p>
      </div>
    </div>
  );
};
