'use client';

import { useEffect, useRef, useState } from 'react';
import { OutcomeBars, TrajectoryChart } from './charts';
import { RuinConfig, SimSummary, runRuin, runRuinMonteCarloAsync, theoreticalRuinProb } from './engine';

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

export const SimTab = () => {
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
      // Generate a handful of sample trajectories to display.
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

  const runLabel = running && progress
    ? `Running… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : 'シミュレーション実行';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <NumField label="開始 a" value={config.start} {...LIMITS.start} onChange={(v) => updateConfig('start', v)} disabled={running} />
        <NumField label="目標 N" value={config.target} {...LIMITS.target} onChange={(v) => updateConfig('target', v)} disabled={running} />
        <FloatField label="勝率 p" value={config.winProb} {...LIMITS.winProb} step={0.01} onChange={(v) => updateConfig('winProb', v)} disabled={running} />
        <NumField label="最大ステップ" value={maxSteps} {...LIMITS.maxSteps} onChange={setMaxSteps} disabled={running} />
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
        <button
          onClick={() => { setConfig(DEFAULTS.config); setMaxSteps(DEFAULTS.maxSteps); setTrials(DEFAULTS.trials); }}
          disabled={running}
          style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '0.55rem 1rem', cursor: 'pointer' }}
        >
          デフォルトに戻す
        </button>
      </div>

      {result ? <Results summary={result} samplePaths={samplePaths} /> : <Intro config={config} />}
    </div>
  );
};

const Intro = ({ config }: { config: RuinConfig }) => {
  const t = theoreticalRuinProb(config);
  return (
    <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
      <strong style={{ color: '#fbbf24' }}>ガンブラーズ・ルイン:</strong> $a で始めて $N に達するか $0 で破産するまで賭ける。<br />
      公平 (p=0.5) なら破産確率は <code style={{ color: '#67e8f9' }}>(N − a) / N</code>。
      不公平になると指数関数的に破産しやすくなる。<br />
      現在の設定 (a={config.start}, N={config.target}, p={config.winProb}) の理論破産確率: <strong style={{ color: '#f87171' }}>{(t * 100).toFixed(2)}%</strong>。
      これをモンテカルロで確かめる。
    </div>
  );
};

const Results = ({ summary, samplePaths }: { summary: SimSummary; samplePaths: number[][] }) => {
  const emp = {
    ruin: summary.ruinedCount / summary.trials,
    reach: summary.reachedCount / summary.trials,
    capped: summary.cappedCount / summary.trials,
  };
  const diff = summary.empiricalRuinProb - summary.theoreticalRuinProb;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>結果 ({summary.trials.toLocaleString()} 試行 · a={summary.config.start}, N={summary.config.target}, p={summary.config.winProb})</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
          <Stat label="実測 破産率" value={`${(summary.empiricalRuinProb * 100).toFixed(2)}%`} color="#f87171" />
          <Stat label="理論 破産率" value={`${(summary.theoreticalRuinProb * 100).toFixed(2)}%`} color="#fbbf24" />
          <Stat label="差" value={`${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(2)}pt`} color="#a78bfa" />
          <Stat label="平均ステップ" value={summary.meanSteps.toFixed(1)} color="#67e8f9" />
          <Stat label="中央値ステップ" value={summary.medianSteps.toFixed(0)} color="#67e8f9" />
          <Stat label="未決着 (上限到達)" value={`${summary.cappedCount}`} color="#94a3b8" />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>結果の内訳</h4>
        <OutcomeBars empirical={emp} theoretical={summary.theoreticalRuinProb} />
        <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
          黄色の縦線 = 理論破産確率 ({(summary.theoreticalRuinProb * 100).toFixed(2)}%) の境界。実測の赤領域とぴったり重なる。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>サンプル経路 ({samplePaths.length} 本)</h4>
        <TrajectoryChart trajectories={samplePaths} start={summary.config.start} target={summary.config.target} />
        <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
          緑 = 目標達成、赤 = 破産、灰 = ステップ上限。破産経路が圧倒的に多ければ p≦0.5 の宿命。
        </p>
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.6rem 0.8rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
  </div>
);

const NumField = ({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', opacity: disabled ? 0.6 : 1 }}>
    <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);
const FloatField = ({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean }) => (
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
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
    />
  </label>
);
