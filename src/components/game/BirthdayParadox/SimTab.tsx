'use client';

import { useEffect, useRef, useState } from 'react';
import { CurveChart } from './charts';
import { SweepSummary, runBirthdaySweepAsync } from './engine';

const LIMITS = {
  maxN: { min: 10, max: 200 },
  trialsPerN: { min: 100, max: 10_000 },
};
const DEFAULTS = { maxN: 100, trialsPerN: 1000 };

const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

export const SimTab = () => {
  const [maxN, setMaxN] = useState(DEFAULTS.maxN);
  const [trialsPerN, setTrialsPerN] = useState(DEFAULTS.trialsPerN);
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
    const safeMaxN = clamp(maxN, LIMITS.maxN.min, LIMITS.maxN.max);
    const safeTrials = clamp(trialsPerN, LIMITS.trialsPerN.min, LIMITS.trialsPerN.max);
    setProgress({ done: 0, total: safeMaxN });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const summary = await runBirthdaySweepAsync(safeMaxN, safeTrials, {
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
    ? `Running… n=${progress.done} / ${progress.total}`
    : 'シミュレーション実行';

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <NumField label="最大グループ人数 n" value={maxN} {...LIMITS.maxN} onChange={setMaxN} />
        <NumField label="n ごとの試行回数" value={trialsPerN} {...LIMITS.trialsPerN} onChange={setTrialsPerN} />
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
    <strong style={{ color: '#fbbf24' }}>このタブ:</strong> 各人数 <code>n</code> について「2人以上が誕生日を共有する」確率を試行して、
    <strong> シミュレーション (水色) と理論値 (黄) の重なり具合</strong>を見ます。
    <br />
    <strong>n=23 で約 50%、n=50 で約 97%、n=70 で 99.9% 以上</strong> という急上昇カーブが特徴。
    23 人の方が「365 日の年だから 12 月までに誰かは被るかも」という直感より遥かに早く 50% に到達することが分かります。
  </div>
);

const Results = ({ summary }: { summary: SweepSummary }) => {
  const annotations = [
    summary.fiftyPercentN !== null ? { n: summary.fiftyPercentN, label: '50%', color: '#fbbf24' } : null,
    summary.ninetyNinePercentN !== null ? { n: summary.ninetyNinePercentN, label: '99%', color: '#f472b6' } : null,
  ].filter((a): a is { n: number; label: string; color: string } => a !== null);

  // Sample anchor stats
  const at = (n: number) => summary.points.find((p) => p.n === n) ?? null;
  const p23 = at(23);
  const p50 = at(50);
  const p70 = at(70);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>P(誕生日が被る) vs グループ人数 ({summary.trialsPerN.toLocaleString()} 試行/n)</h3>
        <CurveChart points={summary.points} annotations={annotations} />
        <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
          縦線: 理論上初めて <strong style={{ color: '#fbbf24' }}>50% を超える n = {summary.fiftyPercentN ?? '—'}</strong>、
          {' '}<strong style={{ color: '#f472b6' }}>99% を超える n = {summary.ninetyNinePercentN ?? '—'}</strong>
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>主要な n のスナップショット</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          {p23 && <Snapshot n={23} p={p23} accent="#fbbf24" />}
          {p50 && <Snapshot n={50} p={p50} accent="#67e8f9" />}
          {p70 && <Snapshot n={70} p={p70} accent="#f472b6" />}
        </div>
      </div>
    </div>
  );
};

const Snapshot = ({ n, p, accent }: { n: number; p: { empirical: number; theoretical: number }; accent: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${accent}44`, borderRadius: 10, padding: '0.6rem 0.8rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>n = {n}</div>
    <div style={{ color: accent, fontSize: '1.3rem', fontWeight: 800 }}>{(p.theoretical * 100).toFixed(1)}%</div>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>シム実測: {(p.empirical * 100).toFixed(1)}%</div>
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
