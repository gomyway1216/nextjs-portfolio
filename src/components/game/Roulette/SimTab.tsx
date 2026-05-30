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
    ? `Running… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : 'シミュレーション実行';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <NumField label="初期資金" value={config.initialBankroll} {...LIMITS.initialBankroll} onChange={(v) => updateConfig('initialBankroll', v)} />
        <NumField label="初期賭金" value={config.baseBet} {...LIMITS.baseBet} onChange={(v) => updateConfig('baseBet', v)} />
        <NumField label="テーブル上限" value={config.tableMax} {...LIMITS.tableMax} onChange={(v) => updateConfig('tableMax', v)} />
        <NumField label="1ランの最大スピン" value={config.maxSpins} {...LIMITS.maxSpins} onChange={(v) => updateConfig('maxSpins', v)} />
        <NumField label="モンテカルロ試行数" value={trials} {...LIMITS.trials} onChange={setTrials} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <button
          onClick={() => setConfig(defaults)}
          disabled={running}
          style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '0.55rem 1rem', cursor: 'pointer' }}
        >
          デフォルトに戻す
        </button>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
          試行数が多いと数秒かかります（最大 {LIMITS.trials.max.toLocaleString()}）
        </span>
      </div>

      {result && <Results state={result} />}

      {!result && (
        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <strong style={{ color: '#fbbf24' }}>マーチンゲール法とは:</strong> 負けたら次の賭金を2倍にする戦略。理論上、勝てば必ず最初の賭金1単位ぶん取り戻せる。<br />
          ただし現実には <strong>(1) テーブル上限</strong> と <strong>(2) 資金の有限性</strong> によって連敗が続くと破産します。<br />
          上のフォームで設定し「シミュレーション実行」を押すと、ヨーロピアンルーレット（緑0あり・期待値 -2.70%）で何回試したら破産するかを統計的に検証できます。
        </div>
      )}
    </div>
  );
};

const Results = ({ state }: { state: SimState }) => {
  const { sample, summary, trials, config } = state;
  const bustRate = (summary.bustRate * 100).toFixed(1);
  const tableHitRate = ((summary.tableMaxHitCount / trials) * 100).toFixed(1);
  const sampleOutcomeLabel: Record<RunResult['outcome'], string> = {
    bust: '💥 破産',
    capped: `🛑 最大スピン (${config.maxSpins}) 到達`,
    survived: '✅ 生存',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>モンテカルロ結果 ({trials} 試行)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          <Stat label="破産率" value={`${bustRate}%`} accent="#f87171" />
          <Stat label="破産までの中央値スピン" value={summary.medianSpinsToBust === null ? '—' : `${summary.medianSpinsToBust}`} accent="#67e8f9" />
          <Stat label="最終資金 中央値" value={summary.medianFinalBankroll.toFixed(0)} accent="#a78bfa" />
          <Stat label="最終資金 平均" value={summary.meanFinalBankroll.toFixed(1)} accent="#a78bfa" />
          <Stat label="テーブル上限到達率" value={`${tableHitRate}%`} accent="#fbbf24" />
        </div>
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.8rem' }}>
          ※「最終資金 平均」は理論的には負け（期待値 -2.70% × 賭けた総額）。初期資金 {config.initialBankroll} を下回るほど損していることに注意。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>最終資金の分布</h4>
        <Histogram values={summary.finalBankrolls} color="#a78bfa" xLabel="最終資金" />
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>サンプル1ラン: 資金推移</h4>
        <div style={{ marginBottom: '0.4rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          結果: <span style={{ color: sample.outcome === 'bust' ? '#f87171' : '#4ade80', fontWeight: 700 }}>{sampleOutcomeLabel[sample.outcome]}</span>
          {' '}/ スピン数 {sample.spins} / 最終 {sample.finalBankroll} / 最大賭金 {sample.maxBetReached}
          {sample.hitTableMax && <span style={{ color: '#fbbf24' }}> / 上限到達あり</span>}
        </div>
        <BankrollChart trajectory={sample.trajectory} initialBankroll={config.initialBankroll} />
      </div>
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${accent}44`, borderRadius: 10, padding: '0.6rem 0.8rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</div>
    <div style={{ color: accent, fontSize: '1.3rem', fontWeight: 800 }}>{value}</div>
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
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow empty (interpret as 0) so users can clear and re-type.
        // Out-of-range values are accepted here and clamped at run time.
        if (raw === '') return onChange(0);
        const v = Number(raw);
        if (Number.isFinite(v)) onChange(v);
      }}
      style={{
        background: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '0.5rem 0.6rem',
        fontSize: '0.95rem',
      }}
    />
  </label>
);
