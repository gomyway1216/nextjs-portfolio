'use client';

import { useMemo, useState } from 'react';
import {
  dayLabel,
  findFirstCollision,
  generateBirthdays,
  theoreticalMatchProb,
} from './engine';
import { createSeededRng } from '../BayesianUpdate/engine';

const DEFAULT_N = 23;
const MAX_N = 100;

interface Stats {
  trials: number;
  matches: number;
}

export const PlayTab = () => {
  const [n, setN] = useState(DEFAULT_N);
  const [birthdays, setBirthdays] = useState<number[]>(() => generateBirthdays(DEFAULT_N, createSeededRng(0x5eed1234)));
  const [stats, setStats] = useState<Record<number, Stats>>({});

  const collision = useMemo(() => findFirstCollision(birthdays), [birthdays]);
  const currentStats = stats[n] ?? { trials: 0, matches: 0 };

  const generate = () => {
    const bd = generateBirthdays(n);
    setBirthdays(bd);
    const matched = findFirstCollision(bd) !== null;
    setStats((s) => {
      const prev = s[n] ?? { trials: 0, matches: 0 };
      return { ...s, [n]: { trials: prev.trials + 1, matches: prev.matches + (matched ? 1 : 0) } };
    });
  };

  const reset = () => setStats({});

  const empirical = currentStats.trials === 0 ? null : currentStats.matches / currentStats.trials;
  const theoretical = theoreticalMatchProb(n);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>グループ人数</span>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>n = {n}</span>
          </div>
          <input
            type="range"
            min={2}
            max={MAX_N}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
            <span>2</span><span>23</span><span>50</span><span>{MAX_N}</span>
          </div>
        </label>

        <button
          onClick={generate}
          style={{
            background: '#22c55e',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '0.6rem 1.3rem',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          🎲 {n}人ぶん生成
        </button>

        <div style={{ marginTop: '0.8rem', padding: '0.6rem 0.8rem', borderRadius: 10, border: `1px solid ${collision ? '#dc2626' : '#334155'}`, background: collision ? '#7f1d1d33' : '#020617' }}>
          <div style={{ color: collision ? '#fca5a5' : '#94a3b8', fontWeight: 700 }}>
            {collision ? `🎯 一致あり: ${dayLabel(collision.day)} (人 #${collision.indices.map((i) => i + 1).join(' & #')})` : '一致なし'}
          </div>
        </div>

        <div style={{ marginTop: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', maxHeight: 280, overflowY: 'auto', padding: '0.4rem', background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
          {birthdays.map((d, i) => {
            const isMatch = collision !== null && collision.day === d;
            return (
              <span
                key={i}
                style={{
                  background: isMatch ? '#dc2626' : '#1e293b',
                  color: '#fff',
                  border: `1px solid ${isMatch ? '#fca5a5' : '#334155'}`,
                  borderRadius: 6,
                  padding: '0.2rem 0.45rem',
                  fontSize: '0.75rem',
                  fontWeight: isMatch ? 800 : 500,
                }}
                title={`Person #${i + 1}`}
              >
                {dayLabel(d)}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>n = {n} の戦績</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <StatCard label="あなたの実測" value={empirical === null ? '—' : `${(empirical * 100).toFixed(1)}%`} sub={`${currentStats.matches} / ${currentStats.trials}`} color="#67e8f9" />
          <StatCard label="理論値" value={`${(theoretical * 100).toFixed(2)}%`} sub={`n = ${n}`} color="#fbbf24" />
        </div>

        <div style={{ marginTop: '0.8rem' }}>
          <button
            onClick={reset}
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '0.45rem 1rem', cursor: 'pointer' }}
          >
            戦績リセット
          </button>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6 }}>
          <strong style={{ color: '#fbbf24' }}>誕生日のパラドックス:</strong>
          {' '}わずか <strong>23 人</strong>集めれば誕生日が被る確率が <strong>50%</strong> を超える、というのが直感に反する点。
          {' '}スライダーを動かして「同じ被り確率を得るのに何人必要か」を試してみてください。
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}55`, borderRadius: 10, padding: '0.6rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.4rem', fontWeight: 800 }}>{value}</div>
    <div style={{ color: '#475569', fontSize: '0.7rem' }}>{sub}</div>
  </div>
);
