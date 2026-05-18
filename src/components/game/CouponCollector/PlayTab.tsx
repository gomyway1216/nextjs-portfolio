'use client';

import { useMemo, useState } from 'react';
import { UniqueCurveChart } from './charts';
import { RunResult, expectedDraws, runCollection } from './engine';

const DEFAULT_N = 20;
const MIN_N = 3;
const MAX_N = 100;

const emptyRun = (n: number): RunResult => ({ draws: 0, counts: new Array(n).fill(0), uniqueCurve: [] });

export const PlayTab = () => {
  const [n, setN] = useState(DEFAULT_N);
  const [run, setRun] = useState<RunResult>(() => emptyRun(DEFAULT_N));

  const drawOne = () => {
    setRun((prev) => {
      const counts = prev.counts.slice();
      const idx = Math.floor(Math.random() * counts.length);
      const wasNew = counts[idx] === 0;
      counts[idx]++;
      const lastUnique = prev.uniqueCurve[prev.uniqueCurve.length - 1] ?? 0;
      const unique = wasNew ? lastUnique + 1 : lastUnique;
      return {
        draws: prev.draws + 1,
        counts,
        uniqueCurve: [...prev.uniqueCurve, unique],
      };
    });
  };

  /** Finish the current collection in one synchronous batch (continues from current counts). */
  const completeNow = () => {
    setRun((prev) => {
      const counts = prev.counts.slice();
      const curve = prev.uniqueCurve.slice();
      let unique = curve[curve.length - 1] ?? 0;
      let draws = prev.draws;
      // Safety cap: extremely unlikely to need more than 100 * n * H_n extra draws.
      const cap = draws + Math.ceil(n * Math.log(Math.max(2, n)) * 100) + 1000;
      while (unique < n && draws < cap) {
        const idx = Math.floor(Math.random() * counts.length);
        if (counts[idx] === 0) unique++;
        counts[idx]++;
        draws++;
        curve.push(unique);
      }
      return { draws, counts, uniqueCurve: curve };
    });
  };

  const onNChange = (next: number) => {
    setN(next);
    setRun(emptyRun(next));
  };

  const uniqueCount = useMemo(
    () => run.counts.reduce((acc, c) => acc + (c > 0 ? 1 : 0), 0),
    [run.counts],
  );
  const complete = uniqueCount === n;
  const expected = expectedDraws(n);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>コレクションのサイズ (n)</span>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>n = {n}</span>
          </div>
          <input
            type="range"
            min={MIN_N}
            max={MAX_N}
            value={n}
            onChange={(e) => onNChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
            <span>{MIN_N}</span><span>{MAX_N}</span>
          </div>
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <button onClick={drawOne} disabled={complete} style={btn('#22c55e', complete)}>🎲 1回引く</button>
          <button onClick={completeNow} disabled={complete} style={btn('#0ea5e9', complete)}>完成まで一気に</button>
          <button onClick={() => onNChange(n)} style={btn('#1e293b', false, '#94a3b8', '#334155')}>リセット</button>
        </div>

        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: '0.4rem', display: 'grid', gridTemplateColumns: `repeat(${Math.min(n, 10)}, 1fr)`, gap: '0.25rem' }}>
          {run.counts.map((c, i) => (
            <div
              key={i}
              title={`#${i + 1}: ${c} 回`}
              style={{
                background: c === 0 ? '#1e293b' : '#0f172a',
                color: c === 0 ? '#475569' : '#fbbf24',
                border: `1px solid ${c === 0 ? '#334155' : '#fbbf24aa'}`,
                borderRadius: 4,
                padding: '0.25rem 0',
                textAlign: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                minHeight: 32,
              }}
            >
              {i + 1}
              <div style={{ fontSize: '0.6rem', color: c === 0 ? '#475569' : '#94a3b8' }}>{c}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>状況</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="集めた / n" value={`${uniqueCount} / ${n}`} color={complete ? '#4ade80' : '#67e8f9'} />
          <Stat label="総 draws" value={`${run.draws}`} color="#67e8f9" />
          <Stat label="理論期待値 E[T]" value={expected.toFixed(1)} color="#fbbf24" />
          <Stat label="あなた vs 期待値" value={run.draws === 0 ? '—' : `${(run.draws / expected).toFixed(2)}×`} color="#a78bfa" />
        </div>

        {complete && (
          <div style={{ marginTop: '0.8rem', padding: '0.6rem 0.8rem', borderRadius: 10, background: '#15803d44', border: '1px solid #4ade80', color: '#4ade80', fontWeight: 700 }}>
            🎉 全 {n} 種コンプ！ {run.draws} draws ({(run.draws / expected).toFixed(2)}× 期待値)
          </div>
        )}

        <div style={{ marginTop: '0.8rem' }}>
          <h4 style={{ margin: '0 0 0.3rem', color: '#cbd5e1', fontSize: '0.95rem' }}>収集カーブ (diminishing returns)</h4>
          <UniqueCurveChart curve={run.uniqueCurve} n={n} />
          <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
            序盤は急上昇するが、ラスト 1-2 種を引くのに大量の draws がかかる「コンプガチャ問題」がカーブの平坦化で見える。
          </p>
        </div>
      </div>
    </div>
  );
};

const btn = (bg: string, disabled = false, color = '#fff', border?: string): React.CSSProperties => ({
  background: disabled ? '#1e293b' : bg,
  color: disabled ? '#475569' : color,
  border: border ? `1px solid ${border}` : 'none',
  borderRadius: 10,
  padding: '0.55rem 1.1rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}55`, borderRadius: 10, padding: '0.6rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.3rem', fontWeight: 800 }}>{value}</div>
  </div>
);
