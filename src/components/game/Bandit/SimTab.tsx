'use client';

import { useEffect, useRef, useState } from 'react';
import { MultiLineChart } from './charts';
import { BanditConfig, StrategyName, StrategySummary, runStrategyMonteCarloAsync } from './engine';

const STRATEGIES: { name: StrategyName; label: string; color: string }[] = [
  { name: 'optimal', label: 'Optimal (cheat)', color: '#fbbf24' },
  { name: 'thompson', label: 'Thompson sampling', color: '#4ade80' },
  { name: 'ucb1', label: 'UCB1', color: '#67e8f9' },
  { name: 'eps-greedy', label: 'ε-greedy (ε=0.1)', color: '#a78bfa' },
  { name: 'greedy', label: 'Greedy', color: '#f472b6' },
  { name: 'random', label: 'Random', color: '#94a3b8' },
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
      for (let i = 0; i < STRATEGIES.length; i++) {
        setProgress({ done: 0, total: safeTrials, strategyIdx: i });
        const summary = await runStrategyMonteCarloAsync(STRATEGIES[i].name, config, safeT, safeTrials, {
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

  const runLabel = running && progress
    ? `Running ${STRATEGIES[progress.strategyIdx].label}: ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
    : '6 戦略を比較実行';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', opacity: running ? 0.6 : 1 }}>
          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>真の p (カンマ区切り、2 以上)</span>
          <input
            type="text"
            value={probsText}
            disabled={running}
            onChange={(e) => setProbsText(e.target.value)}
            style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
          />
        </label>
        <NumField label="ステップ数 T" value={T} {...LIMITS.T} onChange={setT} disabled={running} />
        <NumField label="試行回数 (戦略あたり)" value={trials} {...LIMITS.trials} onChange={setTrials} disabled={running} />
        <NumField label="ε (ε-greedy 用)" value={epsilon} min={0} max={1} step={0.01} float onChange={setEpsilon} disabled={running} />
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
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
          各戦略を独立にシミュレーション。同じ probs で 6 戦略の挙動を比較。
        </span>
      </div>

      {results.length > 0 ? <Results results={results} /> : <Intro />}
    </div>
  );
};

const Intro = () => (
  <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: '1rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>
    <strong style={{ color: '#fbbf24' }}>このタブ:</strong> 同じバンディット (真の p) に対して 6 戦略を独立にプレイ。
    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
      <li><strong style={{ color: '#fbbf24' }}>Optimal</strong>: チート — 常にベストアーム (regret の下限 = 0)</li>
      <li><strong style={{ color: '#4ade80' }}>Thompson sampling</strong>: ベイズ的サンプリング (実用上ベスト戦略)</li>
      <li><strong style={{ color: '#67e8f9' }}>UCB1</strong>: 信頼区間上界で楽観的に選ぶ</li>
      <li><strong style={{ color: '#a78bfa' }}>ε-greedy</strong>: 確率 ε でランダム探索、それ以外は経験ベスト</li>
      <li><strong style={{ color: '#f472b6' }}>Greedy</strong>: 各 1 回引いた後、ずっと経験ベストを選ぶ (運次第で外れる)</li>
      <li><strong style={{ color: '#94a3b8' }}>Random</strong>: 毎回ランダム</li>
    </ul>
    累積 regret (= 最適と比較した差) の伸び方で「賢さ」が一目で分かる。Thompson と UCB1 は対数的に伸びるが、Random は線形に発散する。
  </div>
);

const Results = ({ results }: { results: StrategySummary[] }) => {
  const meta = (name: StrategyName) => {
    const found = STRATEGIES.find((s) => s.name === name);
    return found ?? { name, label: name, color: '#94a3b8' };
  };
  const rewardSeries = results.map((r) => ({ label: meta(r.strategy).label, color: meta(r.strategy).color, values: r.avgCumReward }));
  const regretSeries = results.filter((r) => r.strategy !== 'optimal').map((r) => ({ label: meta(r.strategy).label, color: meta(r.strategy).color, values: r.avgCumRegret }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>累積報酬 (T={results[0].T}, 試行={results[0].trials.toLocaleString()})</h3>
        <MultiLineChart series={rewardSeries} yLabel="平均累計 reward" />
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>累積 regret (= optimal − reward)</h3>
        <MultiLineChart series={regretSeries} yLabel="平均累計 regret (小さいほど良い)" />
        <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
          Thompson と UCB1 は対数的 regret (素晴らしい)。Random は線形に発散。Greedy は運次第で線形に発散することも。
        </p>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.4rem', color: '#cbd5e1' }}>戦略別 最終スコア</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '0.3rem 0.5rem' }}>戦略</th>
              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>平均 reward</th>
              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>平均 regret</th>
              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>vs Optimal</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const m = meta(r.strategy);
              const optReward = results.find((x) => x.strategy === 'optimal')?.meanFinalReward ?? r.meanFinalReward;
              return (
                <tr key={r.strategy} style={{ borderTop: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.45rem 0.5rem', color: m.color, fontWeight: 700 }}>{m.label}</td>
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
